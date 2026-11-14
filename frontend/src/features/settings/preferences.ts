import { useSyncExternalStore } from 'react';

import { loadJson, saveJson } from '@/lib/storage';

export type Preferences = { showRomaji: boolean };

const KEY = 'flashku.preferences.v1';
const DEFAULTS: Preferences = { showRomaji: false };

let state = DEFAULTS;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

// Dimuat sekali saat modul pertama dipakai; sebelum selesai, nilai bawaan dipakai.
void loadJson<Partial<Preferences>>(KEY).then((saved) => {
  if (!saved) return;
  state = { ...DEFAULTS, ...saved };
  emit();
});

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]) {
  state = { ...state, [key]: value };
  emit();
  void saveJson(KEY, state);
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => DEFAULTS,
  );
}
