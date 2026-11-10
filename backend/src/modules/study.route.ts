import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../config/db";
import { authenticate } from "../middlewares/auth.middleware";
import {
    IDeck,
    IDeckHasSong,
    ILyricRow,
    IPhrase,
    ISong,
    IStudyAttempt,
    IStudySession,
    IUser,
    IUserHasSong,
    IUserPhraseStats,
} from "../types";

const StudyRouter = express.Router();

const RATING_MAP: Record<string, { grade: number; xp: number }> = {
    again: { grade: 1, xp: 2 },
    hard: { grade: 3, xp: 5 },
    good: { grade: 4, xp: 10 },
    easy: { grade: 5, xp: 15 },
};

// POST /api/study/session
StudyRouter.post("/session", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const { song_id, deck_id, limit: rawLimit } = req.body;
        const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 20, 1), 100);

        let targetSongIds: string[] = [];

        if (song_id) {
            const song = await db.collection<ISong>("songs").findOne({ id: song_id });
            if (!song) {
                return res.status(404).json({ detail: "Song not found." });
            }
            targetSongIds = [song_id];
        } else if (deck_id) {
            const deck = await db.collection<IDeck>("decks").findOne({ id: deck_id, user_id: currentUser.id });
            if (!deck) {
                return res.status(404).json({ detail: "Deck not found." });
            }
            const deckSongs = await db.collection<IDeckHasSong>("deck_has_songs").find({ deck_id }).toArray();
            targetSongIds = deckSongs.map((ds) => ds.song_id);
        } else {
            const userSongs = await db.collection<IUserHasSong>("user_has_songs").find({ user_id: currentUser.id }).toArray();
            targetSongIds = userSongs.map((us) => us.song_id);
        }

        if (targetSongIds.length === 0) {
            const session: IStudySession = {
                id: uuidv4(),
                user_id: currentUser.id,
                song_id: song_id || null,
                deck_id: deck_id || null,
                total_phrases: 0,
                created_at: new Date(),
            };
            await db.collection("study_sessions").insertOne(session);
            return res.status(201).json({
                session_id: session.id,
                song_id: session.song_id,
                deck_id: session.deck_id,
                total_cards: 0,
                cards: [],
            });
        }

        // Fetch phrases for target songs
        const phrases = await db
            .collection<IPhrase>("phrases")
            .find({ song_id: { $in: targetSongIds } })
            .toArray();

        const phraseIds = phrases.map((p) => p.id);

        // Fetch user stats for these phrases
        const now = new Date();
        const phraseStats = await db
            .collection<IUserPhraseStats>("user_phrase_stats")
            .find({ user_id: currentUser.id, phrase_id: { $in: phraseIds } })
            .toArray();

        const statsMap = new Map<string, IUserPhraseStats>(phraseStats.map((s) => [s.phrase_id, s]));

        // Filter phrases that are due for review (no stats yet OR next_review_at <= now)
        const duePhrases = phrases.filter((p) => {
            const stat = statsMap.get(p.id);
            if (!stat || !stat.next_review_at) return true;
            return new Date(stat.next_review_at) <= now;
        });

        // Sort: never reviewed first (next_review_at is null), then earliest next_review_at, then word order
        duePhrases.sort((a, b) => {
            const statA = statsMap.get(a.id);
            const statB = statsMap.get(b.id);
            const timeA = statA?.next_review_at ? new Date(statA.next_review_at).getTime() : 0;
            const timeB = statB?.next_review_at ? new Date(statB.next_review_at).getTime() : 0;

            if (timeA === 0 && timeB !== 0) return -1;
            if (timeA !== 0 && timeB === 0) return 1;
            if (timeA !== timeB) return timeA - timeB;
            return a.word_order - b.word_order;
        });

        const selectedPhrases = duePhrases.slice(0, limit);

        // Fetch associated lyric rows & songs for context
        const lyricRowIds = Array.from(new Set(selectedPhrases.map((p) => p.lyric_row_id)));
        const lyricRows = await db
            .collection<ILyricRow>("lyric_rows")
            .find({ id: { $in: lyricRowIds } })
            .toArray();
        const rowMap = new Map<string, ILyricRow>(lyricRows.map((r) => [r.id, r]));

        const songs = await db
            .collection<ISong>("songs")
            .find({ id: { $in: targetSongIds } })
            .toArray();
        const songMap = new Map<string, ISong>(songs.map((s) => [s.id, s]));

        const cards = selectedPhrases.map((p) => {
            const row = rowMap.get(p.lyric_row_id);
            const s = songMap.get(p.song_id);
            const stat = statsMap.get(p.id);

            return {
                phrase_id: p.id,
                surface_form: p.surface_form,
                dictionary_form: p.dictionary_form,
                reading: p.reading,
                romaji: p.romaji || null,
                romanization: p.romanization || p.romaji || null,
                part_of_speech: p.part_of_speech || null,
                meaning: p.meaning || null,
                lyric_row_id: p.lyric_row_id,
                row_order: row ? row.row_order : 1,
                raw_text: row ? row.raw_text : "",
                start_time: row ? row.start_time : 0.0,
                end_time: row ? row.end_time : 0.0,
                translation: row ? row.translation || null : null,
                song_id: p.song_id,
                song_title: s ? s.title : "Unknown",
                song_artist: s ? s.artist || null : null,
                song_language: s ? s.language || "ja" : "ja",
                audio_path: s ? s.audio_path : "",
                thumbnail_url: s ? s.thumbnail_url || null : null,
                repetition_count: stat ? stat.repetition_count : 0,
                interval_days: stat ? stat.interval_days : 1.0,
                ease_factor: stat ? stat.ease_factor : 2.5,
                next_review_at: stat ? stat.next_review_at : null,
                last_rating: stat ? stat.last_rating || null : null,
            };
        });

        const sessionId = uuidv4();
        const session: IStudySession = {
            id: sessionId,
            user_id: currentUser.id,
            song_id: song_id || null,
            deck_id: deck_id || null,
            total_phrases: cards.length,
            created_at: new Date(),
        };

        await db.collection("study_sessions").insertOne(session);

        return res.status(201).json({
            session_id: session.id,
            song_id: session.song_id,
            deck_id: session.deck_id,
            total_cards: cards.length,
            cards,
        });
    } catch (err) {
        console.error("Create study session error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/study/review
StudyRouter.post("/review", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const { session_id, phrase_id, rating } = req.body;

        const session = await db.collection<IStudySession>("study_sessions").findOne({
            id: session_id,
            user_id: currentUser.id,
        });

        if (!session) {
            return res.status(404).json({ detail: "Study session not found or does not belong to you." });
        }

        const phrase = await db.collection<IPhrase>("phrases").findOne({ id: phrase_id });
        if (!phrase) {
            return res.status(404).json({ detail: "Phrase not found." });
        }

        const ratingInfo = RATING_MAP[rating];
        if (!ratingInfo) {
            return res.status(400).json({
                detail: `Invalid rating '${rating}'. Allowed values: ['again', 'hard', 'good', 'easy']`,
            });
        }

        const { grade, xp: xpEarned } = ratingInfo;

        // Record study attempt
        const attempt: IStudyAttempt = {
            id: uuidv4(),
            session_id,
            user_id: currentUser.id,
            phrase_id,
            rating,
            created_at: new Date(),
        };
        await db.collection("study_attempts").insertOne(attempt);

        // Fetch current phrase stats
        const currentStats = await db.collection<IUserPhraseStats>("user_phrase_stats").findOne({
            user_id: currentUser.id,
            phrase_id,
        });

        const currentReps = currentStats ? currentStats.repetition_count : 0;
        const currentInterval = currentStats ? currentStats.interval_days : 1.0;
        const currentEf = currentStats ? currentStats.ease_factor : 2.5;

        // SuperMemo SM-2 calculation
        let newEf = currentEf + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
        newEf = Math.max(1.3, Math.round(newEf * 100) / 100);

        let newReps: number;
        let newInterval: number;

        if (grade < 3) {
            newReps = 0;
            newInterval = 1.0;
        } else {
            newReps = currentReps + 1;
            if (newReps === 1) {
                newInterval = rating === "easy" ? 2.0 : 1.0;
            } else if (newReps === 2) {
                newInterval = rating === "hard" ? 4.0 : rating === "easy" ? 8.0 : 6.0;
            } else {
                const baseInterval = currentInterval * newEf;
                if (rating === "hard") {
                    newInterval = Math.max(baseInterval * 0.8, 1.5);
                } else if (rating === "easy") {
                    newInterval = baseInterval * 1.3;
                } else {
                    newInterval = baseInterval;
                }
            }
        }

        newInterval = Math.round(newInterval * 10) / 10;
        const nextReviewAt = new Date(Date.now() + newInterval * 24 * 60 * 60 * 1000);

        await db.collection("user_phrase_stats").updateOne(
            { user_id: currentUser.id, phrase_id },
            {
                $set: {
                    repetition_count: newReps,
                    interval_days: newInterval,
                    ease_factor: newEf,
                    next_review_at: nextReviewAt,
                    last_rating: rating,
                    updated_at: new Date(),
                },
                $setOnInsert: {
                    id: uuidv4(),
                    user_id: currentUser.id,
                    phrase_id,
                },
            },
            { upsert: true }
        );

        // Progression: update user level if repetitions milestone reached (every 10 repetitions)
        let userLevel = currentUser.level || 1;
        if (newReps > 0 && newReps % 10 === 0) {
            await db.collection("users").updateOne(
                { id: currentUser.id },
                { $inc: { level: 1 }, $set: { updated_at: new Date() } }
            );
            const userUpdated = await db.collection<IUser>("users").findOne({ id: currentUser.id });
            if (userUpdated && userUpdated.level) {
                userLevel = userUpdated.level;
            }
        }

        return res.status(200).json({
            phrase_id,
            session_id,
            rating,
            repetition_count: newReps,
            interval_days: newInterval,
            ease_factor: newEf,
            next_review_at: nextReviewAt,
            xp_earned: xpEarned,
            user_level: userLevel,
        });
    } catch (err) {
        console.error("Review card error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

export default StudyRouter;
