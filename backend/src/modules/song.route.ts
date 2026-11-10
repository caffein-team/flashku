import express, { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { getDB } from "../config/db";
import { authenticate } from "../middlewares/auth.middleware";
import { createLimiter } from "../middlewares/limiter.middleware";
import { ILyricRow, IPhrase, ISong, IUserHasSong } from "../types";
import { checkGeminiQuotaStatus, enrichBatchWithGemini } from "../utils/gemini";
import { tokenizeJapaneseLyric } from "../utils/japanese";
import { cleanTrackAndArtist, fetchLrclibLyrics, parseLrc, parsePlainLyrics } from "../utils/lyrics";
import { extractYoutubeId, fetchYoutubeMetadataAndAudio } from "../utils/youtube";

const SongRouter = express.Router();

export async function populateSongLyrics(songId: string, parsedRows: any[]) {
    const db = getDB();

    // Remove old lyrics and phrases for this song
    await db.collection("lyric_rows").deleteMany({ song_id: songId });
    await db.collection("phrases").deleteMany({ song_id: songId });

    for (const rowData of parsedRows) {
        const lyricRowId = uuidv4();
        const lyricRow: ILyricRow = {
            id: lyricRowId,
            song_id: songId,
            row_order: rowData.row_order,
            raw_text: rowData.raw_text,
            start_time: rowData.start_time,
            end_time: rowData.end_time,
            translation: rowData.translation || null,
            created_at: new Date(),
        };

        await db.collection("lyric_rows").insertOne(lyricRow);

        // Tokenize Japanese text into grammatical phrases
        const phrases = await tokenizeJapaneseLyric(rowData.raw_text);
        if (phrases.length > 0) {
            const phraseDocs: IPhrase[] = phrases.map((p) => ({
                id: uuidv4(),
                lyric_row_id: lyricRowId,
                song_id: songId,
                surface_form: p.surface_form,
                dictionary_form: p.dictionary_form,
                reading: p.reading,
                romaji: p.romaji,
                romanization: p.romanization || p.romaji,
                part_of_speech: p.part_of_speech,
                meaning: p.meaning || null,
                word_order: p.word_order,
                created_at: new Date(),
            }));
            await db.collection("phrases").insertMany(phraseDocs);
        }
    }
}

export async function getSongDetail(userId: string, songId: string) {
    const db = getDB();

    const song = await db.collection<ISong>("songs").findOne({ id: songId });
    if (!song) {
        return null;
    }

    const userSong = await db.collection<IUserHasSong>("user_has_songs").findOne({
        user_id: userId,
        song_id: songId,
    });

    const isFavorite = userSong ? userSong.is_favorite : false;

    const lyricRows = await db
        .collection<ILyricRow>("lyric_rows")
        .find({ song_id: songId })
        .sort({ row_order: 1 })
        .toArray();

    const phrases = await db
        .collection<IPhrase>("phrases")
        .find({ song_id: songId })
        .sort({ word_order: 1 })
        .toArray();

    const phrasesByRow = new Map<string, any[]>();
    for (const p of phrases) {
        const arr = phrasesByRow.get(p.lyric_row_id) || [];
        arr.push({
            id: p.id,
            surface_form: p.surface_form,
            dictionary_form: p.dictionary_form,
            reading: p.reading,
            romaji: p.romaji,
            romanization: p.romanization || p.romaji,
            part_of_speech: p.part_of_speech,
            meaning: p.meaning,
            word_order: p.word_order,
        });
        phrasesByRow.set(p.lyric_row_id, arr);
    }

    const lyricRowResponses = lyricRows.map((r) => ({
        id: r.id,
        row_order: r.row_order,
        raw_text: r.raw_text,
        start_time: r.start_time,
        end_time: r.end_time,
        translation: r.translation || null,
        phrases: phrasesByRow.get(r.id) || [],
    }));

    const isSynced = song.lyrics_status === "synced" || song.lyrics_status === "custom";

    return {
        id: song.id,
        youtube_id: song.youtube_id,
        title: song.title,
        artist: song.artist || null,
        duration_seconds: song.duration_seconds || null,
        thumbnail_url: song.thumbnail_url || null,
        audio_path: song.audio_path,
        language: song.language || "ja",
        lyrics_status: song.lyrics_status || "not_found",
        lyrics_message: song.lyrics_message || null,
        is_synced: isSynced,
        is_favorite: isFavorite,
        created_at: song.created_at,
        lyric_rows: lyricRowResponses,
    };
}

// POST /api/songs/import
SongRouter.post("/import", authenticate, createLimiter(10), async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const { youtube_url, custom_lrc, custom_title, custom_artist, language } = req.body;

        const youtubeId = extractYoutubeId(youtube_url);
        if (!youtubeId) {
            return res.status(400).json({ detail: "Invalid YouTube URL or video ID provided." });
        }

        const targetLang = language || "ja";
        const existingSong = await db.collection<ISong>("songs").findOne({ youtube_id: youtubeId });
        let song: ISong;

        if (existingSong) {
            song = existingSong;
            // Link song to current user if not already linked
            await db.collection("user_has_songs").updateOne(
                { user_id: currentUser.id, song_id: existingSong.id },
                {
                    $setOnInsert: {
                        id: uuidv4(),
                        user_id: currentUser.id,
                        song_id: existingSong.id,
                        is_favorite: false,
                        added_at: new Date(),
                    },
                },
                { upsert: true }
            );

            // If existing lyrics are already synced and no custom LRC is passed, return detail
            if ((existingSong.lyrics_status === "synced" || existingSong.lyrics_status === "custom") && !custom_lrc) {
                const detail = await getSongDetail(currentUser.id, existingSong.id);
                return res.status(201).json(detail);
            }
        } else {
            // Download audio & metadata
            let ytMeta;
            try {
                ytMeta = await fetchYoutubeMetadataAndAudio(youtubeId);
            } catch (err: any) {
                console.error("YouTube download error:", err);
                return res.status(500).json({ detail: `Failed to extract YouTube audio: ${err.message || err}` });
            }

            const rawTitle = ytMeta.title || "Unknown Title";
            const rawArtist = ytMeta.artist || "Unknown Artist";
            const [cleanedTitle, cleanedArtist] = cleanTrackAndArtist(rawTitle, rawArtist);

            const title = custom_title || cleanedTitle;
            const artist = custom_artist || cleanedArtist;
            const durationSeconds = ytMeta.duration_seconds || 0;
            const thumbnailUrl = ytMeta.thumbnail_url;
            const audioPath = ytMeta.audio_path;

            const songId = uuidv4();
            song = {
                id: songId,
                youtube_id: youtubeId,
                title,
                artist,
                duration_seconds: durationSeconds,
                thumbnail_url: thumbnailUrl,
                audio_path: audioPath,
                language: targetLang,
                lyrics_status: "not_found",
                lyrics_message: "Memproses lirik...",
                created_at: new Date(),
            };

            await db.collection("songs").insertOne(song);

            await db.collection("user_has_songs").insertOne({
                id: uuidv4(),
                user_id: currentUser.id,
                song_id: songId,
                is_favorite: false,
                added_at: new Date(),
            });
        }

        // Fetch or parse lyrics
        let parsedRows: any[] = [];
        let lyricsStatus: "synced" | "plain" | "custom" | "not_found" = "not_found";
        let lyricsMessage = "";
        const duration = song.duration_seconds || 180;

        if (custom_lrc) {
            parsedRows = parseLrc(custom_lrc, duration);
            if (parsedRows.length > 0) {
                lyricsStatus = "custom";
                lyricsMessage = `Lirik kustom pengguna berhasil dimuat dan disinkronkan (${parsedRows.length} baris).`;
            } else {
                lyricsStatus = "not_found";
                lyricsMessage = "Format LRC kustom yang diberikan tidak valid atau kosong.";
            }
        } else {
            const lrclibData = await fetchLrclibLyrics(song.title, song.artist || "", duration);
            if (lrclibData && lrclibData.syncedLyrics) {
                parsedRows = parseLrc(lrclibData.syncedLyrics, duration);
                lyricsStatus = "synced";
                lyricsMessage = `Lirik lengkap dan tersinkronisasi presisi (${parsedRows.length} baris).`;
            } else if (lrclibData && lrclibData.plainLyrics) {
                parsedRows = parsePlainLyrics(lrclibData.plainLyrics, duration);
                lyricsStatus = "plain";
                lyricsMessage = `Lirik teks ditemukan tetapi belum memiliki penanda waktu presisi (${parsedRows.length} baris diestimasi). Kosakata tetap dapat dipelajari.`;
            } else {
                lyricsStatus = "not_found";
                lyricsMessage = "Lirik tidak ditemukan di database publik. Anda tetap dapat mendengarkan audio atau mengunggah lirik (LRC) secara manual.";
            }
        }

        if (parsedRows.length > 0) {
            await populateSongLyrics(song.id, parsedRows);
        } else {
            const placeholder = [
                {
                    row_order: 1,
                    raw_text: song.title,
                    start_time: 0.0,
                    end_time: duration > 0 ? duration : 5.0,
                },
            ];
            await populateSongLyrics(song.id, placeholder);
        }

        await db.collection("songs").updateOne(
            { id: song.id },
            { $set: { lyrics_status: lyricsStatus, lyrics_message: lyricsMessage } }
        );

        const detail = await getSongDetail(currentUser.id, song.id);
        return res.status(201).json(detail);
    } catch (err: any) {
        console.error("Song import error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// GET /api/songs
SongRouter.get("", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 20, 1), 100);
        const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

        const total = await db.collection("user_has_songs").countDocuments({ user_id: currentUser.id });

        const userSongs = await db
            .collection<IUserHasSong>("user_has_songs")
            .find({ user_id: currentUser.id })
            .sort({ is_favorite: -1, added_at: -1 })
            .skip(offset)
            .limit(limit)
            .toArray();

        const songIds = userSongs.map((us) => us.song_id);
        const songs = await db
            .collection<ISong>("songs")
            .find({ id: { $in: songIds } })
            .toArray();

        const songMap = new Map(songs.map((s) => [s.id, s]));

        const items = userSongs
            .map((us) => {
                const s = songMap.get(us.song_id);
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
                    is_favorite: us.is_favorite,
                    created_at: s.created_at,
                };
            })
            .filter(Boolean);

        return res.status(200).json({
            items,
            total,
            limit,
            offset,
        });
    } catch (err) {
        console.error("Get user songs error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// GET /api/songs/ai/quota
SongRouter.get("/ai/quota", authenticate, async (req: Request, res: Response) => {
    try {
        const quota = await checkGeminiQuotaStatus();
        return res.status(200).json(quota);
    } catch (err) {
        console.error("Gemini quota error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/songs/:song_id/enrich-ai
SongRouter.post("/:song_id/enrich-ai", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const songId = String(req.params.song_id);
        const targetLanguage = (req.query.target_language as string) || "Indonesian";

        const song = await db.collection<ISong>("songs").findOne({ id: songId });
        if (!song) {
            return res.status(404).json({ detail: "Song not found." });
        }

        const userSong = await db.collection<IUserHasSong>("user_has_songs").findOne({
            user_id: currentUser.id,
            song_id: songId,
        });
        if (!userSong) {
            return res.status(403).json({ detail: "You do not have access to this song." });
        }

        const lyricRows = await db
            .collection<ILyricRow>("lyric_rows")
            .find({ song_id: songId })
            .sort({ row_order: 1 })
            .toArray();

        if (lyricRows.length === 0) {
            return res.status(400).json({ detail: "No lyric rows found for this song." });
        }

        const untranslatedRows = lyricRows
            .filter((r) => !r.translation || !r.translation.trim())
            .map((r) => ({ id: r.id, raw_text: r.raw_text }));

        if (untranslatedRows.length === 0) {
            const detail = await getSongDetail(currentUser.id, songId);
            return res.status(200).json(detail);
        }

        const chunkSize = 20;
        let totalTranslations = 0;
        let totalMeanings = 0;

        for (let i = 0; i < untranslatedRows.length; i += chunkSize) {
            const chunk = untranslatedRows.slice(i, i + chunkSize);
            const enrichResult = await enrichBatchWithGemini(chunk, targetLanguage);

            for (const [rowId, trans] of Object.entries(enrichResult.row_translations)) {
                if (trans && trans.trim()) {
                    await db.collection("lyric_rows").updateOne(
                        { id: rowId },
                        { $set: { translation: trans.trim() } }
                    );
                    totalTranslations++;
                }
            }

            for (const [word, mean] of Object.entries(enrichResult.vocabulary_meanings)) {
                if (word && mean && String(mean).trim()) {
                    const updateRes = await db.collection("phrases").updateMany(
                        {
                            song_id: songId,
                            $or: [{ dictionary_form: word.trim() }, { surface_form: word.trim() }],
                        },
                        { $set: { meaning: String(mean).trim() } }
                    );
                    totalMeanings += updateRes.modifiedCount;
                }
            }

            if (i + chunkSize < untranslatedRows.length) {
                await new Promise((res) => setTimeout(res, 2000));
            }
        }

        if (totalTranslations === 0 && totalMeanings === 0) {
            return res.status(502).json({
                detail: "Gemini API did not return translations or meanings. Please verify your GEMINI_API_KEY quota or try again in a few moments.",
            });
        }

        const detail = await getSongDetail(currentUser.id, songId);
        return res.status(200).json(detail);
    } catch (err) {
        console.error("Enrich AI error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// GET /api/songs/:song_id
SongRouter.get("/:song_id", authenticate, async (req: Request, res: Response) => {
    try {
        const currentUser = req.user!;
        const songId = String(req.params.song_id);

        const detail = await getSongDetail(currentUser.id, songId);
        if (!detail) {
            return res.status(404).json({ detail: "Song not found." });
        }

        return res.status(200).json(detail);
    } catch (err) {
        console.error("Get song detail error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// POST /api/songs/:song_id/favorite
SongRouter.post("/:song_id/favorite", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const songId = String(req.params.song_id);

        const userSong = await db.collection<IUserHasSong>("user_has_songs").findOne({
            user_id: currentUser.id,
            song_id: songId,
        });

        if (!userSong) {
            return res.status(404).json({ detail: "Song is not in user's library." });
        }

        const newStatus = !userSong.is_favorite;
        await db.collection("user_has_songs").updateOne(
            { user_id: currentUser.id, song_id: songId },
            { $set: { is_favorite: newStatus } }
        );

        return res.status(200).json({ song_id: songId, is_favorite: newStatus });
    } catch (err) {
        console.error("Toggle favorite error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// PUT /api/songs/:song_id/lyrics
SongRouter.put("/:song_id/lyrics", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const songId = String(req.params.song_id);
        const { custom_lrc, plain_lyrics } = req.body;

        const song = await db.collection<ISong>("songs").findOne({ id: songId });
        if (!song) {
            return res.status(404).json({ detail: "Song not found." });
        }

        const userSong = await db.collection<IUserHasSong>("user_has_songs").findOne({
            user_id: currentUser.id,
            song_id: songId,
        });
        if (!userSong) {
            return res.status(403).json({ detail: "You do not have access to this song." });
        }

        const duration = song.duration_seconds || 180;
        let parsedRows: any[] = [];
        let lyricsStatus: "synced" | "plain" | "custom" | "not_found" = "not_found";
        let lyricsMessage = "";

        if (custom_lrc && custom_lrc.trim()) {
            parsedRows = parseLrc(custom_lrc, duration);
            if (parsedRows.length === 0) {
                return res.status(400).json({ detail: "Invalid LRC format. Lines must contain timestamps like [mm:ss.xx]." });
            }
            lyricsStatus = "custom";
            lyricsMessage = `Lirik kustom berhasil diperbarui (${parsedRows.length} baris tersinkronisasi).`;
        } else if (plain_lyrics && plain_lyrics.trim()) {
            parsedRows = parsePlainLyrics(plain_lyrics, duration);
            lyricsStatus = "plain";
            lyricsMessage = `Lirik teks manual berhasil disimpan (${parsedRows.length} baris diestimasi).`;
        } else {
            return res.status(400).json({ detail: "Please provide either 'custom_lrc' or 'plain_lyrics'." });
        }

        await populateSongLyrics(song.id, parsedRows);
        await db.collection("songs").updateOne(
            { id: song.id },
            { $set: { lyrics_status: lyricsStatus, lyrics_message: lyricsMessage } }
        );

        const detail = await getSongDetail(currentUser.id, song.id);
        return res.status(200).json(detail);
    } catch (err) {
        console.error("Update song lyrics error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

// DELETE /api/songs/:song_id
SongRouter.delete("/:song_id", authenticate, async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const currentUser = req.user!;
        const songId = String(req.params.song_id);

        await db.collection("user_has_songs").deleteOne({
            user_id: currentUser.id,
            song_id: songId,
        });

        // Also remove from user's decks
        const userDecks = await db.collection("decks").find({ user_id: currentUser.id }).toArray();
        const deckIds = userDecks.map((d) => d.id);
        if (deckIds.length > 0) {
            await db.collection("deck_has_songs").deleteMany({
                deck_id: { $in: deckIds },
                song_id: songId,
            });
        }

        return res.status(200).json({ message: "Song removed from your library successfully." });
    } catch (err) {
        console.error("Remove song error:", err);
        return res.status(500).json({ detail: "Internal Server Error" });
    }
});

export default SongRouter;
