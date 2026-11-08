import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-native';

import { authApi, type GoogleAuthPayload } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { useAuth } from './AuthProvider';

type GoogleModule = typeof import('@react-native-google-signin/google-signin');

let googleModule: GoogleModule | null = null;

/**
 * Module native Google Sign-In di-load saat dipakai, bukan saat app start.
 * Di Expo Go modul ini tidak ada dan meng-import-nya di top-level akan membuat app crash.
 */
function loadGoogle(): GoogleModule | null {
  if (googleModule) return googleModule;
  try {
    const mod = require('@react-native-google-signin/google-signin') as GoogleModule;
    mod.GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      // Minta kode server agar backend bisa menukar sendiri bila perlu.
      offlineAccess: true,
    });
    googleModule = mod;
    return mod;
  } catch {
    return null;
  }
}

/** Login/daftar via Google. Seluruh metadata akun dikirim ke backend. */
export function useGoogleSignIn() {
  const { signIn } = useAuth();

  const mutation = useMutation({
    mutationFn: async () => {
      const google = loadGoogle();
      if (!google) {
        Alert.alert(
          'Google belum tersedia',
          'Login Google butuh development build. Di Expo Go gunakan login email.',
        );
        return null;
      }
      const { GoogleSignin, isSuccessResponse } = google;
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return null; // dibatalkan user

      const { idToken, serverAuthCode, scopes, user } = response.data;
      const payload: GoogleAuthPayload = {
        idToken,
        serverAuthCode,
        scopes,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          givenName: user.givenName,
          familyName: user.familyName,
          photo: user.photo,
        },
      };
      return authApi.google(payload);
    },
    onSuccess: async (result) => {
      if (result) await signIn(result);
    },
    onError: (error) => {
      const google = loadGoogle();
      if (google && google.isErrorWithCode(error)) {
        const { statusCodes } = google;
        if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
        if (error.code === statusCodes.IN_PROGRESS) return;
        if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          Alert.alert('Google Play Services', 'Google Play Services tidak tersedia di perangkat ini.');
          return;
        }
      }
      Alert.alert('Gagal masuk dengan Google', getErrorMessage(error));
    },
  });

  return { signInWithGoogle: () => mutation.mutate(), loading: mutation.isPending };
}
