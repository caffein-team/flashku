import type { AuthUser } from "@/api/auth";

type Claims = {
  data?: { _id?: string; name?: string; email?: string; avatar?: string };
  exp?: number;
  sub?: string | number;
  email?: string;
  username?: string;
  name?: string;
  picture?: string;
};

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  // decode UTF-8
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Baca payload JWT tanpa verifikasi (verifikasi tugas backend). */
export function decodeJwt(token: string): Claims | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    return JSON.parse(base64UrlDecode(part)) as Claims;
  } catch {
    return null;
  }
}

export function isExpired(token: string): boolean {
  const claims = decodeJwt(token);
  if (!claims?.exp) return false; // tanpa exp: biarkan backend yang menolak (401)
  return claims.exp * 1000 <= Date.now();
}

export function userFromToken(token: string): AuthUser {
  const c = decodeJwt(token);
  if (!c) return {};
  return {
    id: c.data?._id,
    email: c.data?.email,
    name: c.data?.name,
    username: c.data?.name,
    picture: c.data?.avatar,
  };
}
