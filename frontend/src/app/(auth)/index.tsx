import { Redirect } from 'expo-router';

/**
 * Belum login: URL "/" diarahkan ke grup (auth). Tanpa file ini grup tersebut tidak punya
 * route awal, sehingga web menampilkan "Unmatched Route" di /(auth).
 */
export default function AuthIndex() {
  return <Redirect href="/login" />;
}
