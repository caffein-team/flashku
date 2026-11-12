import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

/** Bingkai video 16:9-ish dengan badge YouTube; isi pemutar ada di `children`. */
export function ClipFrame({
  children,
  failed,
  message,
}: {
  children?: ReactNode;
  failed?: boolean;
  /** Teks di bawah ikon; default hanya muncul saat `failed`. */
  message?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.frame, { backgroundColor: colors.banner }]}>
      <View style={styles.center}>
        <Ionicons name={failed ? 'alert-circle-outline' : 'musical-notes-outline'} size={56} color={colors.primary} />
        {(failed || !!message) && (
          <Text style={[styles.failed, { color: colors.bannerText }]}>{message ?? 'Video tidak dapat diputar'}</Text>
        )}
      </View>
      {children}
      <View style={styles.badge} pointerEvents="none">
        <View style={styles.dot} />
        <Text style={styles.badgeText}>YouTube</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { aspectRatio: 16 / 9, borderRadius: 26, overflow: 'hidden' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 8 },
  failed: { fontFamily: font.medium, fontSize: 13 },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E53935' },
  badgeText: { fontFamily: font.bold, fontSize: 12, color: '#222' },
});
