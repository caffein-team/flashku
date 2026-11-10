import sys
import json
import logging
from pathlib import Path
import re
import urllib.request
import imageio_ffmpeg
import yt_dlp

def extract_youtube_id(url_or_id: str):
    if not url_or_id:
        return None
    url_or_id = url_or_id.strip()
    if len(url_or_id) == 11 and re.match(r"^[a-zA-Z0-9_-]{11}$", url_or_id):
        return url_or_id
    patterns = [
        r"(?:v=|\/v\/|youtu\.be\/|embed\/|\/shorts\/|\/live\/)([a-zA-Z0-9_-]{11})",
        r"^([a-zA-Z0-9_-]{11})$",
    ]
    for pattern in patterns:
        m = re.search(pattern, url_or_id)
        if m:
            return m.group(1)
    return None

def download_thumbnail(remote_url, youtube_id, thumbnails_dir: Path):
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
            pass

    return remote_url or candidate_urls[0]

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing youtube_id argument"}))
        sys.exit(1)

    url_or_id = sys.argv[1]
    youtube_id = extract_youtube_id(url_or_id)
    if not youtube_id:
        print(json.dumps({"error": "Invalid YouTube URL or ID"}))
        sys.exit(1)

    songs_dir = Path("uploads/songs")
    thumbnails_dir = Path("uploads/thumbnails")
    songs_dir.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    target_mp3 = songs_dir / f"{youtube_id}.mp3"
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    output_template = str(songs_dir / f"{youtube_id}.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "ffmpeg_location": ffmpeg_exe,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=not target_mp3.exists())
            title = info.get("title") or "Unknown Title"
            artist = info.get("artist") or info.get("uploader") or info.get("channel") or "Unknown Artist"
            duration = info.get("duration") or 0
            raw_thumbnail = info.get("thumbnail")

            local_thumbnail_path = download_thumbnail(raw_thumbnail, youtube_id, thumbnails_dir)
            audio_path = f"/uploads/songs/{youtube_id}.mp3"

            result = {
                "youtube_id": youtube_id,
                "title": title,
                "artist": artist,
                "duration_seconds": int(duration),
                "thumbnail_url": local_thumbnail_path,
                "audio_path": audio_path,
            }
            print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
