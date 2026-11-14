import { api } from './client';

/** Satu kartu dari sesi belajar: satu frasa dalam satu baris lirik (bentuk respons backend). */
export type StudyCardRaw = {
  phrase_id: string;
  surface_form: string;
  dictionary_form: string;
  reading: string;
  romaji?: string;
  meaning?: string | null;
  lyric_row_id: string | number;
  row_order: number;
  raw_text: string;
  start_time: number;
  end_time: number;
  translation?: string | null;
  song_id: string;
  repetition_count: number;
  next_review_at?: string | null;
};

/** Penilaian SM-2 di backend. UI memakai dua: Sulit = again, Mudah = good; hard dan easy juga diterima server. */
export type Rating = 'again' | 'hard' | 'good' | 'easy';

export type StudySession = { sessionId: string; cards: StudyCardRaw[] };

/** Lanjutan sesi: id sesi yang sama dan yang sudah muncul, supaya server memilih kartu yang berbeda. */
export type SessionContinuation = {
  sessionId?: string;
  excludePhraseIds?: string[];
  excludeRowIds?: string[];
};

export const studyApi = {
  /**
   * POST /study/session: kartu untuk satu lagu, satu deck, atau semua lagu (tanpa id).
   * Server terbaru memberi satu kartu adaptif per permintaan; yang lama memberi daftar kartu jatuh tempo.
   * Keduanya terbaca sebagai `cards`.
   */
  async startSession(
    scope: { songId: string } | { deckId: string } | { all: true },
    more: SessionContinuation = {},
    limit = 20,
  ): Promise<StudySession> {
    const body = 'songId' in scope ? { song_id: scope.songId } : 'deckId' in scope ? { deck_id: scope.deckId } : {};
    const res = await api.post('/study/session', {
      ...body,
      ...(more.sessionId && { session_id: more.sessionId }),
      ...(more.excludePhraseIds?.length && { exclude_phrase_ids: more.excludePhraseIds }),
      ...(more.excludeRowIds?.length && { exclude_row_ids: more.excludeRowIds }),
      limit,
    });
    return { sessionId: String(res.data.data.session_id), cards: res.data.data.cards ?? [] };
  },

  /** POST /study/review: simpan penilaian kartu dan jadwalkan ulang. */
  async review(input: { sessionId: string; phraseId: string; rating: Rating }) {
    const res = await api.post('/study/review', {
      session_id: input.sessionId,
      phrase_id: input.phraseId,
      rating: input.rating,
    });
    return res.data.data as {
      xp_earned: number;
      user_level: number;
      user_xp?: number;
      xp_required?: number;
      xp_progress_percentage?: number;
      next_review_at: string;
    };
  },
};
