import { api } from './client';

/**
 * Kontrak endpoint auth. Bentuk body/response di bawah adalah ASUMSI
 * dan harus dikonfirmasi dengan backend — cukup ubah di file ini.
 */

export type AuthUser = {
  id?: string | number;
  username?: string;
  email?: string;
  name?: string;
  picture?: string;
};

export type AuthResult = { token: string | null; user?: AuthUser };

// Backend bisa membungkus token dengan nama berbeda; toleran terhadap beberapa bentuk umum.
function parseAuthResult(data: any): AuthResult {
  const root = data?.data ?? data ?? {};
  const token: string | null = root.token ?? root.access_token ?? root.accessToken ?? root.jwt ?? null;
  return { token, user: root.user };
}

export type RegisterInput = { username: string; email: string; password: string };
export type VerifyInput = { email: string; otp: string };

// Metadata akun Google yang dikirim utuh ke backend.
export type GoogleAuthPayload = {
  idToken: string | null;
  serverAuthCode: string | null;
  scopes: string[];
  user: {
    id: string;
    email: string;
    name: string | null;
    givenName: string | null;
    familyName: string | null;
    photo: string | null;
  };
};

export const authApi = {
  /** Daftar. Berhasil = akun dibuat (belum terverifikasi). */
  async register(input: RegisterInput) {
    await api.post('/auth/register', input);
  },

  /** Kirim kode OTP ke email. */
  async sendOtp(email: string) {
    await api.post('/auth/send-otp', { email });
  },

  /** Verifikasi OTP. Jika backend mengembalikan JWT, user langsung masuk. */
  async verify(input: VerifyInput): Promise<AuthResult> {
    const res = await api.post('/auth/verify', input);
    return parseAuthResult(res.data);
  },

  /** `identifier` = username atau email. */
  async login(identifier: string, password: string): Promise<AuthResult> {
    const res = await api.post('/auth/login', { identifier, password });
    return parseAuthResult(res.data);
  },

  async google(payload: GoogleAuthPayload): Promise<AuthResult> {
    const res = await api.post('/auth/google', payload);
    return parseAuthResult(res.data);
  },
};
