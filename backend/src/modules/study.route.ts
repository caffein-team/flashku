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
import { getPhraseWeight, isMeaningfulPhrase, isParticle } from "../utils/japanese";
import { calculateNewLevel } from "../utils/level";
import { decideDifficultyWithAi } from "../utils/ai";

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
 * Generate an adaptive flashcard (1 card per request) tailored to the student's review performance today.
 * Features:
 * - AI-driven adaptive difficulty (progresses to harder words on 'easy', drops to simpler words on 'hard/again')
 * - Random phrase selection from the target difficulty pool
 * - Avoids same lyric row as recently heard flashcards to prevent repetitive audio clips
 */
StudyRouter.post("/session", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const {
            song_id,
            deck_id,
            session_id,
            exclude_phrase_ids = [],
            exclude_row_ids = []
        } = (req.body || {}) as StudySessionBody;

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

        // Retrieve existing session or initialize new one
        let currentSessionId: ObjectId | null = null;
        if (session_id) {
            if (ObjectId.isValid(session_id)) {
                const foundSession = await db.collection<IStudySession>("study_sessions").findOne({
                    _id: new ObjectId(session_id),
                    user_id: user._id!
                });
                if (foundSession) {
                    currentSessionId = foundSession._id!;
                    if (!songOid && foundSession.song_id) songOid = foundSession.song_id;
                    if (!deckOid && foundSession.deck_id) deckOid = foundSession.deck_id;
                }
            }
        }

        if (targetSongIds.length === 0) {
            if (!currentSessionId) {
                const sessionResult = await db.collection<IStudySession>("study_sessions").insertOne({
                    user_id: user._id!,
                    song_id: songOid,
                    deck_id: deckOid,
                    total_phrases: 0,
                    created_at: new Date()
                });
                currentSessionId = sessionResult.insertedId;
            }

            return res.status(200).json({
                status: "success",
                message: "No study cards available in the selected scope",
                data: {
                    session_id: currentSessionId,
                    song_id: songOid,
                    deck_id: deckOid,
                    total_cards: 0,
                    card: null,
                    cards: []
                }
            });
        }

        // Fetch song documents
        const songs = await db.collection<ISong>("songs")
            .find({ _id: { $in: targetSongIds } })
            .toArray();

        // Extract all candidate cards and map phrase to its lyric row
        const candidateCards: Array<{
            card: IStudyCard;
            phrase_id: string;
            lyric_row_id: string | number;
            row_order: number;
            weight: number;
        }> = [];
        const phraseToRowMap = new Map<string, string | number>();

        for (const song of songs) {
            const lyricRows = song.lyric_rows || [];
            for (let rIdx = 0; rIdx < lyricRows.length; rIdx++) {
                const row = lyricRows[rIdx];
                const phrases = row.phrases || [];
                const rowId = row.id || row.row_order || rIdx + 1;

                for (let pIdx = 0; pIdx < phrases.length; pIdx++) {
                    const p = phrases[pIdx];

                    // Filter out phrases that are symbols, punctuation, English words, or grammatical particles
                    if (!isMeaningfulPhrase(p) || isParticle(p)) {
                        continue;
                    }

                    const phraseId = p.phrase_id || p.id || `p_${song._id}_${row.row_order || rIdx + 1}_${p.word_order || pIdx + 1}`;
                    const phraseWeight = p.weight || getPhraseWeight(p.part_of_speech);
                    phraseToRowMap.set(phraseId, rowId);

                    candidateCards.push({
                        phrase_id: phraseId,
                        lyric_row_id: rowId,
                        row_order: row.row_order || rIdx + 1,
                        weight: phraseWeight,
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
                            lyric_row_id: rowId,
                            row_order: row.row_order || rIdx + 1,
                            raw_text: row.raw_text,
                            row_romaji: row.romaji || row.romanization || null,
                            row_romanization: row.romanization || row.romaji || null,
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

        if (candidateCards.length === 0) {
            return res.status(200).json({
                status: "success",
                message: "No Japanese vocabulary phrases found in the songs",
                data: {
                    session_id: currentSessionId,
                    song_id: songOid,
                    deck_id: deckOid,
                    total_cards: 0,
                    card: null,
                    cards: []
                }
            });
        }

        // Attach SRS statistics for candidate phrases
        const candidatePhraseIds = candidateCards.map((c) => c.phrase_id);
        const statsList = await db.collection<IUserPhraseStats>("user_phrase_stats")
            .find({
                user_id: user._id!,
                phrase_id: { $in: candidatePhraseIds }
            })
            .toArray();

        const statsMap = new Map(statsList.map((s) => [s.phrase_id, s]));

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
        }

        // Fetch user's reviews from today to evaluate performance parameters
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const todayAttempts = await db.collection<IStudyAttempt>("study_attempts")
            .find({
                user_id: user._id!,
                created_at: { $gte: startOfDay }
            })
            .sort({ created_at: -1 })
            .toArray();

        const ratingsToday: Record<string, number> = {
            again: 0,
            hard: 0,
            good: 0,
            easy: 0
        };
        for (const attempt of todayAttempts) {
            if (ratingsToday[attempt.rating] !== undefined) {
                ratingsToday[attempt.rating]++;
            }
        }

        // Recent chronological sequence of ratings (latest up to 8 attempts)
        const recentRatings = todayAttempts.slice(0, 8).map((a) => a.rating);
        const lastRating = todayAttempts.length > 0 ? todayAttempts[0].rating : null;

        // Ask AI for adaptive difficulty decision based on today's reviews
        const difficultyDecision = await decideDifficultyWithAi({
            userLevel: user.level || 1,
            totalReviewsToday: todayAttempts.length,
            ratingsToday,
            recentRatings,
            lastRating
        });

        // Track recently heard lyric rows & seen phrases to prevent repetitive music clips
        const recentRowIds = new Set<string | number>(
            (exclude_row_ids || []).map((id) => String(id))
        );

        // Add rows from the user's latest 5 attempts today to avoid repeating clips
        const latestAttempts = todayAttempts.slice(0, 5);
        for (const att of latestAttempts) {
            const rowId = phraseToRowMap.get(att.phrase_id);
            if (rowId !== undefined) {
                recentRowIds.add(String(rowId));
            }
        }

        // Phrases seen recently today or explicitly excluded in request
        const seenPhraseIds = new Set<string>([
            ...(exclude_phrase_ids || []),
            ...todayAttempts.map((a) => a.phrase_id)
        ]);

        const minW = difficultyDecision.target_weight_min;
        const maxW = difficultyDecision.target_weight_max;

        // Categorize candidate cards into priority tiers:
        // 1. Unseen phrase + Different lyric row + Matches AI target difficulty
        // 2. Unseen phrase + Different lyric row (flexible weight)
        // 3. Different lyric row + Matches AI target difficulty
        // 4. Matches AI target difficulty (same row fallback if limited)
        // 5. Any candidate card
        const tier1 = candidateCards.filter(
            (c) =>
                !seenPhraseIds.has(c.phrase_id) &&
                !recentRowIds.has(String(c.lyric_row_id)) &&
                c.weight >= minW &&
                c.weight <= maxW
        );

        const tier2 = candidateCards.filter(
            (c) =>
                !seenPhraseIds.has(c.phrase_id) &&
                !recentRowIds.has(String(c.lyric_row_id))
        );

        const tier3 = candidateCards.filter(
            (c) =>
                !recentRowIds.has(String(c.lyric_row_id)) &&
                c.weight >= minW &&
                c.weight <= maxW
        );

        const tier4 = candidateCards.filter(
            (c) => c.weight >= minW && c.weight <= maxW
        );

        const pool =
            tier1.length > 0
                ? tier1
                : tier2.length > 0
                ? tier2
                : tier3.length > 0
                ? tier3
                : tier4.length > 0
                ? tier4
                : candidateCards;

        // Random selection from the best available candidate pool!
        const randomIndex = Math.floor(Math.random() * pool.length);
        const selectedCard = pool[randomIndex].card;

        // Session record management
        const now = new Date();
        if (currentSessionId) {
            await db.collection<IStudySession>("study_sessions").updateOne(
                { _id: currentSessionId },
                {
                    $inc: { total_phrases: 1 }
                }
            );
        } else {
            const sessionInsert = await db.collection<IStudySession>("study_sessions").insertOne({
                user_id: user._id!,
                song_id: songOid,
                deck_id: deckOid,
                total_phrases: 1,
                created_at: now
            });
            currentSessionId = sessionInsert.insertedId;
        }

        return res.status(200).json({
            status: "success",
            message: "Study flashcard retrieved successfully",
            data: {
                session_id: currentSessionId,
                song_id: songOid,
                deck_id: deckOid,
                difficulty_decision: difficultyDecision,
                card: selectedCard,
                cards: [selectedCard], // Backward-compatibility
                total_cards: 1
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
        // Every card review completion grants 10 XP
        const xpEarned = 10;

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

        // User Progression: Award 10 XP and calculate level progression
        const freshUser = await db.collection<IUser>("users").findOne({ _id: user._id! });
        const levelProg = calculateNewLevel(
            freshUser?.level ?? 1,
            freshUser?.xp ?? 0,
            freshUser?.total_xp ?? 0,
            xpEarned
        );

        await db.collection<IUser>("users").updateOne(
            { _id: user._id! },
            {
                $set: {
                    level: levelProg.level,
                    xp: levelProg.xp,
                    total_xp: levelProg.total_xp,
                    updated_at: now
                }
            }
        );

        return res.status(200).json({
            status: "success",
            message: levelProg.leveled_up
                ? `Card review recorded! Level Up! You reached Level ${levelProg.level}!`
                : "Card review recorded successfully",
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
                user_level: levelProg.level,
                user_xp: levelProg.xp,
                xp_required: levelProg.xp_required,
                total_xp: levelProg.total_xp,
                xp_progress_percentage: levelProg.xp_progress_percentage,
                leveled_up: levelProg.leveled_up
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
