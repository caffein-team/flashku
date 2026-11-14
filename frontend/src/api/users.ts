import { Platform } from 'react-native';

import { normalizeUser, type AuthUser } from './auth';
import { api } from './client';

export type AvatarFile = { uri: string; mimeType: string };

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export const AVATAR_MIME_TYPES = Object.keys(EXTENSION);
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/** Level dan perolehan XP menuju level berikutnya. */
export type Progress = { level: number; xp: number; xpRequired: number; percent: number };

export const usersApi = {
  /** GET /users/profile: level, `xp` di level ini, `xp_required` untuk naik, dan persentasenya. */
  async progress(): Promise<Progress> {
    const d = (await api.get('/users/profile')).data.data;
    return {
      level: d.level ?? 1,
      xp: d.xp ?? 0,
      xpRequired: d.xp_required ?? 0,
      percent: d.xp_progress_percentage ?? 0,
    };
  },

  /** PATCH /users/profile: ubah `username` (3–50 karakter: huruf, angka, `_`, `-`; harus unik). */
  async updateProfile(input: { username: string }): Promise<AuthUser | undefined> {
    const res = await api.patch('/users/profile', input);
    return normalizeUser(res.data.data);
  },

  /** POST /users/change-password. Backend menolak bila kata sandi lama salah atau sama dengan yang baru. */
  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await api.post('/users/change-password', {
      current_password: input.currentPassword,
      new_password: input.newPassword,
    });
  },

  /** POST /users/avatar: multipart, field `file`, maksimal 5 MB, jpg/png/webp/gif. Mengembalikan URL avatar baru. */
  async uploadAvatar(file: AvatarFile): Promise<string> {
    const form = new FormData();
    const name = `avatar.${EXTENSION[file.mimeType] ?? 'jpg'}`;
    if (Platform.OS === 'web') {
      form.append('file', await (await fetch(file.uri)).blob(), name);
    } else {
      form.append('file', { uri: file.uri, name, type: file.mimeType } as unknown as Blob);
    }
    // Di web browser mengisi boundary sendiri; di React Native header ini wajib.
    const headers = Platform.OS === 'web' ? undefined : { 'Content-Type': 'multipart/form-data' };
    const res = await api.post('/users/avatar', form, { headers, timeout: 60_000 });
    return res.data.data.avatar_url as string;
  },

  /** DELETE /users/avatar. */
  async deleteAvatar(): Promise<void> {
    await api.delete('/users/avatar');
  },
};
