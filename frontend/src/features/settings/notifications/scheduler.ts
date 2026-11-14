import { Platform } from 'react-native';

import { loadJson } from '@/lib/storage';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  isQuietTime,
  respectQuiet,
  type NotificationSettings,
} from './types';

export const NOTIFICATION_SETTINGS_KEY = 'flashku.settings.notifications.v1';

type Notifications = typeof import('expo-notifications');

/** expo-notifications hanya dimuat di perangkat (di web tidak ada penjadwalan lokal). */
async function load(): Promise<Notifications | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

export type SyncResult = { status: 'ok' | 'unsupported' | 'denied' };

const CHANNEL = 'reminders';
// Expo: weekday 1 = Minggu ... 7 = Sabtu.
const WEEKDAYS = [2, 3, 4, 5, 6];
const WEEKENDS = [7, 1];
const STREAK_TIME = { hour: 20, minute: 30 };
const SUMMARY_TIME = { hour: 18, minute: 0 };
const SUMMARY_WEEKDAY = 1;

/** Batalkan semua jadwal lalu jadwalkan ulang yang aktif; izin diminta bila ada yang perlu dijadwalkan. */
export async function syncNotifications(s: NotificationSettings): Promise<SyncResult> {
  const N = await load();
  if (!N) return { status: 'unsupported' };

  await N.cancelAllScheduledNotificationsAsync();
  if (!s.enabled || !(s.studyReminder || s.streakGoal || s.weeklySummary)) return { status: 'ok' };

  let perm = await N.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await N.requestPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync(CHANNEL, {
      name: 'Pengingat belajar',
      importance: N.AndroidImportance.HIGH,
    });
  }

  const T = N.SchedulableTriggerInputTypes;
  const channelId = CHANNEL;

  if (s.studyReminder) {
    const t = respectQuiet(s.studyTime, s);
    const content = { title: 'Waktunya belajar', body: 'Luangkan beberapa menit untuk kartu hari ini.' };
    if (s.repeat === 'daily') {
      await N.scheduleNotificationAsync({
        content,
        trigger: { type: T.DAILY, hour: t.hour, minute: t.minute, channelId },
      });
    } else {
      for (const weekday of s.repeat === 'weekdays' ? WEEKDAYS : WEEKENDS) {
        await N.scheduleNotificationAsync({
          content,
          trigger: { type: T.WEEKLY, weekday, hour: t.hour, minute: t.minute, channelId },
        });
      }
    }
  }

  if (s.streakGoal) {
    const t = respectQuiet(STREAK_TIME, s);
    await N.scheduleNotificationAsync({
      content: { title: 'Jaga streak-mu', body: 'Selesaikan target belajar hari ini sebelum hari berganti.' },
      trigger: { type: T.DAILY, hour: t.hour, minute: t.minute, channelId },
    });
  }

  if (s.weeklySummary) {
    const t = respectQuiet(SUMMARY_TIME, s);
    await N.scheduleNotificationAsync({
      content: { title: 'Ringkasan mingguan', body: 'Lihat perkembangan belajarmu minggu ini.' },
      trigger: { type: T.WEEKLY, weekday: SUMMARY_WEEKDAY, hour: t.hour, minute: t.minute, channelId },
    });
  }

  return { status: 'ok' };
}

export async function cancelAllNotifications(): Promise<void> {
  const N = await load();
  await N?.cancelAllScheduledNotificationsAsync();
}

/** Banner tampil saat app terbuka, kecuali sedang mode tenang. */
export async function initNotificationHandler(): Promise<void> {
  const N = await load();
  if (!N) return;
  N.setNotificationHandler({
    handleNotification: async () => {
      const saved = await loadJson<NotificationSettings>(NOTIFICATION_SETTINGS_KEY);
      const s = saved ?? DEFAULT_NOTIFICATION_SETTINGS;
      const now = new Date();
      const quiet = isQuietTime({ hour: now.getHours(), minute: now.getMinutes() }, s);
      return { shouldShowBanner: !quiet, shouldShowList: !quiet, shouldPlaySound: false, shouldSetBadge: false };
    },
  });
}
