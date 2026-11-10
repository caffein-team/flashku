import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import util from "util";

const execFileAsync = util.promisify(execFile);

export function extractYoutubeId(urlOrId: string): string | null {
    if (!urlOrId) return null;
    const clean = urlOrId.trim();

    if (clean.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(clean)) {
        return clean;
    }

    const patterns = [
        /(?:v=|\/v\/|youtu\.be\/|embed\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];

    for (const pattern of patterns) {
        const match = clean.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }

    return null;
}

export interface YoutubeMetadataResult {
    youtube_id: string;
    title: string;
    artist: string;
    duration_seconds: number;
    thumbnail_url: string;
    audio_path: string;
}

export async function fetchYoutubeMetadataAndAudio(youtubeId: string): Promise<YoutubeMetadataResult> {
    const pythonVenv = path.resolve(process.cwd(), "be/.venv/Scripts/python.exe");
    const pythonExe = fs.existsSync(pythonVenv) ? pythonVenv : "python";
    const scriptPath = path.resolve(process.cwd(), "scripts/download_youtube.py");

    const { stdout, stderr } = await execFileAsync(pythonExe, [scriptPath, youtubeId], {
        cwd: process.cwd(),
        maxBuffer: 10 * 1024 * 1024,
    });

    const outTrimmed = stdout.trim();
    if (!outTrimmed) {
        throw new Error(stderr || "Empty output from YouTube downloader script");
    }

    const lines = outTrimmed.split("\n").filter((l) => l.trim().startsWith("{"));
    const jsonStr = lines[lines.length - 1] || outTrimmed;

    let parsed: any;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error(`Failed to parse YouTube download output: ${outTrimmed}`);
    }

    if (parsed.error) {
        throw new Error(parsed.error);
    }

    return parsed as YoutubeMetadataResult;
}
