import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'flashku.jwt';

export const tokenStorage = {
  async get(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear() {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {}
  },
};
