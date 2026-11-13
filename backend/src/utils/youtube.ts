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

function findCookieFile(): string | null {
    if (process.env.YOUTUBE_COOKIE_FILE && fs.existsSync(process.env.YOUTUBE_COOKIE_FILE)) {
        return process.env.YOUTUBE_COOKIE_FILE;
    }
    const candidates = [
        path.resolve(process.cwd(), "cookies.txt"),
        path.resolve(process.cwd(), "../cookies.txt"),
        path.resolve(process.cwd(), "config/cookies.txt"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    if (process.env.YOUTUBE_COOKIES_BASE64) {
        try {
            const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, "base64").toString("utf-8");
            const target = path.resolve(process.cwd(), "cookies.txt");
            fs.writeFileSync(target, decoded, "utf-8");
            return target;
        } catch {
            // ignore
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

    const args: string[] = [
        "-4", // Force IPv4 to avoid blacklisted datacenter IPv6 blocks
        "--no-warnings",
        "--no-progress",
        "--js-runtimes", `node:${process.execPath}`,
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "192K",
    ];

    if (ffmpegStatic) {
        args.push("--ffmpeg-location", ffmpegStatic);
    }

    // Automatically detect cookies.txt or YOUTUBE_COOKIE_FILE
    const cookieFile = findCookieFile();
    if (cookieFile) {
        args.push("--cookies", cookieFile);
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
                    reject(new Error(
                        "YouTube memblokir unduhan (Anti-Bot / IP / Sign-In Check: 'The page needs to be reloaded'). " +
                        "Solusi: Pasang file 'cookies.txt' akun YouTube Anda di root direktori backend (atau set YOUTUBE_COOKIE_FILE di .env)."
                    ));
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

export function findPythonExecutable(): string {
    if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
        return process.env.PYTHON_PATH;
    }

    const isWin = process.platform === "win32";
    const venvPythonCandidates = isWin
        ? [
            path.resolve(process.cwd(), ".venv/Scripts/python.exe"),
            path.resolve(process.cwd(), "venv/Scripts/python.exe"),
            path.resolve(process.cwd(), "../.venv/Scripts/python.exe"),
            path.resolve(process.cwd(), "prototype/.venv/Scripts/python.exe"),
        ]
        : [
            path.resolve(process.cwd(), ".venv/bin/python"),
            path.resolve(process.cwd(), ".venv/bin/python3"),
            path.resolve(process.cwd(), "venv/bin/python"),
            path.resolve(process.cwd(), "venv/bin/python3"),
            path.resolve(process.cwd(), "../.venv/bin/python"),
            path.resolve(process.cwd(), "prototype/.venv/bin/python"),
            "/usr/bin/python3",
            "/usr/local/bin/python3",
        ];

    for (const cand of venvPythonCandidates) {
        if (fs.existsSync(cand)) {
            return cand;
        }
    }

    return isWin ? "python" : "python3";
}

export async function extractWithPython(
    youtubeId: string,
    outputDir: string,
    thumbnailsDir: string
): Promise<YouTubeMetadata> {
    const pythonExe = findPythonExecutable();
    const scriptPath = path.resolve(process.cwd(), "scripts/extract_youtube.py");

    if (!fs.existsSync(scriptPath)) {
        throw new Error(`Python script not found at ${scriptPath}`);
    }

    const args = [
        scriptPath,
        youtubeId,
        "--output-dir", outputDir,
        "--thumbnails-dir", thumbnailsDir,
    ];

    if (ffmpegStatic) {
        args.push("--ffmpeg-location", ffmpegStatic);
    }

    const cookieFile = findCookieFile();
    if (cookieFile) {
        args.push("--cookies", cookieFile);
    }

    return new Promise((resolve, reject) => {
        const proc = spawn(pythonExe, args, {
            stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, PYTHONUNBUFFERED: "1" }
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });

        proc.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });

        proc.on("close", (code) => {
            const jsonMatch = stdout.match(/\{"success":\s*(true|false)[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.success && parsed.data) {
                        return resolve(parsed.data);
                    }
                    if (parsed.success === false && parsed.error) {
                        return reject(new Error(parsed.error));
                    }
                } catch {
                    // Ignore parse error and fall through
                }
            }

            const errMsg = stderr || stdout || `Python exited with code ${code}`;
            reject(new Error(`Python extraction failed: ${errMsg.slice(-300)}`));
        });

        proc.on("error", (err) => {
            reject(new Error(`Failed to start Python process (${pythonExe}): ${err.message}`));
        });
    });
}

export async function fetchYouTubeData(youtubeId: string): Promise<YouTubeMetadata> {
    const outputDir = path.resolve(process.cwd(), "uploads/songs");
    const thumbnailsDir = path.resolve(process.cwd(), "uploads/thumbnails");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(thumbnailsDir, { recursive: true });

    // 1. Primary method: Dedicated Python extractor script
    try {
        console.log(`[YouTube Extractor] Attempting extraction via Python script for ${youtubeId}...`);
        const pythonResult = await extractWithPython(youtubeId, outputDir, thumbnailsDir);
        console.log(`[YouTube Extractor] Python extraction succeeded for ${youtubeId}`);
        return pythonResult;
    } catch (pyErr: any) {
        console.warn(`[YouTube Extractor] Python extractor failed (${pyErr.message}). Attempting standalone yt-dlp fallback...`);
    }

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
    } catch (e) {
        // oEmbed fallback ignored
    }

    // 2. Fetch metadata & duration via standalone yt-dlp if duration not found
    try {
        const binary = await ensureYtDlpBinary();
        const jsonArgs = [
            "-4",
            "--no-warnings",
            "--dump-json",
            "--skip-download",
            "--js-runtimes", `node:${process.execPath}`,
            `https://www.youtube.com/watch?v=${youtubeId}`
        ];
        const cookieFile = findCookieFile();
        if (cookieFile) {
            jsonArgs.push("--cookies", cookieFile);
        }

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
