import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'outline';
  loading?: boolean;
  disabled?: boolean;
  left?: ReactNode;
  style?: ViewStyle;
};

export function Button({ title, onPress, variant = 'primary', loading, disabled, left, style }: Props) {
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  const inactive = disabled || loading;
  const fg = isPrimary ? colors.primaryText : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        isPrimary
          ? { backgroundColor: colors.primary }
          : { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.inputBorder },
        inactive && { opacity: 0.6 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {left}
          <Text style={[styles.label, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: font.bold, fontSize: 16 },
});
