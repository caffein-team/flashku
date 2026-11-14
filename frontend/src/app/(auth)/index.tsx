import { Redirect } from 'expo-router';

/** Tanpa route awal di grup ini, web menampilkan "Unmatched Route" di /(auth) saat belum login. */
export default function AuthIndex() {
  return <Redirect href="/login" />;
}
