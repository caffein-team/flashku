import type { NotificationSettings } from '@/features/settings/notifications/types';
import { USE_MOCK_API } from '@/lib/config';
import { api } from './client';

/** TEMPLATE: endpoint ini belum ada di backend; dengan `USE_MOCK_API = true` fungsi memakai tiruan lokal. */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const notificationSettingsApi = {
  /** Ambil pengaturan dari server; null = belum pernah disimpan di server. */
  async get(): Promise<NotificationSettings | null> {
    if (USE_MOCK_API) {
      await delay(150);
      return null;
    }
    const res = await api.get('/me/settings/notifications');
    return (res.data?.data ?? null) as NotificationSettings | null;
  },

  async save(settings: NotificationSettings): Promise<void> {
    if (USE_MOCK_API) {
      await delay(350);
      return;
    }
    await api.put('/me/settings/notifications', settings);
  },
};
