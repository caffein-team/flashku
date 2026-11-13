import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";

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

let cachedBinaryPath: string | null = null;

export async function ensureYtDlpBinary(): Promise<string> {
    if (cachedBinaryPath && fs.existsSync(cachedBinaryPath)) {
        return cachedBinaryPath;
    }

    if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
        cachedBinaryPath = process.env.YT_DLP_PATH;
        return cachedBinaryPath;
    }

    const isWin = process.platform === "win32";
    const filename = isWin ? "yt-dlp.exe" : "yt-dlp";

    const candidates = [
        path.resolve(process.cwd(), "bin", filename),
        path.resolve(process.cwd(), filename),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            cachedBinaryPath = candidate;
            return candidate;
        }
    }

    // Auto-download standalone binary if missing
    const binDir = path.resolve(process.cwd(), "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const targetPath = path.resolve(binDir, filename);

    const downloadUrl = isWin
        ? "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
        : "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

    console.log(`[YouTube Extractor] Downloading standalone yt-dlp binary from ${downloadUrl}...`);
    const resp = await fetch(downloadUrl, { redirect: "follow" });
    if (!resp.ok) {
        throw new Error(`Failed to download standalone yt-dlp binary: ${resp.status} ${resp.statusText}`);
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(targetPath, buffer);
    if (!isWin) {
        fs.chmodSync(targetPath, 0o755);
    }
    console.log(`[YouTube Extractor] Standalone yt-dlp binary downloaded successfully to ${targetPath}`);

    cachedBinaryPath = targetPath;
    return targetPath;
}

export function findCookieFile(): string | null {
    // 1. Explicit path in env
    if (process.env.YOUTUBE_COOKIE_FILE && fs.existsSync(process.env.YOUTUBE_COOKIE_FILE)) {
        try {
            const stat = fs.statSync(process.env.YOUTUBE_COOKIE_FILE);
            if (stat.size > 20) {
                return process.env.YOUTUBE_COOKIE_FILE;
            }
        } catch {
            // ignore
        }
    }

    // 2. Candidate files on disk
    const candidates = [
        path.resolve(process.cwd(), "cookies.txt"),
        path.resolve(process.cwd(), "../cookies.txt"),
        path.resolve(process.cwd(), "config/cookies.txt"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            try {
                const stat = fs.statSync(candidate);
                if (stat.size > 20) {
                    return candidate;
                }
            } catch {
                // ignore
            }
        }
    }

    // 3. Base64 encoded cookies in env
    if (process.env.YOUTUBE_COOKIES_BASE64) {
        try {
            const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64.trim(), "base64").toString("utf-8");
            if (decoded.length > 20) {
                const target = path.resolve(process.cwd(), "cookies.txt");
                fs.writeFileSync(target, decoded, "utf-8");
                return target;
            }
        } catch (e: any) {
            console.warn(`[YouTube Extractor] Failed to decode YOUTUBE_COOKIES_BASE64: ${e.message}`);
        }
    }

    // 4. Raw text cookies in env
    if (process.env.YOUTUBE_COOKIES_TEXT) {
        try {
            const text = process.env.YOUTUBE_COOKIES_TEXT.trim();
            if (text.length > 20) {
                const target = path.resolve(process.cwd(), "cookies.txt");
                fs.writeFileSync(target, text, "utf-8");
                return target;
            }
        } catch (e: any) {
            console.warn(`[YouTube Extractor] Failed to write YOUTUBE_COOKIES_TEXT: ${e.message}`);
        }
    }

    return null;
}

function buildBaseYtDlpArgs(cookieFile: string | null): string[] {
    const args: string[] = [
        "-4", // Force IPv4
        "--no-warnings",
        "--remote-components", "ejs:github",
        "--js-runtimes", `node:${process.execPath}`,
        "--user-agent", process.env.YOUTUBE_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    ];

    if (cookieFile) {
        args.push("--cookies", cookieFile);
    }

    return args;
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

async function extractAudioWithYtDlp(
    youtubeId: string,
    outputDir: string
): Promise<string> {
    const localFilename = `${youtubeId}.mp3`;
    const localFilePath = path.resolve(outputDir, localFilename);
    const localStaticPath = `/uploads/songs/${localFilename}`;

    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).size > 10000) {
        return localStaticPath;
    }

    const binary = await ensureYtDlpBinary();
    const outputTemplate = path.resolve(outputDir, `${youtubeId}.%(ext)s`);
    const cookieFile = findCookieFile();

    if (cookieFile) {
        console.log(`[YouTube Extractor] Using cookies from: ${cookieFile} (Size: ${fs.statSync(cookieFile).size} bytes)`);
    } else {
        console.log(`[YouTube Extractor] No cookies detected. Running in anonymous mode (Cloud Datacenter IPs may be blocked).`);
    }

    const args: string[] = [
        ...buildBaseYtDlpArgs(cookieFile),
        "--no-progress",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "192K",
    ];

    if (ffmpegStatic) {
        args.push("--ffmpeg-location", ffmpegStatic);
    }

    args.push("-o", outputTemplate, `https://www.youtube.com/watch?v=${youtubeId}`);

    return new Promise((resolve, reject) => {
        const proc = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";

        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        proc.on("close", (code) => {
            if (code === 0 && fs.existsSync(localFilePath)) {
                resolve(localStaticPath);
            } else {
                const isBlocked =
                    stderr.includes("bot") ||
                    stderr.includes("cookies") ||
                    stderr.includes("Sign in") ||
                    stderr.includes("The page needs to be reloaded") ||
                    stderr.includes("UNPLAYABLE");

                if (isBlocked) {
                    if (cookieFile) {
                        reject(new Error(
                            "YouTube menolak akses: Cookie di 'cookies.txt' mungkin sudah kedaluwarsa atau tidak lengkap. " +
                            "Solusi: Ekspor ulang cookies dari browser Anda saat sedang login ke YouTube lalu ganti isi cookies.txt."
                        ));
                    } else {
                        reject(new Error(
                            "YouTube memblokir IP Datacenter VPS (Anti-Bot Check: 'Sign in to confirm you're not a bot'). " +
                            "Solusi: Pasang file 'cookies.txt' akun YouTube Anda di root direktori backend VPS (atau set YOUTUBE_COOKIE_FILE / YOUTUBE_COOKIES_BASE64 di .env)."
                        ));
                    }
                } else {
                    reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(-300)}`));
                }
            }
        });

        proc.on("error", (err) => {
            reject(err);
        });
    });
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

    // 1. First attempt: Official YouTube oEmbed API (Never blocked on datacenter IPs)
    try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
        const resp = await fetch(oembedUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });
        if (resp.ok) {
            const data: any = await resp.json();
            if (data.title) title = data.title;
            if (data.author_name) artist = data.author_name;
            if (data.thumbnail_url) rawThumbnail = data.thumbnail_url;
        }
    } catch {
        // oEmbed fallback ignored
    }

    // 2. Fetch metadata & duration via standalone yt-dlp if duration not found
    try {
        const binary = await ensureYtDlpBinary();
        const cookieFile = findCookieFile();
        const jsonArgs = [
            ...buildBaseYtDlpArgs(cookieFile),
            "--dump-json",
            "--skip-download",
            `https://www.youtube.com/watch?v=${youtubeId}`
        ];

        const jsonOut = await new Promise<string>((resolve, reject) => {
            const proc = spawn(binary, jsonArgs);
            let stdout = "";
            let stderr = "";
            proc.stdout.on("data", (d) => stdout += d.toString());
            proc.stderr.on("data", (d) => stderr += d.toString());
            proc.on("close", (code) => {
                if (code === 0 && stdout) resolve(stdout);
                else reject(new Error(stderr.slice(-200) || `Exit code ${code}`));
            });
            proc.on("error", reject);
        });

        const meta = JSON.parse(jsonOut);
        if (meta.title && title === "Unknown Title") title = meta.title;
        if ((meta.uploader || meta.artist || meta.channel) && artist === "Unknown Artist") {
            artist = meta.artist || meta.uploader || meta.channel;
        }
        if (meta.duration) durationSeconds = Math.round(Number(meta.duration)) || 0;
        if (!rawThumbnail && meta.thumbnail) rawThumbnail = meta.thumbnail;
    } catch (err: any) {
        console.warn(`[YouTube Extractor Warning] Failed to get yt-dlp json metadata: ${err.message}`);
    }

    // 3. Download thumbnail
    const localThumbnailPath = await downloadThumbnail(rawThumbnail, youtubeId, thumbnailsDir);

    // 4. Download audio to MP3 using standalone yt-dlp
    const localAudioPath = await extractAudioWithYtDlp(youtubeId, outputDir);

    return {
        youtube_id: youtubeId,
        title,
        artist,
        duration_seconds: durationSeconds,
        thumbnail_url: localThumbnailPath,
        audio_path: localAudioPath,
    };
}
