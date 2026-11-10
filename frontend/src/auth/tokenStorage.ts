import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'flashku.jwt';

/**
 * Android: SecureStore (terenkripsi). Web: SecureStore tidak tersedia (modulnya kosong),
 * jadi memakai localStorage. Itu tidak seaman SecureStore, tapi browser tidak punya padanan yang aman.
 */
const isWeb = Platform.OS === 'web';

function webStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const tokenStorage = {
  async get(): Promise<string | null> {
    try {
      if (isWeb) return webStorage()?.getItem(TOKEN_KEY) ?? null;
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string) {
    if (isWeb) {
      webStorage()?.setItem(TOKEN_KEY, token);
      return;
    }
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear() {
    try {
      if (isWeb) webStorage()?.removeItem(TOKEN_KEY);
      else await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
  },
};
