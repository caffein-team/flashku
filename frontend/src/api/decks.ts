import { api } from './client';
import { toSong, type Song } from './songs';

export type Deck = {
  id: string;
  name: string;
  description?: string | null;
  totalSongs: number;
  updatedAt?: string;
};

function toDeck(raw: any): Deck {
  return {
    id: String(raw.id ?? raw._id),
    name: raw.name,
    description: raw.description,
    totalSongs: raw.total_songs ?? 0,
    updatedAt: raw.updated_at,
  };
}

export const decksApi = {
  async list(limit = 100, offset = 0): Promise<{ items: Deck[]; total: number }> {
    const res = await api.get('/decks', { params: { limit, offset } });
    const data = res.data?.data;
    return { items: (data?.items ?? []).map(toDeck), total: data?.total ?? 0 };
  },

  async create(name: string): Promise<Deck> {
    const res = await api.post('/decks', { name });
    return toDeck(res.data.data);
  },

  /** GET /decks/:id: deck beserta lagu di dalamnya. */
  async detail(id: string): Promise<{ deck: Deck; songs: Song[] }> {
    const res = await api.get(`/decks/${id}`);
    const raw = res.data.data;
    return { deck: toDeck(raw), songs: (raw.songs ?? []).map(toSong) };
  },

  /** PUT /decks/:id: ganti nama deck. */
  async rename(id: string, name: string): Promise<Deck> {
    const res = await api.put(`/decks/${id}`, { name });
    return toDeck(res.data.data);
  },

  /** DELETE /decks/:id: hapus deck; lagunya tetap ada di perpustakaan. */
  async remove(id: string): Promise<void> {
    await api.delete(`/decks/${id}`);
  },

  /** DELETE /decks/:id/songs/:song_id: keluarkan satu lagu dari deck; lagunya tetap ada di perpustakaan. */
  async removeSong(deckId: string, songId: string): Promise<void> {
    await api.delete(`/decks/${deckId}/songs/${songId}`);
  },

  async addSong(deckId: string, songId: string): Promise<Deck> {
    const res = await api.post(`/decks/${deckId}/songs`, { song_id: songId });
    return toDeck(res.data.data);
  },
};
