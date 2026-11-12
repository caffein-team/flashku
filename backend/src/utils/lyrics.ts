import { ILyricRow } from "../types/song";

const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;

export function cleanTrackAndArtist(rawTitle: string, rawArtist: string = ""): { title: string; artist: string } {
    let title = (rawTitle || "").trim();
    let artist = (rawArtist || "").trim();

    // Clean uploader/artist suffix noise
    artist = artist.replace(/\s*(official\s*(?:youtube\s*)?(?:channel)?|topic|vevo|records|music)\b/gi, "").trim();
    artist = artist.replace(/[\(\[\{【].*?[\)\]\}】]/g, "").trim();

    // Remove brackets like (Official Video), [MV], 【MV】, etc.
    let cleanTitle = title.replace(/\s*[\(\[\{【「『].*?(?:mv|official|video|audio|lyrics|ver|hd|hq|version|full).*?[\)\]\}】」』]/gi, "");

    // Check for quote marks around title like 「Title」 or 『Title』
    const quoteMatch = cleanTitle.match(/[「『\"“](.*?)[」』\"”]/);

    if (cleanTitle.includes(" - ")) {
        const parts = cleanTitle.split(" - ");
        artist = parts[0].trim();
        cleanTitle = parts.slice(1).join(" - ").trim();
    } else if (quoteMatch && quoteMatch.index !== undefined) {
        const beforeQuote = cleanTitle.slice(0, quoteMatch.index).trim();
        if (beforeQuote) {
            artist = beforeQuote;
        }
        cleanTitle = quoteMatch[1].trim();
    }

    // Strip leftover noise words from title
    cleanTitle = cleanTitle.replace(/\b(?:mv|official|music\s*video|video|audio|lyrics|hd|hq)\b/gi, "").trim();
    cleanTitle = cleanTitle.replace(/[\(\[\{【].*?[\)\]\}】]/g, "").trim();
    cleanTitle = cleanTitle.replace(/^[\s\-_/]+|[\s\-_/]+$/g, "");

    return {
        title: cleanTitle || rawTitle,
        artist: artist || rawArtist
    };
}

function timeStrToSeconds(minutesStr: string, secondsStr: string): number {
    return parseInt(minutesStr, 10) * 60 + parseFloat(secondsStr);
}

export function parseLrc(lrcContent: string, defaultDuration: number = 0): ILyricRow[] {
    if (!lrcContent) return [];

    const lines = lrcContent.split(/\r?\n/);
    const entries: { startTime: number; text: string }[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Skip metadata lines like [ar:Artist], [ti:Title], [length:...], etc.
        if (/^\[[a-zA-Z]+:[^\]]*\]/.test(line)) continue;

        // Find all timestamp tags in the line
        const matches = [...line.matchAll(TIMESTAMP_REGEX)];
        if (!matches || matches.length === 0) continue;

        // Extract remaining text after removing all timestamps
        const text = line.replace(TIMESTAMP_REGEX, "").trim();
        if (!text) continue;

        for (const match of matches) {
            const startSec = timeStrToSeconds(match[1], match[2]);
            entries.push({
                startTime: Math.round(startSec * 100) / 100,
                text: text
            });
        }
    }

    if (entries.length === 0) return [];

    // Sort lines by startTime
    entries.sort((a, b) => a.startTime - b.startTime);

    const totalEntries = entries.length;
    const result: ILyricRow[] = [];

    for (let i = 0; i < totalEntries; i++) {
        const startTime = entries[i].startTime;
        let endTime: number;

        if (i + 1 < totalEntries) {
            const nextStart = entries[i + 1].startTime;
            if (nextStart > startTime) {
                endTime = Math.min(nextStart, startTime + 8.0);
            } else {
                endTime = startTime + 3.0;
            }
        } else {
            if (defaultDuration > startTime) {
                endTime = Math.min(defaultDuration, startTime + 5.0);
            } else {
                endTime = startTime + 4.0;
            }
        }

        result.push({
            row_order: i + 1,
            raw_text: entries[i].text,
            start_time: Math.round(startTime * 100) / 100,
            end_time: Math.round(endTime * 100) / 100,
            phrases: []
        });
    }

    return result;
}

export function parsePlainLyrics(plainText: string, totalDuration: number = 180): ILyricRow[] {
    if (!plainText) return [];

    const lines = plainText
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0);

    if (lines.length === 0) return [];

    const totalLines = lines.length;
    const interval = totalDuration / Math.max(totalLines, 1);
    const result: ILyricRow[] = [];

    for (let i = 0; i < totalLines; i++) {
        const startTime = Math.round(i * interval * 100) / 100;
        const endTime = Math.round(Math.min((i + 1) * interval, totalDuration) * 100) / 100;

        result.push({
            row_order: i + 1,
            raw_text: lines[i],
            start_time: startTime,
            end_time: endTime,
            phrases: []
        });
    }

    return result;
}

async function fetchFromLrcLib(params: Record<string, string>): Promise<any | null> {
    const url = new URL("https://lrclib.net/api/get");
    for (const [key, val] of Object.entries(params)) {
        if (val) url.searchParams.append(key, val);
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const response = await fetch(url.toString(), {
            headers: {
                "User-Agent": "FlashkuApp/1.0 (https://github.com/ambacodix)"
            },
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (response.ok) {
            const data: any = await response.json();
            if (data && (data.syncedLyrics || data.plainLyrics)) {
                return data;
            }
        }
    } catch {
        // Fallback gracefully on network error or timeout
    }
    return null;
}

export async function fetchLrcLibLyrics(
    trackName: string,
    artistName: string = "",
    duration: number = 0
): Promise<any | null> {
    const { title: cleanTitle, artist: cleanArtist } = cleanTrackAndArtist(trackName, artistName);
    const queries: Record<string, string>[] = [];

    // 1. Clean title + Clean artist (+ duration)
    if (cleanTitle && cleanArtist) {
        const q: Record<string, string> = { track_name: cleanTitle, artist_name: cleanArtist };
        if (duration > 0) q.duration = duration.toString();
        queries.push(q);
        queries.push({ track_name: cleanTitle, artist_name: cleanArtist });
    }

    // 2. Clean title + Original artist
    if (cleanTitle && artistName && artistName !== cleanArtist) {
        queries.push({ track_name: cleanTitle, artist_name: artistName });
    }

    // 3. Clean title alone
    if (cleanTitle) {
        queries.push({ track_name: cleanTitle });
    }

    // 4. Original title + Original artist
    if (trackName && artistName) {
        queries.push({ track_name: trackName, artist_name: artistName });
    }

    for (const query of queries) {
        const data = await fetchFromLrcLib(query);
        if (data) return data;
    }

    // 5. Fallback: Search endpoint
    try {
        const searchKeywords = [
            cleanTitle && cleanArtist ? `${cleanArtist} ${cleanTitle}` : null,
            cleanTitle
        ].filter(Boolean) as string[];

        for (const kw of searchKeywords) {
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(kw)}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 6000);
            const resp = await fetch(searchUrl, {
                headers: { "User-Agent": "FlashkuApp/1.0 (https://github.com/ambacodix)" },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (resp.ok) {
                const results: any[] = await resp.json();
                if (Array.isArray(results) && results.length > 0) {
                    // Prefer one with syncedLyrics
                    const syncedMatch = results.find(r => r.syncedLyrics && !r.instrumental);
                    if (syncedMatch) return syncedMatch;

                    const plainMatch = results.find(r => r.plainLyrics && !r.instrumental);
                    if (plainMatch) return plainMatch;
                }
            }
        }
    } catch {
        // Fallback gracefully
    }

    return null;
}
