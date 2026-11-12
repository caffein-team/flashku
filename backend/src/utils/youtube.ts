import { runPythonScript } from "./python-runner";

export interface YouTubeMetadata {
    youtube_id: string;
    title: string;
    artist: string;
    duration_seconds: number;
    thumbnail_url: string;
    audio_path: string;
}

export function extractYouTubeId(urlOrId: string): string | null {
    if (!urlOrId) return null;
    const clean = urlOrId.trim();

    if (clean.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(clean)) {
        return clean;
    }

    const patterns = [
        /(?:v=|\/v\/|youtu\.be\/|embed\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of patterns) {
        const match = clean.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

function parseJsonOutput(raw: string): any {
    // 1. Try finding output surrounded by __JSON_START__ ... __JSON_END__
    const markerMatch = raw.match(/__JSON_START__([\s\S]*?)__JSON_END__/);
    if (markerMatch && markerMatch[1]) {
        return JSON.parse(markerMatch[1].trim());
    }

    // 2. Try direct parse
    try {
        return JSON.parse(raw.trim());
    } catch {
        // 3. Fallback: find outer-most JSON object boundaries
        const firstBrace = raw.indexOf("{");
        const lastBrace = raw.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const candidate = raw.substring(firstBrace, lastBrace + 1);
            return JSON.parse(candidate);
        }
        throw new Error(`Invalid JSON format: ${raw}`);
    }
}

export async function fetchYouTubeData(youtubeId: string): Promise<YouTubeMetadata> {
    const rawResult = await runPythonScript([
        "extract_audio",
        youtubeId,
        "uploads/songs",
        "uploads/thumbnails"
    ]);

    try {
        const parsed = parseJsonOutput(rawResult);
        if (parsed.error) {
            throw new Error(parsed.error);
        }
        return parsed as YouTubeMetadata;
    } catch (err: any) {
        throw new Error(`Failed to parse YouTube extraction output: ${err.message || rawResult}`);
    }
}
