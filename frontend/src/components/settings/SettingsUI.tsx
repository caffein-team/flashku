import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

/** Props tambahan saklar: di web, thumb aktif defaultnya hijau-teal kecuali `activeThumbColor` diisi. */
export const webSwitchProps = (Platform.OS === 'web' ? { activeThumbColor: '#fff' } : {}) as object;

export function SectionTitle({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.section, { color: colors.text }]}>{children}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface }, style]}>{children}</View>;
}

type ToggleProps = {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Baris pertama dalam kartu tidak diberi garis pemisah. */
  first?: boolean;
  large?: boolean;
};

export function ToggleRow({ title, subtitle, value, onChange, disabled, first = true, large }: ToggleProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
      <View style={styles.flex}>
        <Text style={[large ? styles.titleLg : styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ false: colors.track, true: colors.primary }}
        thumbColor="#fff"
        {...webSwitchProps}
      />
    </View>
  );
}

export function NavRow({
  label,
  value,
  onPress,
  first,
  disabled,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  first?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.row,
        styles.navRow,
        !first && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <Text style={[styles.title, styles.flex, { color: colors.text }]}>{label}</Text>
      {!!value && <Text style={[styles.value, { color: colors.textMuted }]}>{value}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { fontFamily: font.bold, fontSize: 16, marginTop: 6, marginLeft: 4 },
  card: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  navRow: { height: 52, paddingVertical: 0 },
  titleLg: { fontFamily: font.bold, fontSize: 16 },
  title: { fontFamily: font.semibold, fontSize: 15 },
  subtitle: { fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },
  value: { fontFamily: font.regular, fontSize: 14 },
});
