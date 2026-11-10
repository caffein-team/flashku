import { api } from "./client";

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
function parseAuthResult(body: any): AuthResult {
  return { token: body?.token ?? null, user: body?.data ?? undefined };
}

/** Backend memakai field `name` untuk username. */
export type RegisterInput = { name: string; email: string; password: string };
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
  /** Daftar. Jika backend langsung mengembalikan token, user bisa masuk tanpa login ulang. */
  async register(input: RegisterInput): Promise<AuthResult> {
    const res = await api.post("/auth/register", input);
    return parseAuthResult(res.data);
  },

  /** Kirim kode OTP ke email. */
  async sendOtp(email: string) {
    await api.post("/auth/verify/send-otp", { email });
  },

  /** Verifikasi OTP. Jika backend mengembalikan JWT, user langsung masuk. */
  async verify(input: VerifyInput): Promise<AuthResult> {
    const res = await api.post("/auth/verify/confirm-otp", input);
    return parseAuthResult(res.data);
  },

  /** `identifier` = username atau email. */
  async login(identifier: string, password: string): Promise<AuthResult> {
    const res = await api.post("/auth/login", { identifier, password });
    return parseAuthResult(res.data);
  },

  async google(payload: GoogleAuthPayload): Promise<AuthResult> {
    const res = await api.post("/auth/google", payload);
    return parseAuthResult(res.data);
  },
};
