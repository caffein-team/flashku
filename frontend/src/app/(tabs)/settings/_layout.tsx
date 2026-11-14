import { Stack } from 'expo-router';

/** Pengaturan + sub-halaman (Profil, Notifikasi) dalam satu tab, sehingga tab bar tetap terlihat. */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
