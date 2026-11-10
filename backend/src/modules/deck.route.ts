import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../config/db";
import { authenticate } from "../middlewares/auth.middleware";
import { IDeck, IDeckHasSong, ISong, IUserHasSong } from "../types";

const DeckRouter = express.Router();

async function getDeckWithSongs(userId: string, deckId: string) {
    const db = getDB();

    const deck = await db.collection<IDeck>("decks").findOne({ id: deckId, user_id: userId });
    if (!deck) return null;

    const deckSongs = await db
        .collection<IDeckHasSong>("deck_has_songs")
        .find({ deck_id: deckId })
        .sort({ added_at: -1 })
        .toArray();

    const songIds = deckSongs.map((ds) => ds.song_id);
    const songs = await db
        .collection<ISong>("songs")
        .find({ id: { $in: songIds } })
        .toArray();

    const userHasSongs = await db
        .collection<IUserHasSong>("user_has_songs")
        .find({ user_id: userId, song_id: { $in: songIds } })
        .toArray();

    const favMap = new Map(userHasSongs.map((uhs) => [uhs.song_id, uhs.is_favorite]));
    const songMap = new Map(songs.map((s) => [s.id, s]));

    const songResponses = deckSongs
        .map((ds) => {
            const s = songMap.get(ds.song_id);
            if (!s) return null;
            return {
                id: s.id,
                youtube_id: s.youtube_id,
                title: s.title,
                artist: s.artist || null,
                duration_seconds: s.duration_seconds || null,
                thumbnail_url: s.thumbnail_url || null,
                audio_path: s.audio_path,
                language: s.language || "ja",
                lyrics_status: s.lyrics_status || "not_found",
                lyrics_message: s.lyrics_message || null,
                is_synced: s.lyrics_status === "synced" || s.lyrics_status === "custom",
                is_favorite: favMap.get(s.id) || false,
                created_at: s.created_at,
            };
        })
        .filter(Boolean);

    return {
        id: deck.id,
        user_id: deck.user_id,
        name: deck.name,
        description: deck.description || null,
        total_songs: songResponses.length,
        songs: songResponses,
        created_at: deck.created_at,
        updated_at: deck.updated_at,
    };
}

// POST /api/decks
DeckRouter.post("", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const { name, description } = req.body;

        const cleanName = (name || "").trim();
        if (!cleanName) {
            return res.status(400).json({ detail: "Deck name cannot be empty." });
        }

        const now = new Date();
        const newDeck: IDeck = {
            id: uuidv4(),
            user_id: currentUser.id,
            name: cleanName,
            description: description ? description.trim() : null,
            created_at: now,
            updated_at: now,
        };

        await db.collection("decks").insertOne(newDeck);

        return res.status(201).json({
            id: newDeck.id,
            user_id: newDeck.user_id,
            name: newDeck.name,
            description: newDeck.description,
            total_songs: 0,
            created_at: newDeck.created_at,
            updated_at: newDeck.updated_at,
        });
    } catch (err) {
        console.error("Create deck error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// GET /api/decks
DeckRouter.get("", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

        const total = await db.collection("decks").countDocuments({ user_id: currentUser.id });

        const decks = await db
            .collection<IDeck>("decks")
            .find({ user_id: currentUser.id })
            .sort({ updated_at: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        const deckIds = decks.map((d) => d.id);
        const songCounts = await db
            .collection<IDeckHasSong>("deck_has_songs")
            .aggregate<{ _id: string; count: number }>([
                { $match: { deck_id: { $in: deckIds } } },
                { $group: { _id: "$deck_id", count: { $sum: 1 } } },
            ])
            .toArray();

        const countMap = new Map(songCounts.map((sc) => [sc._id, sc.count]));

        const items = decks.map((d) => ({
            id: d.id,
            user_id: d.user_id,
            name: d.name,
            description: d.description || null,
            total_songs: countMap.get(d.id) || 0,
            created_at: d.created_at,
            updated_at: d.updated_at,
        }));

        return res.status(200).json({
            items,
            total,
            limit,
            offset,
        });
    } catch (err) {
        console.error("Get decks error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// GET /api/decks/:deck_id
DeckRouter.get("/:deck_id", authenticate, async (req: Request, res: Response) => {
    try {
        const currentUser = req.user!;
        const deckId = String(req.params.deck_id);

        const deckDetail = await getDeckWithSongs(currentUser.id, deckId);
        if (!deckDetail) {
            return res.status(404).json({ detail: "Deck not found." });
        }

        return res.status(200).json(deckDetail);
    } catch (err) {
        console.error("Get deck detail error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// PUT /api/decks/:deck_id
DeckRouter.put("/:deck_id", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const deckId = String(req.params.deck_id);
        const { name, description } = req.body;

        const existing = await db.collection<IDeck>("decks").findOne({ id: deckId, user_id: currentUser.id });
        if (!existing) {
            return res.status(404).json({ detail: "Deck not found." });
        }

        const updateFields: any = { updated_at: new Date() };

        if (name !== undefined) {
            const cleanName = (name || "").trim();
            if (!cleanName) {
                return res.status(400).json({ detail: "Deck name cannot be empty." });
            }
            updateFields.name = cleanName;
        }

        if (description !== undefined) {
            updateFields.description = description ? description.trim() : null;
        }

        await db.collection("decks").updateOne({ id: deckId }, { $set: updateFields });

        const updated = await db.collection<IDeck>("decks").findOne({ id: deckId });
        const totalSongs = await db.collection("deck_has_songs").countDocuments({ deck_id: deckId });

        return res.status(200).json({
            id: updated!.id,
            user_id: updated!.user_id,
            name: updated!.name,
            description: updated!.description || null,
            total_songs: totalSongs,
            created_at: updated!.created_at,
            updated_at: updated!.updated_at,
        });
    } catch (err) {
        console.error("Update deck error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// DELETE /api/decks/:deck_id
DeckRouter.delete("/:deck_id", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const deckId = String(req.params.deck_id);

        const existing = await db.collection<IDeck>("decks").findOne({ id: deckId, user_id: currentUser.id });
        if (!existing) {
            return res.status(404).json({ detail: "Deck not found." });
        }

        await db.collection("decks").deleteOne({ id: deckId });
        await db.collection("deck_has_songs").deleteMany({ deck_id: deckId });

        return res.status(200).json({ message: "Deck deleted successfully." });
    } catch (err) {
        console.error("Delete deck error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/decks/:deck_id/songs
DeckRouter.post("/:deck_id/songs", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const deckId = String(req.params.deck_id);
        const { song_id } = req.body;

        const deck = await db.collection<IDeck>("decks").findOne({ id: deckId, user_id: currentUser.id });
        if (!deck) {
            return res.status(404).json({ detail: "Deck not found." });
        }

        const song = await db.collection<ISong>("songs").findOne({ id: song_id });
        if (!song) {
            return res.status(404).json({ detail: "Song not found." });
        }

        // Ensure in user's library
        await db.collection("user_has_songs").updateOne(
            { user_id: currentUser.id, song_id },
            {
                $setOnInsert: {
                    id: uuidv4(),
                    user_id: currentUser.id,
                    song_id,
                    is_favorite: false,
                    added_at: new Date(),
                },
            },
            { upsert: true }
        );

        // Add to deck
        await db.collection("deck_has_songs").updateOne(
            { deck_id: deckId, song_id },
            {
                $setOnInsert: {
                    deck_id: deckId,
                    song_id,
                    added_at: new Date(),
                },
            },
            { upsert: true }
        );

        const deckDetail = await getDeckWithSongs(currentUser.id, deckId);
        return res.status(200).json(deckDetail);
    } catch (err) {
        console.error("Add song to deck error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// DELETE /api/decks/:deck_id/songs/:song_id
DeckRouter.delete("/:deck_id/songs/:song_id", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const deckId = String(req.params.deck_id);
        const songId = String(req.params.song_id);

        const deck = await db.collection<IDeck>("decks").findOne({ id: deckId, user_id: currentUser.id });
        if (!deck) {
            return res.status(404).json({ detail: "Deck not found." });
        }

        await db.collection("deck_has_songs").deleteOne({ deck_id: deckId, song_id: songId });

        const deckDetail = await getDeckWithSongs(currentUser.id, deckId);
        return res.status(200).json(deckDetail);
    } catch (err) {
        console.error("Remove song from deck error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

export default DeckRouter;
