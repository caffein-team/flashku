import axios, { AxiosError } from 'axios';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:3000';

// Token disimpan di memori supaya interceptor tidak perlu async.
// AuthProvider yang mengisi dan membersihkannya.
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`);
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    // 401 pada request yang membawa token = JWT kedaluwarsa/tidak valid.
    // Hanya satu token, jadi tidak ada refresh: langsung keluar.
    if (error.response?.status === 401 && accessToken) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

type ErrorBody = { message?: string | string[]; error?: string; code?: string; email?: string };

export function getErrorBody(error: unknown): ErrorBody {
  if (axios.isAxiosError(error)) return (error.response?.data as ErrorBody) ?? {};
  return {};
}

export function getErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Tidak dapat terhubung ke server. Periksa koneksi internetmu.';
    const body = getErrorBody(error);
    const msg = Array.isArray(body.message) ? body.message.join('\n') : body.message ?? body.error;
    if (msg) return msg;
    if (error.response.status >= 500) return 'Terjadi kesalahan pada server. Coba lagi nanti.';
  }
  return 'Terjadi kesalahan. Coba lagi.';
}
