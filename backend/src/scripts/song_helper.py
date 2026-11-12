import sys
import os
import re
import json
import urllib.request
from pathlib import Path

# Force UTF-8 encoding for standard I/O
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")

# Japanese POS Mapping
POS_MAP = {
    "名詞": "Noun",
    "動詞": "Verb",
    "形容詞": "Adjective",
    "副詞": "Adverb",
    "助詞": "Particle",
    "助動詞": "Auxiliary Verb",
    "接続詞": "Conjunction",
    "感動詞": "Interjection",
    "連体詞": "Pre-noun Adjectival",
}

# Kana to Romaji Mapping Table
KANA_ROMAJI_MAP = {
    "あ": "a", "い": "i", "う": "u", "え": "e", "お": "o",
    "か": "ka", "き": "ki", "く": "ku", "け": "ke", "こ": "ko",
    "さ": "sa", "し": "shi", "す": "su", "せ": "se", "そ": "so",
    "た": "ta", "ち": "chi", "つ": "tsu", "て": "te", "と": "to",
    "な": "na", "に": "ni", "ぬ": "nu", "ね": "ne", "の": "no",
    "は": "ha", "ひ": "hi", "ふ": "fu", "へ": "he", "ほ": "ho",
    "ま": "ma", "み": "mi", "む": "mu", "me": "me", "も": "mo",
    "や": "ya", "ゆ": "yu", "よ": "yo",
    "ら": "ra", "り": "ri", "る": "ru", "れ": "re", "ろ": "ro",
    "わ": "wa", "を": "wo", "ん": "n",
    "が": "ga", "ぎ": "gi", "ぐ": "gu", "げ": "ge", "ご": "go",
    "ざ": "za", "じ": "ji", "ず": "zu", "ぜ": "ze", "ぞ": "zo",
    "だ": "da", "ぢ": "ji", "づ": "zu", "で": "de", "ど": "do",
    "ば": "ba", "び": "bi", "ぶ": "bu", "べ": "be", "ぼ": "bo",
    "ぱ": "pa", "ぴ": "pi", "ぷ": "pu", "ぺ": "pe", "ぽ": "po",
    "きゃ": "kya", "きゅ": "kyu", "きょ": "kyo",
    "しゃ": "sha", "しゅ": "shu", "しょ": "sho",
    "ちゃ": "cha", "ちゅ": "chu", "ちょ": "cho",
    "にゃ": "nya", "にゅ": "nyu", "にょ": "nyo",
    "ひゃ": "hya", "ひゅ": "hyu", "ひょ": "hyo",
    "みゃ": "mya", "みゅ": "myu", "みょ": "myo",
    "りゃ": "rya", "りゅ": "ryu", "りょ": "ryo",
    "ぎゃ": "gya", "ぎゅ": "gyu", "ぎょ": "gyo",
    "じゃ": "ja", "じゅ": "ju", "じょ": "jo",
    "びゃ": "bya", "びゅ": "byu", "びょ": "byo",
    "ぴゃ": "pya", "ぴゅ": "pyu", "ぴょ": "pyo",
    "っ": "",
}

def katakana_to_hiragana(text: str) -> str:
    if not text:
        return ""
    result = []
    for char in text:
        code = ord(char)
        if 0x30A1 <= code <= 0x30F6:
            result.append(chr(code - 0x60))
        else:
            result.append(char)
    return "".join(result)

def hiragana_to_romaji(text: str) -> str:
    if not text:
        return ""
    romaji = []
    i = 0
    length = len(text)
    while i < length:
        if i + 1 < length and text[i:i+2] in KANA_ROMAJI_MAP:
            romaji.append(KANA_ROMAJI_MAP[text[i:i+2]])
            i += 2
        elif text[i] == "っ" and i + 1 < length:
            next_char = text[i+1]
            next_romaji = KANA_ROMAJI_MAP.get(next_char, "")
            if next_romaji:
                romaji.append(next_romaji[0])
            i += 1
        elif text[i] in KANA_ROMAJI_MAP:
            romaji.append(KANA_ROMAJI_MAP[text[i]])
            i += 1
        else:
            romaji.append(text[i])
            i += 1
    return "".join(romaji)

def download_thumbnail(remote_url: str, youtube_id: str, thumbnails_dir: Path) -> str:
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

def extract_audio(youtube_id: str, output_dir_str: str, thumbnails_dir_str: str):
    import yt_dlp
    import imageio_ffmpeg
    import io

    class NullLogger:
        def debug(self, msg):
            pass
        def warning(self, msg):
            pass
        def error(self, msg):
            pass

    output_dir = Path(output_dir_str)
    thumbnails_dir = Path(thumbnails_dir_str)
    output_dir.mkdir(parents=True, exist_ok=True)
    thumbnails_dir.mkdir(parents=True, exist_ok=True)

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    output_template = str(output_dir / f"{youtube_id}.%(ext)s")

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
        "noprogress": True,
        "logger": NullLogger(),
    }

    old_stdout = sys.stdout
    sys.stdout = io.StringIO()
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
    finally:
        sys.stdout = old_stdout

    title = info.get("title") or "Unknown Title"
    artist = info.get("artist") or info.get("uploader") or info.get("channel") or "Unknown Artist"
    duration = info.get("duration") or 0
    raw_thumbnail = info.get("thumbnail")

    local_thumbnail_path = download_thumbnail(raw_thumbnail, youtube_id, thumbnails_dir)
    audio_filename = f"{youtube_id}.mp3"
    audio_path = f"/uploads/songs/{audio_filename}"

    return {
        "youtube_id": youtube_id,
        "title": title,
        "artist": artist,
        "duration_seconds": int(duration),
        "thumbnail_url": local_thumbnail_path,
        "audio_path": audio_path,
    }

def tokenize_batch(lines: list):
    from janome.tokenizer import Tokenizer
    tokenizer = Tokenizer()
    results = []

    for line_text in lines:
        if not line_text or not line_text.strip():
            results.append([])
            continue

        tokens = tokenizer.tokenize(line_text)
        phrases = []
        word_order = 1

        for token in tokens:
            surface = token.surface.strip()
            pos_primary = token.part_of_speech.split(",")[0]
            if not surface or pos_primary == "記号":
                continue

            base_form = token.base_form if token.base_form != "*" else surface
            raw_reading = token.reading if token.reading != "*" else surface
            hiragana_reading = katakana_to_hiragana(raw_reading)
            romaji = hiragana_to_romaji(hiragana_reading)
            pos_english = POS_MAP.get(pos_primary, pos_primary)

            phrases.append({
                "surface_form": surface,
                "dictionary_form": base_form,
                "reading": hiragana_reading,
                "romaji": romaji,
                "part_of_speech": pos_english,
                "meaning": None,
                "word_order": word_order
            })
            word_order += 1

        results.append(phrases)

    return results

def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command argument"}))
        sys.exit(1)

    cmd = sys.argv[1]

    try:
        if cmd == "extract_audio":
            youtube_id = sys.argv[2]
            output_dir = sys.argv[3]
            thumbnails_dir = sys.argv[4]
            data = extract_audio(youtube_id, output_dir, thumbnails_dir)
            print("__JSON_START__" + json.dumps(data) + "__JSON_END__")
        elif cmd == "tokenize_batch":
            input_data = sys.stdin.read()
            lines = json.loads(input_data)
            data = tokenize_batch(lines)
            print("__JSON_START__" + json.dumps(data) + "__JSON_END__")
        else:
            print(json.dumps({"error": f"Unknown command: {cmd}"}))
            sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
