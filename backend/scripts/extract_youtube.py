import argparse
import base64
import json
import os
from pathlib import Path
import re
import shutil
import sys
from typing import Any, Dict, Optional
import urllib.request


def extract_youtube_id(url_or_id: str) -> Optional[str]:
    if not url_or_id:
        return None
    clean = url_or_id.strip()
    if len(clean) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", clean):
        return clean

    patterns = [
        r"(?:v=|\/v\/|youtu\.be\/|embed\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})",
        r"^([a-zA-Z0-9_-]{11})$",
    ]
    for pattern in patterns:
        m = re.search(pattern, clean)
        if m:
            return m.group(1)
    return None


def find_cookie_file(explicit_path: Optional[str] = None) -> Optional[str]:
    if explicit_path and os.path.exists(explicit_path):
        return explicit_path

    env_path = os.getenv("YOUTUBE_COOKIE_FILE")
    if env_path and os.path.exists(env_path):
        return env_path

    cwd = Path.cwd()
    candidates = [
        cwd / "cookies.txt",
        cwd.parent / "cookies.txt",
        cwd / "config" / "cookies.txt",
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate.resolve())

    # Base64 in environment variable
    b64 = os.getenv("YOUTUBE_COOKIES_BASE64")
    if b64:
        try:
            target = cwd / "cookies.txt"
            decoded = base64.b64decode(b64.encode("utf-8"))
            with open(target, "wb") as f:
                f.write(decoded)
            return str(target.resolve())
        except Exception:
            pass

    return None


def download_thumbnail(remote_url: Optional[str], youtube_id: str, thumbnails_dir: Path) -> str:
    thumbnails_dir.mkdir(parents=True, exist_ok=True)
    local_filename = f"{youtube_id}.jpg"
    local_filepath = thumbnails_dir / local_filename
    local_static_path = f"/uploads/thumbnails/{local_filename}"

    if local_filepath.exists() and local_filepath.stat().st_size > 2000:
        return local_static_path

    candidate_urls = []
    if remote_url:
        candidate_urls.append(remote_url)
    candidate_urls.extend([
        f"https://img.youtube.com/vi/{youtube_id}/maxresdefault.jpg",
        f"https://img.youtube.com/vi/{youtube_id}/sddefault.jpg",
        f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg",
        f"https://img.youtube.com/vi/{youtube_id}/mqdefault.jpg",
    ])

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

    for url in candidate_urls:
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=6) as resp:
                if resp.status == 200:
                    data = resp.read()
                    if len(data) > 2000:
                        with open(local_filepath, "wb") as f:
                            f.write(data)
                        return local_static_path
        except Exception:
            continue

    return remote_url or candidate_urls[0]


def extract(
    youtube_input: str,
    output_dir_str: str,
    thumbnails_dir_str: str,
    ffmpeg_location: Optional[str] = None,
    cookie_file: Optional[str] = None,
) -> Dict[str, Any]:
    youtube_id = extract_youtube_id(youtube_input)
    if not youtube_id:
        raise ValueError(f"Invalid YouTube URL or ID: {youtube_input}")

    output_dir = Path(output_dir_str).resolve()
    thumbnails_dir = Path(thumbnails_dir_str).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    try:
        import yt_dlp
    except ImportError:
        raise ImportError(
            "Package 'yt_dlp' is not installed in Python environment. "
            "Please run: pip install -r scripts/requirements.txt"
        )

    # Detect ffmpeg
    ffmpeg_exe = ffmpeg_location
    if not ffmpeg_exe:
        try:
            import imageio_ffmpeg
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
        except ImportError:
            pass

    resolved_cookie_file = find_cookie_file(cookie_file)
    output_template = str(output_dir / f"{youtube_id}.%(ext)s")
    target_mp3 = output_dir / f"{youtube_id}.mp3"

    ydl_opts: Dict[str, Any] = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "source_address": "0.0.0.0",  # Force IPv4
        "quiet": True,
        "no_warnings": True,
        "remote_components": ["ejs:github"],
        "js_runtimes": {
            "node": {},
            "deno": {},
        },
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
    }

    node_bin = shutil.which("node")
    if node_bin:
        ydl_opts["js_runtimes"]["node"]["path"] = node_bin

    if ffmpeg_exe and os.path.exists(ffmpeg_exe):
        ydl_opts["ffmpeg_location"] = ffmpeg_exe

    if resolved_cookie_file and os.path.exists(resolved_cookie_file):
        ydl_opts["cookiefile"] = resolved_cookie_file

    url = f"https://www.youtube.com/watch?v={youtube_id}"

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        title = info.get("title") or "Unknown Title"
        artist = info.get("artist") or info.get("uploader") or info.get("channel") or "Unknown Artist"
        duration = int(info.get("duration") or 0)
        raw_thumbnail = info.get("thumbnail")

        local_thumbnail = download_thumbnail(raw_thumbnail, youtube_id, thumbnails_dir)

        if not target_mp3.exists() or target_mp3.stat().st_size < 1000:
            raise RuntimeError(f"Audio file {target_mp3} was not created successfully.")

        return {
            "youtube_id": youtube_id,
            "title": title,
            "artist": artist,
            "duration_seconds": duration,
            "thumbnail_url": local_thumbnail,
            "audio_path": f"/uploads/songs/{youtube_id}.mp3",
        }


def main():
    # If the user passed an ID starting with '-' like '-tKVN2mAKRI', argparse may misinterpret it.
    # Convert any raw '-...' argument that is an 11-char ID into 'https://www.youtube.com/watch?v=...'
    sanitized_argv = [sys.argv[0]]
    for arg in sys.argv[1:]:
        if arg.startswith("-") and not arg.startswith("--") and len(arg) == 11:
            sanitized_argv.append(f"https://www.youtube.com/watch?v={arg}")
        else:
            sanitized_argv.append(arg)

    parser = argparse.ArgumentParser(description="YouTube Audio and Metadata Extractor")
    parser.add_argument("url_or_id", nargs="?", default=None, help="YouTube Video URL or 11-char ID")
    parser.add_argument("--url", default=None, help="YouTube Video URL or ID")
    parser.add_argument("--output-dir", default="uploads/songs", help="Path to save MP3 songs")
    parser.add_argument("--thumbnails-dir", default="uploads/thumbnails", help="Path to save thumbnails")
    parser.add_argument("--ffmpeg-location", default=None, help="Path to ffmpeg executable")
    parser.add_argument("--cookies", default=None, help="Path to cookies.txt")

    args = parser.parse_args(sanitized_argv[1:])

    video_input = args.url or args.url_or_id
    if not video_input:
        parser.error("url_or_id or --url is required")

    try:
        data = extract(
            youtube_input=video_input,
            output_dir_str=args.output_dir,
            thumbnails_dir_str=args.thumbnails_dir,
            ffmpeg_location=args.ffmpeg_location,
            cookie_file=args.cookies,
        )
        sys.stdout.write("\n")
        print(json.dumps({"success": True, "data": data}))
        sys.stdout.flush()
    except Exception as exc:
        err_msg = str(exc)
        sys.stderr.write("\n")
        print(json.dumps({"success": False, "error": err_msg}), file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
