import { router, type Href } from 'expo-router';

/** `router.back()` tanpa riwayat (URL dibuka langsung atau setelah reload) memicu GO_BACK tak tertangani; pakai rute cadangan. */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
