import express, { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { authenticateToken } from "../middlewares/auth.middleware";
import { AddSongToDeckBody, CreateDeckBody, IDeck, UpdateDeckBody } from "../types/deck";
import { ISong, IUserSong } from "../types/song";

const DeckRouter = express.Router();

// Apply auth middleware to all deck endpoints
DeckRouter.use(authenticateToken);

/**
 * POST /api/decks
 * Create a new song deck (collection/playlist) for the current user
 */
DeckRouter.post("/", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const { name, description } = req.body as CreateDeckBody;

        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({
                status: "fail",
                message: "Deck name cannot be empty"
            });
        }

        const now = new Date();
        const newDeck: IDeck = {
            user_id: user._id!,
            name: name.trim(),
            description: description ? description.trim() : null,
            song_ids: [],
            created_at: now,
            updated_at: now
        };

        const result = await db.collection<IDeck>("decks").insertOne(newDeck);
        newDeck._id = result.insertedId;

        return res.status(201).json({
            status: "success",
            message: "Deck created successfully",
            data: {
                id: newDeck._id,
                user_id: newDeck.user_id,
                name: newDeck.name,
                description: newDeck.description,
                total_songs: 0,
                created_at: newDeck.created_at,
                updated_at: newDeck.updated_at
            }
        });
    } catch (err: unknown) {
        console.error("[Create Deck Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * GET /api/decks
 * List all song decks created by the current user
 */
DeckRouter.get("/", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;

        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

        const total = await db.collection<IDeck>("decks").countDocuments({
            user_id: user._id!
        });

        const decks = await db.collection<IDeck>("decks")
            .find({ user_id: user._id! })
            .sort({ updated_at: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        const items = decks.map((d) => ({
            id: d._id,
            user_id: d.user_id,
            name: d.name,
            description: d.description,
            total_songs: (d.song_ids || []).length,
            created_at: d.created_at,
            updated_at: d.updated_at
        }));

        return res.status(200).json({
            status: "success",
            message: "Decks retrieved successfully",
            data: {
                total: total,
                limit: limit,
                offset: offset,
                items: items
            }
        });
    } catch (err: unknown) {
        console.error("[Get Decks Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * Helper to fetch deck details with full song items
 */
async function fetchDeckWithSongs(deckId: ObjectId, userId: ObjectId) {
    const db = getDB();
    const deck = await db.collection<IDeck>("decks").findOne({
        _id: deckId,
        user_id: userId
    });

    if (!deck) return null;

    const songIds = deck.song_ids || [];
    let songs: any[] = [];

    if (songIds.length > 0) {
        const songDocs = await db.collection<ISong>("songs")
            .find({ _id: { $in: songIds } })
            .project({ lyric_rows: 0 })
            .toArray();

        const userSongs = await db.collection<IUserSong>("user_songs")
            .find({ user_id: userId, song_id: { $in: songIds } })
            .toArray();

        const favMap = new Map(userSongs.map((us) => [us.song_id.toString(), us.is_favorite]));
        const songMap = new Map(songDocs.map((s) => [s._id!.toString(), s]));

        // Keep order consistent with deck.song_ids
        songs = songIds.map((sid) => {
            const s = songMap.get(sid.toString());
            if (!s) return null;
            return {
                id: s._id,
                youtube_id: s.youtube_id,
                title: s.title,
                artist: s.artist,
                duration_seconds: s.duration_seconds,
                thumbnail_url: s.thumbnail_url,
                audio_path: s.audio_path,
                language: s.language,
                lyrics_status: s.lyrics_status,
                lyrics_message: s.lyrics_message,
                is_synced: ["synced", "custom"].includes(s.lyrics_status),
                is_favorite: favMap.get(sid.toString()) || false,
                created_at: s.created_at
            };
        }).filter(Boolean);
    }

    return {
        id: deck._id,
        user_id: deck.user_id,
        name: deck.name,
        description: deck.description,
        total_songs: songs.length,
        songs: songs,
        created_at: deck.created_at,
        updated_at: deck.updated_at
    };
}

/**
 * GET /api/decks/:id
 * Get deck details including all songs grouped inside this deck
 */
DeckRouter.get("/:id", async (req: Request, res: Response) => {
    try {
        const user = req.user!;
        const id = req.params.id as string;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid deck id format"
            });
        }

        const deckDetail = await fetchDeckWithSongs(new ObjectId(id), user._id!);
        if (!deckDetail) {
            return res.status(404).json({
                status: "fail",
                message: "Deck not found"
            });
        }

        return res.status(200).json({
            status: "success",
            message: "Deck details retrieved successfully",
            data: deckDetail
        });
    } catch (err: unknown) {
        console.error("[Get Deck Detail Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * PUT /api/decks/:id
 * Update deck name or description
 */
DeckRouter.put("/:id", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;
        const { name, description } = req.body as UpdateDeckBody;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid deck id format"
            });
        }

        const deckOid = new ObjectId(id);
        const existingDeck = await db.collection<IDeck>("decks").findOne({
            _id: deckOid,
            user_id: user._id!
        });

        if (!existingDeck) {
            return res.status(404).json({
                status: "fail",
                message: "Deck not found"
            });
        }

        const updateFields: Partial<IDeck> = {
            updated_at: new Date()
        };

        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({
                    status: "fail",
                    message: "Deck name cannot be empty"
                });
            }
            updateFields.name = name.trim();
        }

        if (description !== undefined) {
            updateFields.description = description ? description.trim() : null;
        }

        await db.collection<IDeck>("decks").updateOne(
            { _id: deckOid },
            { $set: updateFields }
        );

        const updated = await db.collection<IDeck>("decks").findOne({ _id: deckOid });

        return res.status(200).json({
            status: "success",
            message: "Deck updated successfully",
            data: {
                id: updated!._id,
                user_id: updated!.user_id,
                name: updated!.name,
                description: updated!.description,
                total_songs: (updated!.song_ids || []).length,
                created_at: updated!.created_at,
                updated_at: updated!.updated_at
            }
        });
    } catch (err: unknown) {
        console.error("[Update Deck Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * DELETE /api/decks/:id
 * Delete a song deck
 */
DeckRouter.delete("/:id", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid deck id format"
            });
        }

        const deckOid = new ObjectId(id);
        const result = await db.collection<IDeck>("decks").deleteOne({
            _id: deckOid,
            user_id: user._id!
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                status: "fail",
                message: "Deck not found"
            });
        }

        return res.status(200).json({
            status: "success",
            message: "Deck deleted successfully"
        });
    } catch (err: unknown) {
        console.error("[Delete Deck Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * POST /api/decks/:id/songs
 * Add a song into this deck
 */
DeckRouter.post("/:id/songs", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;
        const { song_id } = req.body as AddSongToDeckBody;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid deck id format"
            });
        }

        if (!song_id || !ObjectId.isValid(song_id)) {
            return res.status(400).json({
                status: "fail",
                message: "Valid song_id is required"
            });
        }

        const deckOid = new ObjectId(id);
        const songOid = new ObjectId(song_id);

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

        const song = await db.collection<ISong>("songs").findOne({ _id: songOid });
        if (!song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found"
            });
        }

        // Ensure song is in user's library
        const userSong = await db.collection<IUserSong>("user_songs").findOne({
            user_id: user._id!,
            song_id: songOid
        });

        if (!userSong) {
            await db.collection<IUserSong>("user_songs").insertOne({
                user_id: user._id!,
                song_id: songOid,
                is_favorite: false,
                added_at: new Date()
            });
        }

        // Add song to deck
        await db.collection<IDeck>("decks").updateOne(
            { _id: deckOid },
            {
                $addToSet: { song_ids: songOid },
                $set: { updated_at: new Date() }
            }
        );

        const updatedDeckDetail = await fetchDeckWithSongs(deckOid, user._id!);

        return res.status(200).json({
            status: "success",
            message: "Song added to deck successfully",
            data: updatedDeckDetail
        });
    } catch (err: unknown) {
        console.error("[Add Song To Deck Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * DELETE /api/decks/:id/songs/:song_id
 * Remove a song from this deck
 */
DeckRouter.delete("/:id/songs/:song_id", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;
        const song_id = req.params.song_id as string;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid deck id format"
            });
        }

        if (!song_id || !ObjectId.isValid(song_id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid song id format"
            });
        }

        const deckOid = new ObjectId(id);
        const songOid = new ObjectId(song_id);

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

        await db.collection<IDeck>("decks").updateOne(
            { _id: deckOid },
            {
                $pull: { song_ids: songOid },
                $set: { updated_at: new Date() }
            }
        );

        const updatedDeckDetail = await fetchDeckWithSongs(deckOid, user._id!);

        return res.status(200).json({
            status: "success",
            message: "Song removed from deck successfully",
            data: updatedDeckDetail
        });
    } catch (err: unknown) {
        console.error("[Remove Song From Deck Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

export default DeckRouter;
