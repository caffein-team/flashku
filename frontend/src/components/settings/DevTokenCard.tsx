import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { tokenStorage } from '@/auth/tokenStorage';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

/** SEMENTARA, hanya build development: tampilkan JWT untuk request manual. Hapus sebelum rilis. */
export function DevTokenCard() {
  const { colors } = useTheme();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void tokenStorage.get().then(setToken);
  }, []);

  if (!__DEV__) return null;

  const copy = async () => {
    if (!token) return;
    try {
      await Clipboard.setStringAsync(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.textMuted }]}>JWT (SEMENTARA, DEV)</Text>
        <Pressable onPress={copy} disabled={!token} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.copy, { color: token ? colors.link : colors.textMuted }]}>
            {copied ? 'Tersalin ✓' : 'Salin'}
          </Text>
        </Pressable>
      </View>
      <Text selectable style={[styles.token, { color: colors.text, backgroundColor: colors.surfaceMuted }]}>
        {token === undefined
          ? 'Memuat…'
          : (token ?? 'Tidak ada token (mungkin masuk lewat tombol "Lewati login"). Masuk dengan akun sungguhan.')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6 },
  copy: { fontFamily: font.bold, fontSize: 13 },
  token: { fontFamily: font.regular, fontSize: 11, padding: 10, borderRadius: 10, overflow: 'hidden' },
});
