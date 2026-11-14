import express, { Request, Response } from "express";
import path from "path";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db";
import { authenticateToken } from "../middlewares/auth.middleware";
import { ILyricRow, ISong, IUserSong, SongImportBody, SongOffsetBody, UpdateSongLyricsBody } from "../types/song";
import { cleanTrackAndArtist, fetchLrcLibLyrics, parseLrc, parsePlainLyrics } from "../utils/lyrics";
import { extractYouTubeId, fetchYouTubeData } from "../utils/youtube";
import { convertJapaneseTextToRomaji, isMeaningfulPhrase, tokenizeJapaneseLyrics } from "../utils/japanese";
import { checkAiQuotaStatus, enrichBatchWithAi } from "../utils/ai";
import { alignLyricsWithWhisper } from "../utils/audio-align";

const SongRouter = express.Router();

// Apply auth middleware to all song endpoints
SongRouter.use(authenticateToken);

/**
 * POST /api/songs/import
 * Import YouTube song: extracts audio MP3, downloads thumbnail, fetches & parses LRC lyrics,
 * tokenizes Japanese phrases, and saves to MongoDB.
 */
SongRouter.post("/import", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const { youtube_url, custom_lrc, custom_title, custom_artist, language } = req.body as SongImportBody;
        const errors: Record<string, string> = {};

        if (!youtube_url || typeof youtube_url !== "string") {
            errors.youtube_url = "youtube_url is required and must be a string";
        }

        const youtube_id = extractYouTubeId(youtube_url);
        if (!youtube_id) {
            errors.youtube_url = "Invalid YouTube URL or video ID provided";
        }

        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid input",
                errors: errors
            });
        }

        const target_lang = language || "ja";
        const existing_song = await db.collection<ISong>("songs").findOne({ youtube_id: youtube_id! });

        if (existing_song) {
            // Check / link song to user's library
            let user_song = await db.collection<IUserSong>("user_songs").findOne({
                user_id: user._id!,
                song_id: existing_song._id!
            });

            if (!user_song) {
                const insertUserSong = await db.collection<IUserSong>("user_songs").insertOne({
                    user_id: user._id!,
                    song_id: existing_song._id!,
                    is_favorite: false,
                    added_at: new Date()
                });
                user_song = {
                    _id: insertUserSong.insertedId,
                    user_id: user._id!,
                    song_id: existing_song._id!,
                    is_favorite: false,
                    added_at: new Date()
                };
            }

            const is_dummy_lyrics =
                (existing_song.lyric_rows?.length || 0) <= 1 &&
                existing_song.lyrics_status === "not_found";

            // If song already has synchronized lyrics and user did not supply new custom LRC, return immediately
            if (
                ["synced", "custom"].includes(existing_song.lyrics_status) &&
                !is_dummy_lyrics &&
                !custom_lrc
            ) {
                return res.status(200).json({
                    status: "success",
                    message: "Song loaded from library",
                    data: {
                        ...existing_song,
                        is_favorite: user_song?.is_favorite || false
                    }
                });
            }
        }

        // 1. Download audio and thumbnail via yt-dlp helper
        let yt_data;
        try {
            yt_data = await fetchYouTubeData(youtube_id!);
        } catch (ytErr: any) {
            console.error("[YouTube Extraction Error]:", ytErr);
            return res.status(500).json({
                status: "error",
                message: `Failed to extract YouTube audio: ${ytErr.message || ytErr}`
            });
        }

        const cleaned = cleanTrackAndArtist(yt_data.title, yt_data.artist);
        const title = custom_title ? custom_title.trim() : (cleaned.title || yt_data.title);
        const artist = custom_artist ? custom_artist.trim() : (cleaned.artist || yt_data.artist);
        const duration_seconds = yt_data.duration_seconds || 0;

        // 2. Resolve lyrics: custom_lrc takes priority, otherwise fetch from LRCLIB
        let parsed_rows: ILyricRow[] = [];
        let lyrics_status: "synced" | "plain" | "custom" | "not_found" = "not_found";
        let lyrics_message = "";

        if (custom_lrc && custom_lrc.trim()) {
            parsed_rows = parseLrc(custom_lrc);
            lyrics_status = "custom";
            lyrics_message = `Lirik LRC kustom berhasil diterapkan (${parsed_rows.length} baris).`;
        } else {
            const lrclib_result = await fetchLrcLibLyrics(title, artist, duration_seconds);
            if (lrclib_result) {
                if (lrclib_result.syncedLyrics) {
                    parsed_rows = parseLrc(lrclib_result.syncedLyrics);
                    lyrics_status = "synced";
                    lyrics_message = `Lirik sinkron otomatis berhasil diambil dari LRCLIB (${parsed_rows.length} baris).`;
                } else if (lrclib_result.plainLyrics) {
                    parsed_rows = parsePlainLyrics(lrclib_result.plainLyrics, duration_seconds);
                    lyrics_status = "plain";
                    lyrics_message = `Lirik teks polos berhasil diambil dari LRCLIB (${parsed_rows.length} baris diestimasi).`;
                }
            }
        }

        // 3. Fallback dummy lyrics if still not found
        if (parsed_rows.length === 0) {
            lyrics_status = "not_found";
            lyrics_message =
                "Lirik tidak ditemukan di basis data publik. Silakan unggah file LRC manual melalui endpoint /lyrics.";
            parsed_rows = [
                {
                    row_order: 1,
                    raw_text: title,
                    start_time: 0,
                    end_time: duration_seconds > 0 ? duration_seconds : 5,
                    phrases: []
                }
            ];
        }

        // 3.5 Auto-align lyric row timestamps with YouTube audio via Whisper
        let lyrics_offset = 0;
        if (["synced", "custom"].includes(lyrics_status) && yt_data.audio_path && parsed_rows.length > 0) {
            try {
                const fullAudioPath = path.resolve(process.cwd(), yt_data.audio_path.replace(/^\/+/, ""));
                const alignResult = await alignLyricsWithWhisper(fullAudioPath, parsed_rows, target_lang);
                if (alignResult.detected && alignResult.offset_seconds !== 0) {
                    parsed_rows = alignResult.aligned_rows;
                    lyrics_offset = alignResult.offset_seconds;
                    lyrics_message += ` (Auto-aligned via Whisper: ${lyrics_offset > 0 ? "+" : ""}${lyrics_offset}s offset).`;
                }
            } catch (alignErr: any) {
                console.warn("[Whisper Alignment Warning]: Failed to auto-align lyrics with audio:", alignErr.message || alignErr);
            }
        }

        // 4. Tokenize Japanese phrases and line-level romaji for all lyric lines
        if (target_lang === "ja" && parsed_rows.length > 0) {
            try {
                const lineTexts = parsed_rows.map((row) => row.raw_text);
                const tokenizedLines = await tokenizeJapaneseLyrics(lineTexts);

                for (let i = 0; i < parsed_rows.length; i++) {
                    const lineData = tokenizedLines[i];
                    const rawPhrases = lineData?.phrases || [];
                    parsed_rows[i].id = `row_${i + 1}`;
                    parsed_rows[i].romaji = lineData?.romaji || null;
                    parsed_rows[i].romanization = lineData?.romaji || null;
                    parsed_rows[i].phrases = rawPhrases.map((p, pIdx) => {
                        const phraseId = `p_${youtube_id}_${i + 1}_${p.word_order || pIdx + 1}`;
                        return {
                            ...p,
                            id: phraseId,
                            phrase_id: phraseId,
                            romanization: p.romaji
                        };
                    });
                }
            } catch (tokenErr) {
                console.error("[Tokenization Warning]: Failed to tokenize Japanese phrases:", tokenErr);
            }
        }

        // 5. Upsert song document into MongoDB
        const now = new Date();
        const song_update_doc: Partial<ISong> = {
            youtube_id: youtube_id!,
            title: title,
            artist: artist,
            duration_seconds: duration_seconds,
            thumbnail_url: yt_data.thumbnail_url,
            audio_path: yt_data.audio_path,
            language: target_lang,
            lyrics_status: lyrics_status,
            lyrics_message: lyrics_message,
            lyrics_offset: lyrics_offset,
            lyric_rows: parsed_rows,
            updated_at: now
        };

        let saved_song: ISong | null = null;
        if (existing_song) {
            await db.collection<ISong>("songs").updateOne(
                { _id: existing_song._id },
                { $set: song_update_doc }
            );
            saved_song = await db.collection<ISong>("songs").findOne({ _id: existing_song._id });
        } else {
            const insertResult = await db.collection<ISong>("songs").insertOne({
                ...(song_update_doc as ISong),
                created_at: now
            });
            saved_song = await db.collection<ISong>("songs").findOne({ _id: insertResult.insertedId });
        }

        // Link to user's personal song list
        let user_song = await db.collection<IUserSong>("user_songs").findOne({
            user_id: user._id!,
            song_id: saved_song!._id!
        });

        if (!user_song) {
            const insertUserSong = await db.collection<IUserSong>("user_songs").insertOne({
                user_id: user._id!,
                song_id: saved_song!._id!,
                is_favorite: false,
                added_at: now
            });
            user_song = {
                _id: insertUserSong.insertedId,
                user_id: user._id!,
                song_id: saved_song!._id!,
                is_favorite: false,
                added_at: now
            };
        }

        return res.status(201).json({
            status: "success",
            message: "Song imported successfully",
            data: {
                ...saved_song,
                is_favorite: user_song.is_favorite,
                is_synced: ["synced", "custom"].includes(saved_song!.lyrics_status)
            }
        });
    } catch (err: unknown) {
        console.error("[Song Import Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error during song import"
        });
    }
});

/**
 * GET /api/songs
 * List all songs saved in current user's library with pagination and total count.
 */
SongRouter.get("/", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;

        const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
        const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

        const total = await db.collection<IUserSong>("user_songs").countDocuments({
            user_id: user._id!
        });

        const user_songs_cursor = db.collection<IUserSong>("user_songs")
            .find({ user_id: user._id! })
            .sort({ added_at: -1 })
            .skip(offset)
            .limit(limit);

        const user_songs = await user_songs_cursor.toArray();
        const song_ids = user_songs.map((us) => us.song_id);

        let items: any[] = [];
        if (song_ids.length > 0) {
            const songs = await db.collection<ISong>("songs")
                .find({ _id: { $in: song_ids } })
                .project({ lyric_rows: 0 })
                .toArray();

            const song_map = new Map(songs.map((s) => [s._id!.toString(), s]));

            items = user_songs.map((us) => {
                const s = song_map.get(us.song_id.toString());
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
                    is_favorite: us.is_favorite,
                    created_at: s.created_at,
                    added_at: us.added_at
                };
            }).filter(Boolean);
        }

        return res.status(200).json({
            status: "success",
            message: "User songs retrieved successfully",
            data: {
                total: total,
                limit: limit,
                offset: offset,
                items: items
            }
        });
    } catch (err: unknown) {
        console.error("[Get Songs Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * GET /api/songs/ai/quota
 * Check AI API quota, key configuration and live availability status.
 */
SongRouter.get("/ai/quota", async (req: Request, res: Response) => {
    try {
        const quotaStatus = await checkAiQuotaStatus();
        return res.status(200).json({
            status: "success",
            message: "AI API quota status retrieved",
            data: quotaStatus
        });
    } catch (err: unknown) {
        console.error("[AI Quota Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * GET /api/songs/:id
 * Get song details including timestamped lyric rows and tokenized phrases.
 */
SongRouter.get("/:id", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid song id format"
            });
        }

        const song_oid = new ObjectId(id);
        const song = await db.collection<ISong>("songs").findOne({ _id: song_oid });

        if (!song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found"
            });
        }

        const user_song = await db.collection<IUserSong>("user_songs").findOne({
            user_id: user._id!,
            song_id: song_oid
        });

        // Ensure lyric rows have romaji and phrases have phrase_id for consistent client usage
        const lyric_rows = await Promise.all(
            (song.lyric_rows || []).map(async (row, rIdx) => {
                let rowRomaji = row.romaji || row.romanization || null;
                if (!rowRomaji && song.language === "ja" && row.raw_text) {
                    try {
                        rowRomaji = await convertJapaneseTextToRomaji(row.raw_text);
                    } catch {
                        rowRomaji = null;
                    }
                }

                return {
                    ...row,
                    id: row.id || `row_${row.row_order || rIdx + 1}`,
                    romaji: rowRomaji,
                    romanization: rowRomaji,
                    phrases: (row.phrases || []).map((p, pIdx) => {
                        const pid = p.phrase_id || p.id || `p_${song._id}_${row.row_order || rIdx + 1}_${p.word_order || pIdx + 1}`;
                        return {
                            ...p,
                            id: pid,
                            phrase_id: pid,
                            romanization: p.romanization || p.romaji
                        };
                    })
                };
            })
        );

        return res.status(200).json({
            status: "success",
            message: "Song details retrieved successfully",
            data: {
                ...song,
                lyric_rows: lyric_rows,
                is_favorite: user_song?.is_favorite || false,
                is_synced: ["synced", "custom"].includes(song.lyrics_status)
            }
        });
    } catch (err: unknown) {
        console.error("[Get Song Detail Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * POST /api/songs/:id/enrich-ai
 * Run or re-run AI to translate lyric lines and enrich phrase meanings in context.
 */
SongRouter.post("/:id/enrich-ai", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;
        const target_language = (req.query.target_language as string) || "Indonesian";

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid song id format"
            });
        }

        const song_oid = new ObjectId(id);
        const song = await db.collection<ISong>("songs").findOne({ _id: song_oid });
        if (!song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found"
            });
        }

        const user_song = await db.collection<IUserSong>("user_songs").findOne({
            user_id: user._id!,
            song_id: song_oid
        });

        if (!user_song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found in your library"
            });
        }

        const lyric_rows = song.lyric_rows || [];
        if (lyric_rows.length === 0) {
            return res.status(400).json({
                status: "fail",
                message: "No lyric rows found for this song to enrich"
            });
        }

        const untranslated_rows = lyric_rows.filter((r) => !r.translation || !r.translation.trim());
        const rows_to_enrich = untranslated_rows.length > 0 ? untranslated_rows : lyric_rows;

        const COMMON_PARTICLE_MEANINGS: Record<string, string> = {
            "は": "partikel penanda topik (adalah/mengenai)",
            "が": "partikel penanda subjek",
            "を": "partikel penanda objek",
            "に": "di / ke / pada (partikel arah/waktu/tujuan)",
            "へ": "menuju / ke arah",
            "で": "di / dengan (partikel tempat/alat)",
            "と": "dan / bersama / dengan",
            "も": "juga / pun",
            "の": "kepemilikan / penjelas kata benda (dari/punya)",
            "から": "dari / sejak / karena",
            "まで": "sampai / hingga",
            "より": "daripada / lebih dari",
            "ね": "ya / bukan? (partikel penegas/persetujuan)",
            "よ": "lho / tahu (partikel penegas informasi)",
            "か": "apakah (partikel tanya)",
            "わ": "partikel penegas lembut",
            "ぞ": "partikel penegas tegas",
            "ぜ": "partikel penegas ajakan/semangat",
            "な": "partikel larangan / penegas",
            "さ": "partikel nada bicara kasual",
            "だ": "adalah (kopula kasual)",
            "です": "adalah (kopula sopan)",
            "ます": "bentuk sopan kata kerja",
            "た": "penanda bentuk lampau",
            "ない": "tidak / bukan (penanda negatif)",
            "ている": "sedang (bentuk progresif)",
            "てる": "sedang (singkatan kasual dari teiru)",
            "て": "partikel penghubung bentuk te",
            "ば": "jika / kalau",
            "たら": "jika / setelah",
            "なら": "jika memang / kalau"
        };

        const chunkSize = 3;
        let totalTranslations = 0;
        let totalMeanings = 0;

        for (let i = 0; i < rows_to_enrich.length; i += chunkSize) {
            const chunk = rows_to_enrich.slice(i, i + chunkSize);
            const batchForAi = chunk.map((r) => {
                const tokensSet = new Set<string>();
                if (Array.isArray(r.phrases)) {
                    for (const p of r.phrases) {
                        if (!isMeaningfulPhrase(p)) continue;
                        if (p.dictionary_form) tokensSet.add(p.dictionary_form.trim());
                        if (p.surface_form) tokensSet.add(p.surface_form.trim());
                    }
                }
                return {
                    id: r.row_order,
                    raw_text: r.raw_text,
                    tokens: Array.from(tokensSet)
                };
            });

            const result = await enrichBatchWithAi(batchForAi, target_language);
            const rowTranslations = result.row_translations || {};
            const vocabMeanings = result.vocabulary_meanings || {};

            for (const row of chunk) {
                const trans = rowTranslations[String(row.row_order)];
                if (trans) {
                    row.translation = trans;
                    totalTranslations++;
                }

                if (Array.isArray(row.phrases)) {
                    for (const phrase of row.phrases) {
                        const dictForm = phrase.dictionary_form?.trim();
                        const surface = phrase.surface_form?.trim();

                        let meaning =
                            (dictForm && vocabMeanings[dictForm]) ||
                            (surface && vocabMeanings[surface]) ||
                            (dictForm && COMMON_PARTICLE_MEANINGS[dictForm]) ||
                            (surface && COMMON_PARTICLE_MEANINGS[surface]);

                        if (!meaning && dictForm) {
                            for (const [k, v] of Object.entries(vocabMeanings)) {
                                if (
                                    k.toLowerCase() === dictForm.toLowerCase() ||
                                    k.toLowerCase() === (surface || "").toLowerCase()
                                ) {
                                    meaning = v;
                                    break;
                                }
                            }
                        }

                        if (meaning) {
                            phrase.meaning = meaning;
                            totalMeanings++;
                        }
                    }
                }
            }

            // Pacing delay between batches to stay comfortably within Groq rate limits (OTPM / TPM)
            if (i + chunkSize < rows_to_enrich.length) {
                await new Promise((resolve) => setTimeout(resolve, 1800));
            }
        }

        const now = new Date();
        await db.collection<ISong>("songs").updateOne(
            { _id: song_oid },
            {
                $set: {
                    lyric_rows: lyric_rows,
                    updated_at: now
                }
            }
        );

        const updated_song = await db.collection<ISong>("songs").findOne({ _id: song_oid });

        return res.status(200).json({
            status: "success",
            message: `AI enrichment complete: ${totalTranslations} lines translated, ${totalMeanings} phrases enriched`,
            data: {
                ...updated_song,
                is_favorite: user_song.is_favorite,
                is_synced: ["synced", "custom"].includes(updated_song?.lyrics_status || "")
            }
        });
    } catch (err: unknown) {
        console.error("[Enrich Lyrics Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * POST /api/songs/:id/favorite
 * Toggle favorite status for a song in user's library.
 */
SongRouter.post("/:id/favorite", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid song id format"
            });
        }

        const song_oid = new ObjectId(id);
        const user_song = await db.collection<IUserSong>("user_songs").findOne({
            user_id: user._id!,
            song_id: song_oid
        });

        if (!user_song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found in your library"
            });
        }

        const new_favorite_status = !user_song.is_favorite;
        await db.collection<IUserSong>("user_songs").updateOne(
            { _id: user_song._id },
            { $set: { is_favorite: new_favorite_status } }
        );

        return res.status(200).json({
            status: "success",
            message: new_favorite_status ? "Song added to favorites" : "Song removed from favorites",
            data: {
                song_id: id,
                is_favorite: new_favorite_status
            }
        });
    } catch (err: unknown) {
        console.error("[Toggle Favorite Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * PUT /api/songs/:id/lyrics
 * Update or upload manual/custom lyrics (synced LRC or plain text) for a song.
 */
SongRouter.put("/:id/lyrics", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;
        const { custom_lrc, plain_lyrics } = req.body as UpdateSongLyricsBody;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid song id format"
            });
        }

        const song_oid = new ObjectId(id);
        const song = await db.collection<ISong>("songs").findOne({ _id: song_oid });

        if (!song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found"
            });
        }

        const user_song = await db.collection<IUserSong>("user_songs").findOne({
            user_id: user._id!,
            song_id: song_oid
        });

        if (!user_song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found in your library"
            });
        }

        const duration = song.duration_seconds || 0;
        let parsed_rows: ILyricRow[] = [];
        let lyrics_status: "custom" | "plain" = "custom";
        let lyrics_message = "";

        if (custom_lrc && custom_lrc.trim()) {
            parsed_rows = parseLrc(custom_lrc);
            if (parsed_rows.length === 0) {
                return res.status(400).json({
                    status: "fail",
                    message: "Failed to parse custom LRC format. Please check timestamps."
                });
            }
            lyrics_status = "custom";
            lyrics_message = `Lirik kustom berhasil diperbarui (${parsed_rows.length} baris tersinkronisasi).`;
        } else if (plain_lyrics && plain_lyrics.trim()) {
            parsed_rows = parsePlainLyrics(plain_lyrics, duration);
            lyrics_status = "plain";
            lyrics_message = `Lirik teks polos berhasil disimpan (${parsed_rows.length} baris diestimasi).`;
        } else {
            return res.status(400).json({
                status: "fail",
                message: "Either custom_lrc or plain_lyrics must be provided"
            });
        }

        // Auto-align updated custom LRC with audio if available
        let lyrics_offset = song.lyrics_offset || 0;
        if (custom_lrc && custom_lrc.trim() && song.audio_path && parsed_rows.length > 0) {
            try {
                const fullAudioPath = path.resolve(process.cwd(), song.audio_path.replace(/^\/+/, ""));
                const alignResult = await alignLyricsWithWhisper(fullAudioPath, parsed_rows, song.language || "ja");
                if (alignResult.detected && alignResult.offset_seconds !== 0) {
                    parsed_rows = alignResult.aligned_rows;
                    lyrics_offset = alignResult.offset_seconds;
                    lyrics_message += ` (Auto-aligned via Whisper: ${lyrics_offset > 0 ? "+" : ""}${lyrics_offset}s offset).`;
                }
            } catch (alignErr: any) {
                console.warn("[Whisper Alignment Warning]: Failed to auto-align updated lyrics:", alignErr.message || alignErr);
            }
        }

        // Re-tokenize phrases and line-level romaji for Japanese lyrics
        if (song.language === "ja" && parsed_rows.length > 0) {
            try {
                const lineTexts = parsed_rows.map((row) => row.raw_text);
                const tokenizedLines = await tokenizeJapaneseLyrics(lineTexts);

                for (let i = 0; i < parsed_rows.length; i++) {
                    const lineData = tokenizedLines[i];
                    const rawPhrases = lineData?.phrases || [];
                    parsed_rows[i].id = `row_${i + 1}`;
                    parsed_rows[i].romaji = lineData?.romaji || null;
                    parsed_rows[i].romanization = lineData?.romaji || null;
                    parsed_rows[i].phrases = rawPhrases.map((p, pIdx) => {
                        const phraseId = `p_${song._id}_${i + 1}_${p.word_order || pIdx + 1}`;
                        return {
                            ...p,
                            id: phraseId,
                            phrase_id: phraseId,
                            romanization: p.romaji
                        };
                    });
                }
            } catch (tokenErr) {
                console.error("[Tokenization Warning]: Failed to tokenize updated lyrics:", tokenErr);
            }
        }

        const now = new Date();
        await db.collection<ISong>("songs").updateOne(
            { _id: song_oid },
            {
                $set: {
                    lyric_rows: parsed_rows,
                    lyrics_status: lyrics_status,
                    lyrics_message: lyrics_message,
                    lyrics_offset: lyrics_offset,
                    updated_at: now
                }
            }
        );

        const updated_song = await db.collection<ISong>("songs").findOne({ _id: song_oid });

        return res.status(200).json({
            status: "success",
            message: "Lyrics updated successfully",
            data: {
                ...updated_song,
                is_favorite: user_song.is_favorite,
                is_synced: lyrics_status === "custom"
            }
        });
    } catch (err: unknown) {
        console.error("[Update Lyrics Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * DELETE /api/songs/:id
 * Remove a song from current user's library and any of user's decks.
 */
SongRouter.delete("/:id", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const user = req.user!;
        const id = req.params.id as string;

        if (!id || !ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid song id format"
            });
        }

        const song_oid = new ObjectId(id);
        const user_song = await db.collection<IUserSong>("user_songs").findOne({
            user_id: user._id!,
            song_id: song_oid
        });

        if (!user_song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found in your library"
            });
        }

        await db.collection<IUserSong>("user_songs").deleteOne({ _id: user_song._id });
        await db.collection("decks").updateMany(
            { user_id: user._id! },
            { $pull: { song_ids: song_oid } as any }
        );

        return res.status(200).json({
            status: "success",
            message: "Song removed from library successfully"
        });
    } catch (err: unknown) {
        console.error("[Remove Song Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

/**
 * PATCH /api/songs/:id/offset
 * Adjust the timing offset of all lyric rows (in seconds).
 * Useful if the user wants to fine-tune the timing (+0.5s, -1.0s, etc.).
 */
SongRouter.patch("/:id/offset", async (req: Request, res: Response) => {
    try {
        const db = getDB();
        const id = req.params.id as string;
        const { offset_seconds } = req.body as SongOffsetBody;

        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                status: "fail",
                message: "Invalid song id format"
            });
        }

        if (typeof offset_seconds !== "number" || isNaN(offset_seconds)) {
            return res.status(400).json({
                status: "fail",
                message: "offset_seconds is required and must be a number"
            });
        }

        const song_oid = new ObjectId(id);
        const song = await db.collection<ISong>("songs").findOne({ _id: song_oid });
        if (!song) {
            return res.status(404).json({
                status: "fail",
                message: "Song not found"
            });
        }

        const currentRows = song.lyric_rows || [];
        const updatedRows = currentRows.map((row) => ({
            ...row,
            start_time: Math.max(0, Math.round((row.start_time + offset_seconds) * 100) / 100),
            end_time: Math.max(0, Math.round((row.end_time + offset_seconds) * 100) / 100)
        }));

        const totalOffset = Math.round(((song.lyrics_offset || 0) + offset_seconds) * 100) / 100;
        const now = new Date();

        await db.collection<ISong>("songs").updateOne(
            { _id: song_oid },
            {
                $set: {
                    lyric_rows: updatedRows,
                    lyrics_offset: totalOffset,
                    updated_at: now
                }
            }
        );

        const updatedSong = await db.collection<ISong>("songs").findOne({ _id: song_oid });

        return res.status(200).json({
            status: "success",
            message: `Lyric rows shifted by ${offset_seconds > 0 ? "+" : ""}${offset_seconds}s (Total offset: ${totalOffset}s)`,
            data: updatedSong
        });
    } catch (err: unknown) {
        console.error("[Adjust Song Offset Error]:", err);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
});

export default SongRouter;
