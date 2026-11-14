import { loadJson, saveJson } from '@/lib/storage';

const KEY = 'flashku.lastStudiedSong';

export const getLastStudiedSong = () => loadJson<string>(KEY);

export const setLastStudiedSong = (songId: string) => saveJson(KEY, songId);
