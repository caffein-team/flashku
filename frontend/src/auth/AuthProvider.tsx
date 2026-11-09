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
import { isExpired, userFromToken } from './jwt';
import { tokenStorage } from './tokenStorage';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

type AuthContextValue = {
  status: Status;
  user: AuthUser | null;
  /** Simpan JWT dari hasil login/verify/google. */
  signIn: (result: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
  /** SEMENTARA: masuk tanpa backend untuk mengerjakan UI. Hapus sebelum rilis. */
  devSignIn: () => void;
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
    await clearSession();
  }, [clearSession]);

  const signIn = useCallback(async ({ token, user: apiUser }: AuthResult) => {
    if (!token) throw new Error('Respons server tidak berisi token.');
    await tokenStorage.set(token);
    setAccessToken(token);
    setUser({ ...userFromToken(token), ...apiUser });
    setStatus('authenticated');
  }, []);

  const devSignIn = useCallback(() => {
    setUser({ username: 'Dev User', email: 'dev@flashku.local' });
    setStatus('authenticated');
  }, []);

  // Restore sesi saat app dibuka.
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
      setUser(userFromToken(token));
      setStatus('authenticated');
    })();
    return () => {
      active = false;
    };
  }, []);

  // 401 dari API → sesi habis.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      void clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const value = useMemo(
    () => ({ status, user, signIn, signOut, devSignIn }),
    [status, user, signIn, signOut, devSignIn],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return ctx;
}
