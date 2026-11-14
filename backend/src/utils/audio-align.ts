import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import * as wanakana from "wanakana";
import { ILyricRow } from "../types/song";
import { ProxyAgent, Socks5ProxyAgent, Dispatcher, fetch as undiciFetch } from "undici";

const ffmpegStatic: string = require("ffmpeg-static");

export interface AudioAlignResult {
    aligned_rows: ILyricRow[];
    offset_seconds: number;
    detected: boolean;
    whisper_text?: string;
}

function cleanString(str?: string | null): string {
    if (!str) return "";
    return str
        .toLowerCase()
        .replace(/[\s、。，．！？!?.,:;~…\-_'\"“”「」『』()（）\[\]]/g, "");
}

function normalizeForComparison(str?: string | null): string {
    const cleaned = cleanString(str);
    try {
        // Convert any Katakana to Hiragana so Kanji/Kana comparisons match smoothly
        return wanakana.toHiragana(cleaned);
    } catch {
        return cleaned;
    }
}

function computeSimilarity(s1: string, s2: string): number {
    const n1 = normalizeForComparison(s1);
    const n2 = normalizeForComparison(s2);
    if (!n1 || !n2) return 0;
    if (n1 === n2) return 1.0;
    if (n1.includes(n2) || n2.includes(n1)) {
        return Math.min(n1.length, n2.length) / Math.max(n1.length, n2.length);
    }

    let matches = 0;
    const shorter = n1.length < n2.length ? n1 : n2;
    const longer = n1.length < n2.length ? n2 : n1;
    for (let i = 0; i < shorter.length - 1; i++) {
        const bigram = shorter.slice(i, i + 2);
        if (longer.includes(bigram)) matches++;
    }
    return (matches * 2) / (shorter.length + longer.length);
}

function getGroqClient(useProxy = true): Groq {
    const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").replace(/^"|"$/g, "").trim();
    const proxyUrl = useProxy ? (process.env.GROQ_PROXY || process.env.AI_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "").trim() : "";
    const baseUrl = (process.env.GROQ_BASE_URL || process.env.GROK_BASE_URL || "").replace(/\/+$/, "").trim();

    let dispatcher: Dispatcher | undefined;
    if (proxyUrl) {
        try {
            if (proxyUrl.startsWith("socks5://") || proxyUrl.startsWith("socks5h://") || proxyUrl.startsWith("socks://")) {
                dispatcher = new Socks5ProxyAgent(proxyUrl.replace(/^socks5h:\/\//, "socks5://"));
            } else {
                dispatcher = new ProxyAgent(proxyUrl);
            }
        } catch (e: any) {
            console.warn(`[Groq Proxy Warning]: ${e.message}`);
        }
    }

    const customFetch = dispatcher
        ? ((url: any, init: any) => undiciFetch(url, { ...init, dispatcher }))
        : undefined;
    if (customFetch) {
        (customFetch as any).Response = (globalThis as any).Response;
    }

    return new Groq({
        apiKey,
        ...(baseUrl ? { baseURL: baseUrl } : {}),
        maxRetries: 1,
        timeout: 30000,
        ...(customFetch ? { fetch: customFetch as any } : {})
    });
}

/**
 * Automatically aligns lyric row timestamps with YouTube audio using Groq Whisper.
 * Detects intro delays/video skits and shifts lyric rows accordingly.
 */
export async function alignLyricsWithWhisper(
    audioFilePath: string,
    lyricRows: ILyricRow[],
    language: string = "ja",
    sampleDurationSeconds: number = 60
): Promise<AudioAlignResult> {
    if (!audioFilePath || !fs.existsSync(audioFilePath) || !lyricRows || lyricRows.length === 0) {
        return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
    }

    const apiKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
    if (!apiKey) {
        console.warn("[Audio Align]: Groq API key not configured, skipping Whisper auto-alignment.");
        return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
    }

    const tempDir = path.dirname(audioFilePath);
    const tempSample = path.resolve(tempDir, `temp_align_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp3`);

    try {
        // 1. Extract first N seconds of audio using ffmpeg copy mode (nearly instantaneous)
        try {
            execFileSync(ffmpegStatic, [
                "-y",
                "-ss", "0",
                "-i", audioFilePath,
                "-t", String(sampleDurationSeconds),
                "-acodec", "copy",
                tempSample
            ], { stdio: "ignore" });
        } catch (ffmpegErr: any) {
            console.warn("[Audio Align]: ffmpeg audio slice extraction failed:", ffmpegErr.message || ffmpegErr);
            return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
        }

        if (!fs.existsSync(tempSample) || fs.statSync(tempSample).size === 0) {
            return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
        }

        // 2. Call Groq Whisper transcription (using Groq.toFile to support undici and avoid stream exhaustion)
        let transcription: any;
        const audioBuffer = fs.readFileSync(tempSample);
        const fileObj = await Groq.toFile(audioBuffer, "sample.mp3");

        const requestBody = {
            file: fileObj,
            model: "whisper-large-v3-turbo" as const,
            response_format: "verbose_json" as const,
            timestamp_granularities: ["word", "segment"] as Array<"word" | "segment">,
            language: language === "ja" ? ("ja" as const) : undefined
        };

        try {
            const client = getGroqClient(true);
            transcription = await client.audio.transcriptions.create(requestBody);
        } catch (callErr: any) {
            console.warn(`[Audio Align]: Whisper call via proxy failed (${callErr?.message || callErr})`);
            if (process.env.GROQ_PROXY) {
                console.warn("[Audio Align]: Retrying Whisper directly without proxy...");
                try {
                    const directClient = getGroqClient(false);
                    const directFileObj = await Groq.toFile(audioBuffer, "sample.mp3");
                    transcription = await directClient.audio.transcriptions.create({
                        ...requestBody,
                        file: directFileObj
                    });
                } catch (directErr: any) {
                    console.warn(`[Audio Align Warning]: Whisper alignment failed: ${directErr?.status || directErr?.statusCode || ""} ${directErr?.message || directErr}`);
                    return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
                }
            } else {
                return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
            }
        }

        const segments: any[] = transcription?.segments || [];
        const words: any[] = transcription?.words || [];

        if (segments.length === 0 && words.length === 0) {
            return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
        }

        // 3. Find match between the first 3-5 lyric rows and the transcribed audio
        let bestMatch: {
            row: ILyricRow;
            vocalStart: number;
            lrcStart: number;
            offset: number;
            similarity: number;
            matchedText: string;
        } | null = null;

        for (let rIdx = 0; rIdx < Math.min(5, lyricRows.length); rIdx++) {
            const row = lyricRows[rIdx];
            const rowClean = normalizeForComparison(row.raw_text);
            if (rowClean.length < 2) continue;

            for (const seg of segments) {
                const segClean = normalizeForComparison(seg.text);
                const sim = computeSimilarity(row.raw_text, seg.text);

                if (sim >= 0.45) {
                    // Try to pinpoint exact word start time
                    let vocalStart = typeof seg.start === "number" ? seg.start : 0;
                    if (words.length > 0) {
                        const matchingWord = words.find((w) =>
                            w.start >= Math.max(0, seg.start - 0.75) &&
                            w.end <= seg.end + 0.75 &&
                            normalizeForComparison(rowClean).startsWith(normalizeForComparison(w.word))
                        );
                        if (matchingWord && typeof matchingWord.start === "number") {
                            vocalStart = matchingWord.start;
                        }
                    }

                    const offset = vocalStart - row.start_time;

                    // Offset sanity check: between -30s and +120s
                    if (offset >= -30 && offset <= 120) {
                        if (!bestMatch || sim > bestMatch.similarity) {
                            bestMatch = {
                                row,
                                vocalStart,
                                lrcStart: row.start_time,
                                offset,
                                similarity: sim,
                                matchedText: seg.text
                            };
                        }
                    }
                }
            }

            if (bestMatch && bestMatch.similarity >= 0.7) {
                break;
            }
        }

        // 4. If match found and offset is meaningful (>= 0.3 seconds)
        if (bestMatch && Math.abs(bestMatch.offset) >= 0.3) {
            const offsetRounded = Math.round(bestMatch.offset * 100) / 100;
            console.log(
                `[Audio Align]: Auto-aligned via Whisper! Matched row "${bestMatch.row.raw_text}" ` +
                `(LRC: ${bestMatch.lrcStart}s) -> (Whisper: ${bestMatch.vocalStart}s). Applied offset: ${offsetRounded > 0 ? "+" : ""}${offsetRounded}s`
            );

            const shiftedRows = lyricRows.map((r) => ({
                ...r,
                start_time: Math.max(0, Math.round((r.start_time + offsetRounded) * 100) / 100),
                end_time: Math.max(0, Math.round((r.end_time + offsetRounded) * 100) / 100)
            }));

            return {
                aligned_rows: shiftedRows,
                offset_seconds: offsetRounded,
                detected: true,
                whisper_text: bestMatch.matchedText
            };
        }

        return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
    } catch (err: any) {
        console.warn("[Audio Align Warning]: Whisper alignment failed:", err.message || err);
        return { aligned_rows: lyricRows, offset_seconds: 0, detected: false };
    } finally {
        if (fs.existsSync(tempSample)) {
            try {
                fs.unlinkSync(tempSample);
            } catch {
                // ignore cleanup error
            }
        }
    }
}
