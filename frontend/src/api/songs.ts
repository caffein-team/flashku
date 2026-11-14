import { api, assetUrl } from './client';

/** Import mengunduh audio dan memproses lirik di server, jadi butuh timeout panjang. */
const LONG_TIMEOUT = 180_000;

export type LyricsStatus = 'synced' | 'plain' | 'custom' | 'not_found';

export type Song = {
  /** ID lagu di database (bukan ID YouTube). */
  id: string;
  youtubeId: string;
  title: string;
  artist: string;
  durationSec: number;
  /** URL penuh thumbnail yang disimpan server. */
  thumbnail?: string;
  language: string;
  lyricsStatus: LyricsStatus;
  lyricsMessage?: string;
  isFavorite: boolean;
  addedAt?: string;
};

export type Phrase = {
  phraseId: string;
  surfaceForm: string;
  dictionaryForm: string;
  reading: string;
  romaji?: string;
  meaning?: string | null;
  wordOrder: number;
};

export type LyricRow = {
  id: string;
  rowOrder: number;
  rawText: string;
  /** Detik pada audio/video. */
  startTime: number;
  endTime: number;
  translation?: string | null;
  phrases: Phrase[];
};

/** `lyricsOffset`: total geseran waktu baris lirik (detik) yang tersimpan di server. */
export type SongDetail = Song & { lyricRows: LyricRow[]; lyricsOffset: number };

export function toSong(raw: any): Song {
  return {
    id: String(raw.id ?? raw._id),
    youtubeId: raw.youtube_id,
    title: raw.title,
    artist: raw.artist ?? '',
    durationSec: Number(raw.duration_seconds) || 0,
    thumbnail: assetUrl(raw.thumbnail_url),
    language: raw.language ?? 'ja',
    lyricsStatus: raw.lyrics_status,
    lyricsMessage: raw.lyrics_message,
    isFavorite: !!raw.is_favorite,
    addedAt: raw.added_at ?? raw.created_at,
  };
}

function toDetail(raw: any): SongDetail {
  return {
    ...toSong(raw),
    lyricsOffset: Number(raw.lyrics_offset) || 0,
    lyricRows: (raw.lyric_rows ?? []).map((r: any): LyricRow => ({
      id: String(r.id ?? `row_${r.row_order}`),
      rowOrder: r.row_order,
      rawText: r.raw_text,
      startTime: Number(r.start_time) || 0,
      endTime: Number(r.end_time) || 0,
      translation: r.translation,
      phrases: (r.phrases ?? []).map((p: any): Phrase => ({
        phraseId: String(p.phrase_id ?? p.id),
        surfaceForm: p.surface_form,
        dictionaryForm: p.dictionary_form,
        reading: p.reading,
        romaji: p.romanization ?? p.romaji,
        meaning: p.meaning,
        wordOrder: p.word_order,
      })),
    })),
  };
}

export const songsApi = {
  /** GET /songs: perpustakaan user, terbaru dulu, dengan paginasi. */
  async list(limit: number, offset: number): Promise<{ items: Song[]; total: number }> {
    const res = await api.get('/songs', { params: { limit, offset } });
    const data = res.data?.data;
    return { items: (data?.items ?? []).map(toSong), total: data?.total ?? 0 };
  },

  /** GET /songs/:id: detail beserta baris lirik dan frasa. */
  async detail(id: string): Promise<SongDetail> {
    const res = await api.get(`/songs/${id}`);
    return toDetail(res.data.data);
  },

  /** POST /songs/import: unduh audio, ambil lirik, pecah frasa. Lagu yang sudah ada dikembalikan dari perpustakaan. */
  async import(youtubeUrl: string): Promise<{ song: Song; message: string }> {
    const res = await api.post('/songs/import', { youtube_url: youtubeUrl }, { timeout: LONG_TIMEOUT });
    return { song: toSong(res.data.data), message: res.data.data?.lyrics_message ?? res.data.message };
  },

  /**
   * PATCH /songs/:id/offset: geser waktu semua baris lirik sebesar `deltaSec` (relatif, bukan nilai akhir).
   * Server menyimpan hasilnya di data lagu, jadi berlaku untuk semua perangkat.
   */
  async shiftOffset(id: string, deltaSec: number): Promise<SongDetail> {
    const res = await api.patch(`/songs/${id}/offset`, { offset_seconds: deltaSec });
    return toDetail(res.data.data);
  },

  /** POST /songs/:id/enrich-ai: terjemahan baris dan arti frasa lewat AI. */
  async enrich(id: string, targetLanguage = 'Indonesian'): Promise<string> {
    const res = await api.post(`/songs/${id}/enrich-ai`, null, {
      params: { target_language: targetLanguage },
      timeout: LONG_TIMEOUT,
    });
    return res.data.message as string;
  },

  /** DELETE /songs/:id: keluarkan lagu dari perpustakaan user dan dari semua deck-nya. */
  async remove(id: string): Promise<void> {
    await api.delete(`/songs/${id}`);
  },

  /** POST /songs/:id/favorite: membalik status favorit; mengembalikan status baru. */
  async toggleFavorite(id: string): Promise<boolean> {
    const res = await api.post(`/songs/${id}/favorite`);
    return !!res.data.data?.is_favorite;
  },
};

export const youtubeUrl = (youtubeId: string) => `https://www.youtube.com/watch?v=${youtubeId}`;

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const LYRICS_STATUS_LABEL: Record<LyricsStatus, string> = {
  synced: 'Lirik tersinkron',
  custom: 'Lirik kustom',
  plain: 'Lirik tanpa waktu',
  not_found: 'Lirik belum ditemukan',
};
