import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Song = {
  id: string; // YouTube video ID
  title: string;
  artist: string;
  /** Durasi "m:ss"; undefined jika belum diketahui. */
  duration?: string;
  learned: number;
  /** 0 = kosakata belum selesai disiapkan AI. */
  total: number;
  addedAt: number;
};

type SongsContextValue = {
  songs: Song[];
  /** false jika lagu dengan ID yang sama sudah ada. */
  addSong: (song: Omit<Song, 'learned' | 'total' | 'addedAt'>) => boolean;
  /** Dipanggil saat user menilai kartu "Mudah": menambah jumlah kosakata yang sudah dikuasai. */
  markLearned: (id: string) => void;
};

// TODO: ganti dengan data dari backend. ID = ID video YouTube resmi; durasi dari YouTube. Progres belajar masih dummy.
const now = Date.now();
const INITIAL: Song[] = [
  { id: 't75qlQPXJGw', title: 'ヨルシカ - 千鳥', artist: 'Yorushika', duration: '4:10', learned: 12, total: 30, addedAt: now - 1000 },
  { id: '-VKIqrvVOpo', title: 'ヨルシカ - ただ君に晴れ', artist: 'Yorushika', duration: '3:20', learned: 30, total: 30, addedAt: now - 2000 },
  { id: 'TQ8WlA2GXbk', title: 'Official髭男dism - Pretender', artist: 'Official髭男dism', duration: '5:36', learned: 0, total: 28, addedAt: now - 3000 },
  { id: 'x8VYWazR5mE', title: 'YOASOBI - 夜に駆ける', artist: 'YOASOBI', duration: '4:35', learned: 5, total: 26, addedAt: now - 4000 },
];

const SongsContext = createContext<SongsContextValue | null>(null);

export function SongsProvider({ children }: { children: ReactNode }) {
  const [songs, setSongs] = useState<Song[]>(INITIAL);

  const addSong = useCallback<SongsContextValue['addSong']>(
    (input) => {
      if (songs.some((s) => s.id === input.id)) return false;
      setSongs((prev) => [{ ...input, learned: 0, total: 0, addedAt: Date.now() }, ...prev]);
      return true;
    },
    [songs],
  );

  const markLearned = useCallback((id: string) => {
    setSongs((prev) =>
      prev.map((s) => (s.id === id && s.learned < s.total ? { ...s, learned: s.learned + 1 } : s)),
    );
  }, []);

  const value = useMemo(() => ({ songs, addSong, markLearned }), [songs, addSong, markLearned]);
  return <SongsContext.Provider value={value}>{children}</SongsContext.Provider>;
}

export function useSongs() {
  const ctx = useContext(SongsContext);
  if (!ctx) throw new Error('useSongs harus dipakai di dalam SongsProvider');
  return ctx;
}

export type SongStatus = 'new' | 'learning' | 'done';

export function songStatus(song: Song): SongStatus {
  if (song.learned === 0) return 'new';
  if (song.total > 0 && song.learned >= song.total) return 'done';
  return 'learning';
}

export function songProgress(song: Song): number {
  return song.total > 0 ? Math.min(song.learned / song.total, 1) : 0;
}
