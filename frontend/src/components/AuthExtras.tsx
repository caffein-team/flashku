import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthProvider';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';

export function OrDivider() {
  const { colors } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
      <Text style={[styles.or, { color: colors.textMuted }]}>atau</Text>
      <View style={[styles.line, { backgroundColor: colors.border }]} />
    </View>
  );
}

export function GoogleButton({
  title,
  onPress,
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Button
      variant="outline"
      title={title}
      onPress={onPress}
      loading={loading}
      disabled={disabled}
      left={
        <View style={[styles.g, { backgroundColor: colors.surfaceMuted }]}>
          <Text style={[styles.gText, { color: colors.text }]}>G</Text>
        </View>
      }
    />
  );
}

/** SEMENTARA: lewati login untuk mengerjakan halaman utama. Hapus sebelum rilis. */
export function TempSkipButton() {
  const { colors } = useTheme();
  const { devSignIn } = useAuth();
  return (
    <Pressable onPress={devSignIn} hitSlop={8} style={styles.skip} accessibilityRole="button">
      <Text style={[styles.skipText, { color: colors.textMuted }]}>Lewati ke halaman utama (sementara)</Text>
    </Pressable>
  );
}

export function FooterLink({ text, linkText, href }: { text: string; linkText: string; href: Href }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.footerText, { color: colors.textMuted }]}>
      {text}{' '}
      <Link href={href} replace style={{ color: colors.link, fontFamily: font.bold }}>
        {linkText}
      </Link>
    </Text>
  );
}

const styles = StyleSheet.create({
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  line: { flex: 1, height: 1 },
  or: { fontFamily: font.regular, fontSize: 12 },
  g: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  gText: { fontFamily: font.bold, fontSize: 12 },
  skip: { alignSelf: 'center', paddingVertical: 4 },
  skipText: { fontFamily: font.medium, fontSize: 13, textDecorationLine: 'underline' },
  footerText: { fontFamily: font.regular, fontSize: 14 },
});
