import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { notificationSettingsApi } from '@/api/settings';
import { loadJson, saveJson } from '@/lib/storage';
import { NOTIFICATION_SETTINGS_KEY, syncNotifications } from './scheduler';
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from './types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const DEBOUNCE_MS = 500;

/** Autosave: simpan di perangkat, sinkron ke server (template), lalu jadwalkan ulang notifikasi lokal. */
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  /** true = jadwal lokal tidak didukung di platform ini (web). */
  const [unsupported, setUnsupported] = useState(false);

  const latest = useRef(settings);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const local = await loadJson<NotificationSettings>(NOTIFICATION_SETTINGS_KEY);
      let next = { ...DEFAULT_NOTIFICATION_SETTINGS, ...local };
      if (!local) {
        // Belum ada di perangkat: coba ambil dari server (tiruan: selalu kosong).
        try {
          const remote = await notificationSettingsApi.get();
          if (remote) next = { ...next, ...remote };
        } catch {}
      }
      if (!mounted.current) return;
      latest.current = next;
      setSettings(next);
      setLoaded(true);
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const persist = useCallback(async () => {
    pending.current = false;
    const snapshot = latest.current;
    await saveJson(NOTIFICATION_SETTINGS_KEY, snapshot);

    let synced = true;
    try {
      await notificationSettingsApi.save(snapshot);
    } catch {
      synced = false;
    }

    let result: Awaited<ReturnType<typeof syncNotifications>> = { status: 'unsupported' };
    try {
      result = await syncNotifications(snapshot);
    } catch {}

    if (!mounted.current) return;
    setUnsupported(result.status === 'unsupported');
    if (result.status === 'denied') {
      // Izin ditolak: matikan saklar utama supaya tampilan jujur.
      const off = { ...latest.current, enabled: false };
      latest.current = off;
      setSettings(off);
      await saveJson(NOTIFICATION_SETTINGS_KEY, off);
      Alert.alert(
        'Izin notifikasi ditolak',
        'Aktifkan izin notifikasi untuk FlashKu di pengaturan perangkat, lalu nyalakan lagi.',
      );
    }
    setSaveState(synced ? 'saved' : 'error');
  }, []);

  const update = useCallback(
    (patch: Partial<NotificationSettings>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setSettings(next);
      setSaveState('saving');
      pending.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void persist(), DEBOUNCE_MS);
    },
    [persist],
  );

  // Keluar halaman sebelum jeda selesai: simpan sekarang agar perubahan terakhir tidak hilang.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void persist();
    },
    [persist],
  );

  return { settings, loaded, update, saveState, unsupported };
}
