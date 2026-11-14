import type { SongDetail } from '@/api/songs';
import type { StudyCardRaw } from '@/api/study';

/** Potongan teks dalam satu baris lirik. `reading` = furigana di atasnya, `target` = kata yang sedang dipelajari. */
export type Segment = { text: string; reading?: string; target?: boolean };

export type Flashcard = {
  /** ID frasa dari backend; dipakai saat mengirim penilaian. */
  id: string;
  songId: string;
  /** ID baris lirik asal kartu; dikirim ke server agar baris yang baru dipakai tidak diulang. */
  rowId: string;
  youtubeId: string;
  word: string;
  /** Bacaan kata dalam hiragana. */
  reading: string;
  /** Cara baca huruf latin dari backend; tampil bila diaktifkan di Pengaturan. */
  romaji?: string;
  meaning?: string;
  line: Segment[];
  translation?: string;
  /** Potongan video baris lirik ini (detik). Kosong jika lirik tidak punya waktu. */
  clip?: { startSec: number; endSec: number };
};

const KANJI = /[㐀-鿿々]/;

/** Katakana → hiragana, karena tokenizer biasanya mengembalikan bacaan dalam katakana. */
export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

const clipOf = (hasTimes: boolean, startSec: number, endSec: number) =>
  hasTimes && endSec > startSec ? { startSec, endSec } : undefined;

/** Gabungkan kartu sesi dengan detail lagunya untuk furigana seluruh baris dan ID video klip. */
export function buildCards(cards: StudyCardRaw[], songs: Map<string, SongDetail>): Flashcard[] {
  return cards.flatMap((card) => {
    const song = songs.get(String(card.song_id));
    if (!song) return [];
    const hasTimes = song.lyricsStatus !== 'not_found';
    const row = song.lyricRows.find((r) => r.id === String(card.lyric_row_id) || r.rowOrder === card.row_order);

    let line: Segment[] = [];
    const phrases = [...(row?.phrases ?? [])].sort((a, b) => a.wordOrder - b.wordOrder);
    if (phrases.some((p) => p.phraseId === card.phrase_id)) {
      line = phrases.map((p) => ({
        text: p.surfaceForm,
        reading: KANJI.test(p.surfaceForm) && p.reading ? toHiragana(p.reading) : undefined,
        target: p.phraseId === card.phrase_id,
      }));
    } else {
      // Tanpa data frasa: tandai kata target di dalam teks baris.
      const at = card.raw_text.indexOf(card.surface_form);
      line =
        at >= 0
          ? [
              ...(at > 0 ? [{ text: card.raw_text.slice(0, at) }] : []),
              { text: card.surface_form, target: true },
              ...(at + card.surface_form.length < card.raw_text.length
                ? [{ text: card.raw_text.slice(at + card.surface_form.length) }]
                : []),
            ]
          : [{ text: card.raw_text }];
    }

    return [{
      id: card.phrase_id,
      songId: song.id,
      rowId: String(card.lyric_row_id),
      youtubeId: song.youtubeId,
      word: card.surface_form,
      reading: toHiragana(card.reading ?? ''),
      romaji: card.romaji?.trim() || undefined,
      meaning: card.meaning?.trim() || undefined,
      line,
      translation: card.translation?.trim() || undefined,
      clip: clipOf(hasTimes, row?.startTime ?? card.start_time, row?.endTime ?? card.end_time),
    }];
  });
}
