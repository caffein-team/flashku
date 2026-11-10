import axios, { AxiosError } from 'axios';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://flashku.dewayani.web.id/api';

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

type ErrorBody = {
  status?: string;
  message?: string | string[];
  error?: string;
  code?: string;
  email?: string;
  /** Error validasi per field, mis. { email: "Email is invalid" }. */
  errors?: Record<string, string>;
};

export function getErrorBody(error: unknown): ErrorBody {
  if (axios.isAxiosError(error)) return (error.response?.data as ErrorBody) ?? {};
  return {};
}

export function getErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      const base = 'Tidak dapat terhubung ke server. Periksa koneksi internetmu.';
      // Saat development, tampilkan URL dan kode error supaya penyebabnya mudah dilacak.
      return __DEV__ ? `${base}\n\n[${error.code ?? 'NO_RESPONSE'}] ${API_URL}` : base;
    }
    const body = getErrorBody(error);
    if (body.errors && Object.keys(body.errors).length) return Object.values(body.errors).join('\n');
    const msg = Array.isArray(body.message) ? body.message.join('\n') : body.message ?? body.error;
    if (msg) return msg;
    if (error.response.status >= 500) return 'Terjadi kesalahan pada server. Coba lagi nanti.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Terjadi kesalahan. Coba lagi.';
}
