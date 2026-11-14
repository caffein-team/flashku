export type TimeOfDay = { hour: number; minute: number };

export type Repeat = 'daily' | 'weekdays' | 'weekends';

export type NotificationSettings = {
  /** Saklar utama; jika mati semua pengingat dibatalkan. */
  enabled: boolean;
  studyReminder: boolean;
  streakGoal: boolean;
  weeklySummary: boolean;
  studyTime: TimeOfDay;
  repeat: Repeat;
  /** Mode tenang: tidak ada notifikasi di antara `quietFrom` dan `quietTo`. */
  quietMode: boolean;
  quietFrom: TimeOfDay;
  quietTo: TimeOfDay;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  studyReminder: true,
  streakGoal: true,
  weeklySummary: false,
  studyTime: { hour: 19, minute: 0 },
  repeat: 'daily',
  quietMode: true,
  quietFrom: { hour: 22, minute: 0 },
  quietTo: { hour: 7, minute: 0 },
};

export const REPEAT_LABELS: Record<Repeat, string> = {
  daily: 'Setiap hari',
  weekdays: 'Hari kerja',
  weekends: 'Akhir pekan',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Format Indonesia: 19.00 */
export function formatTime(t: TimeOfDay): string {
  return `${pad(t.hour)}.${pad(t.minute)}`;
}

const toMinutes = (t: TimeOfDay) => t.hour * 60 + t.minute;

/** Apakah `t` jatuh di dalam jendela mode tenang (boleh melewati tengah malam). */
export function isQuietTime(t: TimeOfDay, s: NotificationSettings): boolean {
  if (!s.quietMode) return false;
  const now = toMinutes(t);
  const from = toMinutes(s.quietFrom);
  const to = toMinutes(s.quietTo);
  if (from === to) return false;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

/** Jika waktu jatuh di mode tenang, geser ke akhir jendela supaya pengingat tidak hilang. */
export function respectQuiet(t: TimeOfDay, s: NotificationSettings): TimeOfDay {
  return isQuietTime(t, s) ? s.quietTo : t;
}
