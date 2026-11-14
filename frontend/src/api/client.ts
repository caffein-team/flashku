import axios, { AxiosError } from 'axios';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://flashku.dewayani.web.id/api';

/** Origin server tanpa `/api`; file statis (thumbnail, audio, avatar) disajikan dari `/uploads/...`. */
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export function assetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return /^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Token di memori supaya interceptor tidak perlu async; AuthProvider yang mengisinya.
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
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
    // 401 pada request bertoken = JWT habis; tanpa refresh token, langsung keluar.
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
