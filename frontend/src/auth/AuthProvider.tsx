import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { AuthResult, AuthUser } from '@/api/auth';
import { setAccessToken, setUnauthorizedHandler } from '@/api/client';
import { cancelAllNotifications } from '@/features/settings/notifications/scheduler';
import { loadProfileOverride, saveProfileOverride } from '@/features/settings/profile/profileStore';
import { isExpired, userFromToken } from './jwt';
import { tokenStorage } from './tokenStorage';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: Status;
  user: AuthUser | null;
  signIn: (result: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<Pick<AuthUser, 'name' | 'username' | 'picture' | 'level'>>) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const clearSession = useCallback(async () => {
    setAccessToken(null);
    await tokenStorage.clear();
    queryClient.clear();
    setUser(null);
    setStatus('unauthenticated');
  }, [queryClient]);

  const signOut = useCallback(async () => {
    try {
      // Native module hanya ada di dev build; abaikan jika tidak tersedia.
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {}
    try {
      await cancelAllNotifications(); // pengingat tidak boleh terus berbunyi setelah keluar
    } catch {}
    await clearSession();
  }, [clearSession]);

  /** Terapkan nama yang diubah di perangkat ini; token masih membawa nama lama. */
  const applyOverride = useCallback(async (id: AuthUser['id']) => {
    const override = await loadProfileOverride(id);
    if (!override) return;
    setUser((u) => {
      if (!u) return u;
      const { picture, level, ...rest } = override;
      return {
        ...u,
        ...rest,
        // Level hanya naik: jangan timpa level yang lebih baru dari server.
        level: Math.max(u.level ?? 0, level ?? 0) || undefined,
        ...(picture !== undefined && { picture: picture ?? undefined }),
      };
    });
  }, []);

  const updateUser = useCallback(
    (patch: Partial<Pick<AuthUser, 'name' | 'username' | 'picture' | 'level'>>) => {
      const next = { ...user, ...patch };
      setUser((u) => (u ? { ...u, ...patch } : u));
      void saveProfileOverride(user?.id, {
        name: next.name,
        username: next.username,
        picture: next.picture ?? null,
        level: next.level,
      });
    },
    [user],
  );

  const signIn = useCallback(async ({ token, user: apiUser }: AuthResult) => {
    if (!token) throw new Error('Respons server tidak berisi token.');
    await tokenStorage.set(token);
    setAccessToken(token);
    const merged = { ...userFromToken(token), ...apiUser };
    setUser(merged);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const token = await tokenStorage.get();
      if (!active) return;
      if (!token || isExpired(token)) {
        if (token) await tokenStorage.clear();
        setStatus('unauthenticated');
        return;
      }
      setAccessToken(token);
      const restored = userFromToken(token);
      setUser(restored);
      setStatus('authenticated');
      void applyOverride(restored.id);
    })();
    return () => {
      active = false;
    };
  }, [applyOverride]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, signIn, signOut, updateUser }),
    [status, user, signIn, signOut, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
