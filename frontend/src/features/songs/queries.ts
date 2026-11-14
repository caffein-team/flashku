import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';

import { decksApi } from '@/api/decks';
import { songsApi, type Song } from '@/api/songs';

const PAGE_SIZE = 20;

export const songsKey = ['songs'] as const;
export const songKey = (id: string) => ['song', id] as const;

type Page = { items: Song[]; total: number };

export function useSongsList() {
  return useInfiniteQuery({
    queryKey: songsKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => songsApi.list(PAGE_SIZE, pageParam),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
}

export function useSongDetail(id: string | undefined) {
  return useQuery({ queryKey: songKey(id ?? ''), queryFn: () => songsApi.detail(id!), enabled: !!id });
}

/** Favorit dibalik langsung di layar (optimistis), lalu dikoreksi bila server menolak. */
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => songsApi.toggleFavorite(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: songsKey });
      const prevList = qc.getQueryData<InfiniteData<Page>>(songsKey);
      const prevDetail = qc.getQueryData<Song>(songKey(id));
      qc.setQueryData<InfiniteData<Page>>(songsKey, (d) =>
        d && {
          ...d,
          pages: d.pages.map((p) => ({
            ...p,
            items: p.items.map((s) => (s.id === id ? { ...s, isFavorite: !s.isFavorite } : s)),
          })),
        },
      );
      qc.setQueryData<Song>(songKey(id), (s) => s && { ...s, isFavorite: !s.isFavorite });
      return { prevList, prevDetail };
    },
    onError: (_e, id, ctx) => {
      qc.setQueryData(songsKey, ctx?.prevList);
      qc.setQueryData(songKey(id), ctx?.prevDetail);
    },
    onSettled: (_d, _e, id) => {
      void qc.invalidateQueries({ queryKey: songsKey });
      void qc.invalidateQueries({ queryKey: songKey(id) });
    },
  });
}

/** Tampilkan lagu yang baru diimpor di urutan teratas daftar tanpa menunggu refetch. */
export function addSongToCache(qc: QueryClient, song: Song) {
  qc.setQueryData<InfiniteData<Page>>(songsKey, (d) => {
    if (!d || d.pages.some((p) => p.items.some((s) => s.id === song.id))) return d;
    const [first, ...rest] = d.pages;
    return { ...d, pages: [{ items: [song, ...first.items], total: first.total + 1 }, ...rest] };
  });
}

export const decksKey = ['decks'] as const;

export function useDecks() {
  return useQuery({ queryKey: decksKey, queryFn: () => decksApi.list() });
}

export const deckKey = (id: string) => ['deck', id] as const;

export function useDeckDetail(id: string | undefined) {
  return useQuery({ queryKey: deckKey(id ?? ''), queryFn: () => decksApi.detail(id!), enabled: !!id });
}

export function useRenameDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => decksApi.rename(id, name),
    onSuccess: (_d, { id }) => {
      void qc.invalidateQueries({ queryKey: decksKey });
      void qc.invalidateQueries({ queryKey: deckKey(id) });
    },
  });
}

export function useRemoveSongFromDeck(deckId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (songId: string) => decksApi.removeSong(deckId, songId),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: deckKey(deckId) });
      void qc.invalidateQueries({ queryKey: decksKey });
    },
  });
}

export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => decksApi.remove(id),
    onSettled: () => void qc.invalidateQueries({ queryKey: decksKey }),
  });
}

export function useCreateDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => decksApi.create(name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: decksKey }),
  });
}

export function useAddSongToDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, songId }: { deckId: string; songId: string }) => decksApi.addSong(deckId, songId),
    onSuccess: (_d, { deckId }) => {
      void qc.invalidateQueries({ queryKey: decksKey });
      void qc.invalidateQueries({ queryKey: deckKey(deckId) });
    },
  });
}

/** Jalankan ulang terjemahan dan arti kata dengan AI; kartu study memakai data hasilnya. */
export function useEnrichSong() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => songsApi.enrich(id),
    onSettled: (_data, _err, id) => {
      void qc.invalidateQueries({ queryKey: songKey(id) });
    },
  });
}

export function useDeleteSongs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => songsApi.remove(id))),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: songsKey });
      void qc.invalidateQueries({ queryKey: decksKey });
    },
  });
}
