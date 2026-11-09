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
};

// TODO: ganti dengan data dari backend; sementara dummy sesuai desain.
const now = Date.now();
const INITIAL: Song[] = [
  { id: 'dummy-1', title: 'ヨルシカ - 千鳥', artist: 'Yorushika', duration: '4:10', learned: 12, total: 30, addedAt: now - 1000 },
  { id: 'dummy-2', title: 'ヨルシカ - ただ君に晴れ', artist: 'Yorushika', duration: '4:10', learned: 30, total: 30, addedAt: now - 2000 },
  { id: 'dummy-3', title: 'Official髭男dism - Pretender', artist: 'Official髭男dism', duration: '4:10', learned: 0, total: 28, addedAt: now - 3000 },
  { id: 'dummy-4', title: 'YOASOBI - 夜に駆ける', artist: 'YOASOBI', duration: '4:10', learned: 5, total: 26, addedAt: now - 4000 },
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

  const value = useMemo(() => ({ songs, addSong }), [songs, addSong]);
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
