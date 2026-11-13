import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { Ytdl } from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";

export interface YouTubeMetadata {
    youtube_id: string;
    title: string;
    artist: string;
    duration_seconds: number;
    thumbnail_url: string;
    audio_path: string;
}

const ytdl = new Ytdl();

if (ffmpegStatic) {
    ffmpeg.setFfmpegPath(ffmpegStatic);
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

export async function downloadThumbnail(
    remoteUrl: string | undefined,
    youtubeId: string,
    thumbnailsDir: string
): Promise<string> {
    fs.mkdirSync(thumbnailsDir, { recursive: true });
    const localFilename = `${youtubeId}.jpg`;
    const localFilePath = path.resolve(thumbnailsDir, localFilename);
    const localStaticPath = `/uploads/thumbnails/${localFilename}`;

    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 2000) {
        return localStaticPath;
    }

    const candidateUrls: string[] = [];
    if (remoteUrl) candidateUrls.push(remoteUrl);
    candidateUrls.push(
        `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${youtubeId}/sddefault.jpg`,
        `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
        `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
    );

    for (const url of candidateUrls) {
        try {
            const resp = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                }
            });
            if (resp.ok) {
                const arrayBuf = await resp.arrayBuffer();
                const buffer = Buffer.from(arrayBuf);
                if (buffer.length > 2000) {
                    fs.writeFileSync(localFilePath, buffer);
                    return localStaticPath;
                }
            }
        } catch {
            continue;
        }
    }

    return remoteUrl || candidateUrls[0];
}

function findStandaloneYtDlpBinary(): string | null {
    if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
        return process.env.YT_DLP_PATH;
    }
    const candidates = [
        "/usr/local/bin/yt-dlp",
        "/usr/bin/yt-dlp",
        path.resolve(process.cwd(), "bin/yt-dlp"),
        path.resolve(process.cwd(), "bin/yt-dlp.exe"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

async function downloadWithYtDlpBinary(
    binaryPath: string,
    youtubeId: string,
    outputDir: string
): Promise<string> {
    const localFilename = `${youtubeId}.mp3`;
    const localFilePath = path.resolve(outputDir, localFilename);
    const localStaticPath = `/uploads/songs/${localFilename}`;

    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 10000) {
        return localStaticPath;
    }

    const outputTemplate = path.resolve(outputDir, `${youtubeId}.%(ext)s`);
    const args = [
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "192K",
        "-o", outputTemplate,
        `https://www.youtube.com/watch?v=${youtubeId}`
    ];
    if (ffmpegStatic) {
        args.splice(4, 0, "--ffmpeg-location", ffmpegStatic);
    }

    return new Promise((resolve, reject) => {
        const proc = spawn(binaryPath, args, { stdio: "ignore" });
        proc.on("error", reject);
        proc.on("close", (code) => {
            if (code === 0 && fs.existsSync(localFilePath)) {
                resolve(localStaticPath);
            } else {
                reject(new Error(`yt-dlp binary exited with code ${code}`));
            }
        });
    });
}

async function downloadAudioPureNode(
    youtubeId: string,
    outputDir: string
): Promise<string> {
    const localFilename = `${youtubeId}.mp3`;
    const localFilePath = path.resolve(outputDir, localFilename);
    const localStaticPath = `/uploads/songs/${localFilename}`;

    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 10000) {
        return localStaticPath;
    }

    const stream = await ytdl.download(youtubeId, {
        filter: { hasAudio: true, hasVideo: false },
        quality: "highestaudio",
    });

    await new Promise<void>((resolve, reject) => {
        const proc = ffmpeg(stream)
            .audioCodec("libmp3lame")
            .audioBitrate(192)
            .format("mp3")
            .on("error", (err) => {
                if (fs.existsSync(localFilePath)) {
                    try { fs.unlinkSync(localFilePath); } catch {}
                }
                reject(err);
            })
            .on("end", () => {
                resolve();
            });

        proc.save(localFilePath);
    });

    return localStaticPath;
}

export async function fetchYouTubeData(youtubeId: string): Promise<YouTubeMetadata> {
    const outputDir = path.resolve(process.cwd(), "uploads/songs");
    const thumbnailsDir = path.resolve(process.cwd(), "uploads/thumbnails");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(thumbnailsDir, { recursive: true });

    let title = "Unknown Title";
    let artist = "Unknown Artist";
    let durationSeconds = 0;
    let rawThumbnail: string | undefined;

    try {
        const info = await ytdl.getInfo(youtubeId);
        title = info.videoDetails.title || "Unknown Title";
        artist = info.videoDetails.author?.name || "Unknown Artist";
        durationSeconds = Number(info.videoDetails.lengthSeconds) || 0;
        if (info.videoDetails.thumbnails && info.videoDetails.thumbnails.length > 0) {
            rawThumbnail = info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url;
        }
    } catch (infoErr: any) {
        const ytDlpBin = findStandaloneYtDlpBinary();
        if (!ytDlpBin) {
            throw new Error(`Failed to fetch YouTube metadata: ${infoErr.message}`);
        }
    }

    const localThumbnailPath = await downloadThumbnail(rawThumbnail, youtubeId, thumbnailsDir);

    let localAudioPath: string;
    try {
        localAudioPath = await downloadAudioPureNode(youtubeId, outputDir);
    } catch (nodeErr: any) {
        const ytDlpBin = findStandaloneYtDlpBinary();
        if (ytDlpBin) {
            localAudioPath = await downloadWithYtDlpBinary(ytDlpBin, youtubeId, outputDir);
        } else {
            throw new Error(`Failed to extract YouTube audio: ${nodeErr.message}`);
        }
    }

    return {
        youtube_id: youtubeId,
        title,
        artist,
        duration_seconds: durationSeconds,
        thumbnail_url: localThumbnailPath,
        audio_path: localAudioPath,
    };
}
