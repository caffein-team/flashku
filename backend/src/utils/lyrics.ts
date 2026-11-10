const TIMESTAMP_REGEX = /\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g;

export function cleanTrackAndArtist(rawTitle: string, rawArtist: string = ""): [string, string] {
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
        const beforeQuote = cleanTitle.substring(0, quoteMatch.index).trim();
        if (beforeQuote) {
            artist = beforeQuote;
        }
        cleanTitle = quoteMatch[1].trim();
    }

    // Strip leftover noise words from title
    cleanTitle = cleanTitle.replace(/\b(?:mv|official|music\s*video|video|audio|lyrics|hd|hq)\b/gi, "").trim();
    cleanTitle = cleanTitle.replace(/[\(\[\{【].*?[\)\]\}】]/g, "").trim();
    cleanTitle = cleanTitle.replace(/^[\s\-_/]+|[\s\-_/]+$/g, "");

    return [cleanTitle || rawTitle, artist || rawArtist];
}

export function timeStrToSeconds(minutesStr: string, secondsStr: string): number {
    return parseInt(minutesStr, 10) * 60 + parseFloat(secondsStr);
}

export interface ParsedLyricRow {
    row_order: number;
    raw_text: string;
    start_time: number;
    end_time: number;
    translation?: string | null;
}

export function parseLrc(lrcContent: string, defaultDuration: number = 0.0): ParsedLyricRow[] {
    if (!lrcContent) return [];

    const lines = lrcContent.split(/\r?\n/);
    const entries: { start_time: number; raw_text: string }[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Skip metadata lines like [ar:Artist], [ti:Title], [length:...], etc.
        if (/^\[[a-zA-Z]+:[^\]]*\]/.test(line)) {
            continue;
        }

        // Find all timestamp tags in the line
        const matches: RegExpExecArray[] = [];
        let m: RegExpExecArray | null;
        const regex = new RegExp(TIMESTAMP_REGEX.source, "g");
        while ((m = regex.exec(line)) !== null) {
            matches.push(m);
        }

        if (matches.length === 0) continue;

        const text = line.replace(new RegExp(TIMESTAMP_REGEX.source, "g"), "").trim();
        if (!text) continue;

        for (const match of matches) {
            const mins = match[1];
            const secs = match[2];
            const startSec = timeStrToSeconds(mins, secs);
            entries.push({
                start_time: Math.round(startSec * 100) / 100,
                raw_text: text,
            });
        }
    }

    if (entries.length === 0) return [];

    // Sort lines by start_time
    entries.sort((a, b) => a.start_time - b.start_time);

    const result: ParsedLyricRow[] = [];
    const totalEntries = entries.length;

    for (let i = 0; i < totalEntries; i++) {
        const startTime = entries[i].start_time;
        let endTime: number;

        if (i + 1 < totalEntries) {
            const nextStart = entries[i + 1].start_time;
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
            raw_text: entries[i].raw_text,
            start_time: Math.round(startTime * 100) / 100,
            end_time: Math.round(endTime * 100) / 100,
        });
    }

    return result;
}

export function parsePlainLyrics(plainText: string, totalDuration: number = 180.0): ParsedLyricRow[] {
    if (!plainText) return [];

    const lines = plainText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

    if (lines.length === 0) return [];

    const totalLines = lines.length;
    const interval = totalDuration / Math.max(totalLines, 1);

    const result: ParsedLyricRow[] = [];
    for (let i = 0; i < totalLines; i++) {
        const startTime = Math.round(i * interval * 100) / 100;
        const endTime = Math.round(Math.min((i + 1) * interval, totalDuration) * 100) / 100;
        result.push({
            row_order: i + 1,
            raw_text: lines[i],
            start_time: startTime,
            end_time: endTime,
        });
    }

    return result;
}

async function fetchLrclibEndpoint(params: Record<string, string>): Promise<any | null> {
    const query = new URLSearchParams(params).toString();
    const url = `https://lrclib.net/api/get?${query}`;
    try {
        const resp = await fetch(url, {
            headers: {
                "User-Agent": "AmbacodixApp/1.0 (https://github.com/ambacodix)",
            },
            signal: AbortSignal.timeout(6000),
        });

        if (resp.ok) {
            const data: any = await resp.json();
            if (data && (data.syncedLyrics || data.plainLyrics)) {
                return data;
            }
        }
    } catch (e) {
        // silently ignore candidate query error
    }
    return null;
}

export async function fetchLrclibLyrics(
    trackName: string,
    artistName: string = "",
    duration: number = 0
): Promise<any | null> {
    const [cleanTitle, cleanArtist] = cleanTrackAndArtist(trackName, artistName);
    const queries: Record<string, string>[] = [];

    if (cleanTitle && cleanArtist) {
        const p: Record<string, string> = { track_name: cleanTitle, artist_name: cleanArtist };
        if (duration > 0) {
            p.duration = Math.round(duration).toString();
        }
        queries.push(p);
        queries.push({ track_name: cleanTitle, artist_name: cleanArtist });
    }

    if (cleanTitle && artistName && artistName !== cleanArtist) {
        queries.push({ track_name: cleanTitle, artist_name: artistName });
    }

    if (cleanTitle) {
        queries.push({ track_name: cleanTitle });
    }

    if (trackName && artistName) {
        queries.push({ track_name: trackName, artist_name: artistName });
    }

    for (const q of queries) {
        const data = await fetchLrclibEndpoint(q);
        if (data) {
            return data;
        }
    }

    return null;
}
