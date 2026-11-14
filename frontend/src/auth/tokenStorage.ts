import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'flashku.jwt';

/** SecureStore tidak ada di web (modulnya kosong); web memakai localStorage, yang kurang aman tapi tak ada padanannya. */
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
