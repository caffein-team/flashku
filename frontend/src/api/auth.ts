import { api } from "./client";

export type AuthUser = {
  id?: string | number;
  username?: string;
  email?: string;
  name?: string;
  picture?: string;
  /** ISO date akun dibuat (dari `created_at` backend). */
  createdAt?: string;
  level?: number;
};

export type AuthResult = { token: string | null; user?: AuthUser };

export function normalizeUser(raw: any): AuthUser | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return {
    id: raw._id ?? raw.id,
    email: raw.email,
    name: raw.name,
    username: raw.username ?? raw.name,
    picture: raw.avatar ?? raw.picture,
    createdAt: raw.created_at ?? raw.createdAt,
    level: raw.level,
  };
}

function parseAuthResult(body: any): AuthResult {
  return { token: body?.token ?? null, user: normalizeUser(body?.data) };
}

/** Backend memakai field `name` untuk username. */
export type RegisterInput = { name: string; email: string; password: string };
export type VerifyInput = { email: string; otp: string };

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
  async register(input: RegisterInput): Promise<AuthResult> {
    const res = await api.post("/auth/register", input);
    return parseAuthResult(res.data);
  },

  async sendOtp(email: string) {
    await api.post("/auth/verify/send-otp", { email });
  },

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
