import type { AuthUser } from '@/api/auth';
import { loadJson, saveJson } from '@/lib/storage';

/** Perubahan profil yang dibuat user di perangkat ini, per akun. */
/** `picture: null` = avatar sengaja dihapus (token lama masih memuat URL-nya). */
export type ProfileOverride = Pick<AuthUser, 'name' | 'username' | 'level'> & { picture?: string | null };

const key = (userId: AuthUser['id']) => `flashku.profile.${userId ?? 'local'}`;

export const loadProfileOverride = (userId: AuthUser['id']) => loadJson<ProfileOverride>(key(userId));

export const saveProfileOverride = (userId: AuthUser['id'], value: ProfileOverride) =>
  saveJson(key(userId), value);
