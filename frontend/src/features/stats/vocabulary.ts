import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { songsApi, type Phrase, type SongDetail } from '@/api/songs';
import { songKey, songsKey } from '@/features/songs/queries';

const PAGE = 100;
const DETAIL_STALE_MS = 5 * 60_000;

const PARTICLES = new Set([
  'は', 'が', 'を', 'に', 'で', 'の', 'も', 'へ', 'と', 'から', 'まで', 'より',
  'ね', 'よ', 'か', 'わ', 'ぞ', 'ぜ', 'な', 'さ', 'や', 'ば', 'て', 'けど', 'のに',
]);
const SYMBOL_POS = ['symbol', 'punctuation', '記号', '補助記号', 'unknown'];

/**
 * Meniru penyaringan kartu di backend (`isMeaningfulPhrase` dan `isParticle`): hanya frasa berhuruf Jepang,
 * bukan simbol, bukan partikel. Bila aturan di server berubah, angka ini bisa menyimpang.
 */
export function isVocabulary(p: Phrase): boolean {
  const surface = (p.surfaceForm || p.dictionaryForm || '').trim();
  const pos = (p.partOfSpeech ?? '').trim().toLowerCase();
  if (!surface || SYMBOL_POS.includes(pos)) return false;
  if (!/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(surface.replace(/[\sー]/gu, ''))) return false;
  if (pos === 'particle' || pos.includes('助詞')) return false;
  return !(PARTICLES.has(surface) && (!pos || pos === 'other'));
}

/** Jumlah kosakata unik (berdasarkan bentuk kamus) di semua lagu perpustakaan. */
export function countVocabulary(songs: SongDetail[]): number {
  const seen = new Set<string>();
  for (const song of songs) {
    for (const row of song.lyricRows) {
      for (const p of row.phrases) {
        if (isVocabulary(p)) seen.add((p.dictionaryForm || p.surfaceForm).trim());
      }
    }
  }
  return seen.size;
}

/** Semua id lagu di perpustakaan (daftar server dibatasi 100 per halaman). */
function useAllSongIds() {
  return useQuery({
    queryKey: [...songsKey, 'ids'],
    queryFn: async () => {
      const ids: string[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { items, total } = await songsApi.list(PAGE, offset);
        ids.push(...items.map((s) => s.id));
        if (items.length === 0 || ids.length >= total) return ids;
      }
    },
    staleTime: DETAIL_STALE_MS,
  });
}

/**
 * Total kosakata unik, dihitung di perangkat dari detail tiap lagu (satu permintaan per lagu, lalu di-cache).
 * `count` kosong selama masih memuat.
 */
export function useVocabularyCount(): { count: number | undefined; loading: boolean } {
  const ids = useAllSongIds();
  const combine = useCallback(
    (results: { data?: SongDetail; isPending: boolean }[]) => ({
      pending: results.some((r) => r.isPending),
      // Lagu yang gagal dimuat dilewati; sisanya tetap dihitung.
      count: countVocabulary(results.flatMap((r) => (r.data ? [r.data] : []))),
    }),
    [],
  );
  const details = useQueries({
    queries: (ids.data ?? []).map((id) => ({
      queryKey: songKey(id),
      queryFn: () => songsApi.detail(id),
      staleTime: DETAIL_STALE_MS,
    })),
    combine,
  });

  const loading = ids.isPending || details.pending;
  return { count: loading || ids.isError ? undefined : details.count, loading };
}
