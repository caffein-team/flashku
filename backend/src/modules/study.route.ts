import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { authenticateToken } from "../middlewares/auth.middleware";
import { IDeck } from "../types/deck";
import { ISong, IUserSong } from "../types/song";
import {
    IStudyAttempt,
    IStudyCard,
    IStudySession,
    IUserPhraseStats,
    SRSGradeRating,
    StudyReviewBody,
    StudySessionBody
} from "../types/study";
import { IUser } from "../types/auth";
import { getPhraseWeight, isMeaningfulPhrase } from "../utils/japanese";

const StudyRouter = express.Router();

// Apply auth middleware to all study endpoints
StudyRouter.use(authenticateToken);

const RATING_MAP: Record<SRSGradeRating, { grade: number; xp: number }> = {
    again: { grade: 1, xp: 2 },
    hard: { grade: 3, xp: 5 },
    good: { grade: 4, xp: 10 },
    easy: { grade: 5, xp: 15 }
};

/**
 * POST /api/study/session
 * Create a new flashcard study session with due Japanese phrases
 */
StudyRouter.post("/session", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const { song_id, deck_id, limit: rawLimit } = (req.body || {}) as StudySessionBody;
        const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 100);

        let targetSongIds: ObjectId[] = [];
        let songOid: ObjectId | null = null;
        let deckOid: ObjectId | null = null;

        if (song_id) {
            if (!ObjectId.isValid(song_id)) {
                return res.status(400).json({
                    status: "fail",
                    message: "Invalid song_id format"
                });
            }
            songOid = new ObjectId(song_id);
            const song = await db.collection<ISong>("songs").findOne({ _id: songOid });
            if (!song) {
                return res.status(404).json({
                    status: "fail",
                    message: "Song not found"
                });
            }
            targetSongIds = [songOid];
        } else if (deck_id) {
            if (!ObjectId.isValid(deck_id)) {
                return res.status(400).json({
                    status: "fail",
                    message: "Invalid deck_id format"
                });
            }
            deckOid = new ObjectId(deck_id);
            const deck = await db.collection<IDeck>("decks").findOne({
                _id: deckOid,
                user_id: user._id!
            });
            if (!deck) {
                return res.status(404).json({
                    status: "fail",
                    message: "Deck not found"
                });
            }
            targetSongIds = deck.song_ids || [];
        } else {
            const userSongs = await db.collection<IUserSong>("user_songs")
                .find({ user_id: user._id! })
                .toArray();
            targetSongIds = userSongs.map((us) => us.song_id);
        }

        if (targetSongIds.length === 0) {
            const sessionResult = await db.collection<IStudySession>("study_sessions").insertOne({
                user_id: user._id!,
                song_id: songOid,
                deck_id: deckOid,
                total_phrases: 0,
                created_at: new Date()
            });

            return res.status(201).json({
                status: "success",
                message: "No study cards available in the selected scope",
                data: {
                    session_id: sessionResult.insertedId,
                    song_id: songOid,
                    deck_id: deckOid,
                    total_cards: 0,
                    cards: []
                }
            });
        }

        // Fetch song documents
        const songs = await db.collection<ISong>("songs")
            .find({ _id: { $in: targetSongIds } })
            .toArray();

        // Extract all candidate cards from songs
        const candidateCards: Array<{
            card: IStudyCard;
            phrase_id: string;
        }> = [];

        for (const song of songs) {
            const lyricRows = song.lyric_rows || [];
            for (let rIdx = 0; rIdx < lyricRows.length; rIdx++) {
                const row = lyricRows[rIdx];
                const phrases = row.phrases || [];
                for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
                    const p = phrases[pIdx];

                    // Filter out phrases that are only symbols, punctuation, or non-meaningful tokens
                    if (!isMeaningfulPhrase(p)) {
                        continue;
                    }

                    const phraseId = p.phrase_id || p.id || `p_${song._id}_${row.row_order || rIdx + 1}_${p.word_order || pIdx + 1}`;
                    const phraseWeight = p.weight || getPhraseWeight(p.part_of_speech);

                    candidateCards.push({
                        phrase_id: phraseId,
                        card: {
                            phrase_id: phraseId,
                            surface_form: p.surface_form,
                            dictionary_form: p.dictionary_form,
                            reading: p.reading,
                            romaji: p.romaji,
                            romanization: p.romanization || p.romaji,
                            part_of_speech: p.part_of_speech,
                            weight: phraseWeight,
                            meaning: p.meaning,
                            lyric_row_id: row.id || row.row_order || rIdx + 1,
                            row_order: row.row_order || rIdx + 1,
                            raw_text: row.raw_text,
                            start_time: row.start_time,
                            end_time: row.end_time,
                            translation: row.translation,
                            song_id: song._id!.toString(),
                            song_title: song.title,
                            song_artist: song.artist,
                            song_language: song.language || "ja",
                            audio_path: song.audio_path,
                            thumbnail_url: song.thumbnail_url,
                            repetition_count: 0,
                            interval_days: 1.0,
                            ease_factor: 2.5,
                            next_review_at: null,
                            last_rating: null
                        }
                    });
                }
            }
        }

        const candidatePhraseIds = candidateCards.map((c) => c.phrase_id);
        const statsList = candidatePhraseIds.length > 0
            ? await db.collection<IUserPhraseStats>("user_phrase_stats")
                .find({
                    user_id: user._id!,
                    phrase_id: { $in: candidatePhraseIds }
                })
                .toArray()
            : [];

        const statsMap = new Map(statsList.map((s) => [s.phrase_id, s]));
        const now = new Date();

        // Attach stats and filter for cards due for review
        const dueCards: Array<{
            card: IStudyCard;
            priority_score: number;
            next_review_at: Date | null;
            row_order: number;
        }> = [];

        for (const item of candidateCards) {
            const stats = statsMap.get(item.phrase_id);
            if (stats) {
                item.card.repetition_count = stats.repetition_count;
                item.card.interval_days = stats.interval_days;
                item.card.ease_factor = stats.ease_factor;
                item.card.next_review_at = stats.next_review_at;
                item.card.last_rating = stats.last_rating;
                if (stats.weight) item.card.weight = stats.weight;
                if (stats.lapse_count) item.card.lapse_count = stats.lapse_count;
            }

            // A card is due if it has never been reviewed or review date has passed
            const isDue = !stats?.next_review_at || new Date(stats.next_review_at) <= now;
            if (isDue) {
                const nextReviewDate = stats?.next_review_at ? new Date(stats.next_review_at) : null;
                const weight = item.card.weight || 1;

                // Priority score:
                // High-value vocabulary (Verbs/Nouns: 10, Adjectives: 8, Adverbs: 7) and cards that
                // the user finds difficult (again/hard/low EF/high lapses) are prioritized to appear frequently.
                let priorityScore: number;
                if (!nextReviewDate) {
                    // New unreviewed cards: score directly proportional to vocabulary value (10 to 100)
                    priorityScore = weight * 10;
                } else {
                    // Cards due for review: base 100 ensures scheduled memory reviews are sustained
                    let difficultyBoost = 0;
                    const lastRating = stats?.last_rating;
                    if (lastRating === "again") {
                        difficultyBoost += 60; // Cards failed on last attempt get highest priority to reappear!
                    } else if (lastRating === "hard") {
                        difficultyBoost += 35; // Cards marked difficult get strong priority boost
                    } else if (lastRating === "easy") {
                        difficultyBoost -= 15; // Easy cards yield priority to harder cards
                    }

                    // Historical difficulty bonus: low ease factor (< 2.5) or frequent lapses
                    const currentEf = stats?.ease_factor || 2.5;
                    if (currentEf < 2.5) {
                        difficultyBoost += Math.round((2.5 - currentEf) * 20); // up to +24 for EF 1.3
                    }
                    const lapses = stats?.lapse_count || 0;
                    if (lapses > 0) {
                        difficultyBoost += Math.min(lapses * 10, 40); // up to +40 for persistent trouble words
                    }

                    // Hours overdue bonus
                    const overdueHours = Math.max(0, (now.getTime() - nextReviewDate.getTime()) / (1000 * 60 * 60));
                    const overdueBonus = Math.min((overdueHours / 24) * 10, 50);

                    priorityScore = 100 + difficultyBoost + overdueBonus + (weight * 5);
                }

                dueCards.push({
                    card: item.card,
                    priority_score: priorityScore,
                    next_review_at: nextReviewDate,
                    row_order: item.card.row_order
                });
            }
        }

        // Sort by priority score descending:
        // Highest weighted vocabulary and most urgent due cards appear first!
        // If priority scores tie, preserve chronological lyric row order.
        dueCards.sort((a, b) => {
            if (b.priority_score !== a.priority_score) {
                return b.priority_score - a.priority_score;
            }
            return a.row_order - b.row_order;
        });

        const selectedCards = dueCards.slice(0, limit).map((d) => d.card);

        // Record study session
        const sessionResult = await db.collection<IStudySession>("study_sessions").insertOne({
            user_id: user._id!,
            song_id: songOid,
            deck_id: deckOid,
            total_phrases: selectedCards.length,
            created_at: now
        });

        return res.status(201).json({
            status: "success",
            message: "Study session started successfully",
            data: {
                session_id: sessionResult.insertedId,
                song_id: songOid,
                deck_id: deckOid,
                total_cards: selectedCards.length,
                cards: selectedCards
            }
        });
    } catch (err: unknown) {
        console.error("[Start Study Session Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * POST /api/study/review
 * Submit spaced repetition review rating (again, hard, good, easy) for a phrase
 */
StudyRouter.post("/review", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const { session_id, phrase_id, rating } = (req.body || {}) as StudyReviewBody;

        if (!session_id || !ObjectId.isValid(session_id)) {
            return res.status(400).json({
                status: "fail",
                message: "Valid session_id is required"
            });
        }

        if (!phrase_id || typeof phrase_id !== "string") {
            return res.status(400).json({
                status: "fail",
                message: "phrase_id is required"
            });
        }

        const validRatings: SRSGradeRating[] = ["again", "hard", "good", "easy"];
        if (!rating || !validRatings.includes(rating)) {
            return res.status(400).json({
                status: "fail",
                message: `Invalid rating '${rating}'. Allowed values: ${validRatings.join(", ")}`
            });
        }

        const session = await db.collection<IStudySession>("study_sessions").findOne({
            _id: new ObjectId(session_id),
            user_id: user._id!
        });

        if (!session) {
            return res.status(404).json({
                status: "fail",
                message: "Study session not found or does not belong to you"
            });
        }

        const ratingInfo = RATING_MAP[rating];
        const grade = ratingInfo.grade;
        const xpEarned = ratingInfo.xp;

        // Record study attempt
        const now = new Date();
        await db.collection<IStudyAttempt>("study_attempts").insertOne({
            session_id: session._id!,
            user_id: user._id!,
            phrase_id: phrase_id,
            rating: rating,
            created_at: now
        });

        // Retrieve current phrase stats
        const currentStats = await db.collection<IUserPhraseStats>("user_phrase_stats").findOne({
            user_id: user._id!,
            phrase_id: phrase_id
        });

        const currentReps = currentStats?.repetition_count || 0;
        const currentInterval = currentStats?.interval_days || 1.0;
        const currentEf = currentStats?.ease_factor || 2.5;

        // Resolve phrase weight
        let phraseWeight = currentStats?.weight;
        if (!phraseWeight) {
            const songDoc = await db.collection<ISong>("songs").findOne(
                { "lyric_rows.phrases.phrase_id": phrase_id },
                { projection: { "lyric_rows.phrases.$": 1 } }
            );
            const foundPhrase = songDoc?.lyric_rows?.[0]?.phrases?.[0];
            if (foundPhrase) {
                phraseWeight = foundPhrase.weight || getPhraseWeight(foundPhrase.part_of_speech);
            } else {
                phraseWeight = 5;
            }
        }

        // SuperMemo SM-2 Calculation
        let newEf = currentEf + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
        newEf = Math.max(1.3, Number(newEf.toFixed(2)));

        let newReps: number;
        let newInterval: number;
        let newLapseCount = currentStats?.lapse_count || 0;

        if (grade < 3) {
            // "again" - user struggled or failed to recall the phrase:
            // Reset repetitions, increment lapse count, and set tight interval (0.25 day = 6 hours)
            // so this difficult card is ready to be practiced again promptly!
            newReps = 0;
            newInterval = 0.25;
            newLapseCount += 1;
        } else {
            newReps = currentReps + 1;
            if (newReps === 1) {
                // Repetition 1: "hard" reviews sooner (0.8 day); "good": 1 day; "easy": 2 days
                newInterval = rating === "hard" ? 0.8 : (rating === "easy" ? 2.0 : 1.0);
            } else if (newReps === 2) {
                // Repetition 2: "hard": 2.5 days (vs good: 6 days, easy: 8 days)
                newInterval = rating === "hard" ? 2.5 : (rating === "easy" ? 8.0 : 6.0);
            } else {
                const baseInterval = currentInterval * newEf;
                if (rating === "hard") {
                    // Difficult cards: shorter interval multiplier (0.7x) to ensure frequent review
                    newInterval = Math.max(baseInterval * 0.7, 1.2);
                } else if (rating === "easy") {
                    newInterval = baseInterval * 1.3;
                } else {
                    newInterval = baseInterval;
                }
            }
        }

        // Weight-based interval pacing:
        // Lower weight phrases (particles, interjections, weight <= 2) expand intervals faster (1.5x)
        // only when remembered well ("good" / "easy"). If difficult ("again" / "hard"), keep tight intervals!
        if (newReps > 0 && phraseWeight <= 2 && !["again", "hard"].includes(rating)) {
            newInterval = Number((newInterval * 1.5).toFixed(1));
        } else {
            newInterval = Number(newInterval.toFixed(1));
        }

        const nextReviewAt = new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000);

        // Upsert user phrase stats
        await db.collection<IUserPhraseStats>("user_phrase_stats").updateOne(
            {
                user_id: user._id!,
                phrase_id: phrase_id
            },
            {
                $set: {
                    repetition_count: newReps,
                    interval_days: newInterval,
                    ease_factor: newEf,
                    next_review_at: nextReviewAt,
                    last_rating: rating,
                    weight: phraseWeight,
                    lapse_count: newLapseCount,
                    updated_at: now
                }
            },
            { upsert: true }
        );

        // Progression: update user level if repetitions milestone reached (every 10 reps)
        let userLevel = user.level || 1;
        if (newReps > 0 && newReps % 10 === 0) {
            const updatedUserResult = await db.collection<IUser>("users").findOneAndUpdate(
                { _id: user._id! },
                { $inc: { level: 1 } },
                { returnDocument: "after" }
            );
            userLevel = updatedUserResult?.level || (userLevel + 1);
        }

        return res.status(200).json({
            status: "success",
            message: "Card review recorded successfully",
            data: {
                phrase_id: phrase_id,
                session_id: session_id,
                rating: rating,
                weight: phraseWeight,
                repetition_count: newReps,
                interval_days: newInterval,
                ease_factor: newEf,
                lapse_count: newLapseCount,
                next_review_at: nextReviewAt,
                xp_earned: xpEarned,
                user_level: userLevel
            }
        });
    } catch (err: unknown) {
        console.error("[Review Card Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

export default StudyRouter;
