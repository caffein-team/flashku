import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  value: string;
  onChange: (value: string) => void;
  length: number;
  error?: boolean;
  autoFocus?: boolean;
};

/** Satu TextInput tersembunyi + kotak tampilan, sehingga paste dan autofill SMS/email tetap jalan. */
export function OtpInput({ value, onChange, length, error, autoFocus }: Props) {
  const { colors } = useTheme();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} style={styles.row}>
      {Array.from({ length }, (_, i) => {
        const char = value[i];
        const active = i === Math.min(value.length, length - 1);
        return (
          <View
            key={i}
            style={[
              styles.box,
              {
                backgroundColor: colors.surface,
                borderColor: error ? colors.danger : active ? colors.primary : colors.inputBorder,
              },
            ]}
          >
            <Text style={[styles.char, { color: colors.text }]}>{char ?? ''}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        accessibilityLabel="Kode OTP"
        style={styles.hidden}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  char: { fontFamily: font.bold, fontSize: 24 },
  hidden: { position: 'absolute', opacity: 0, width: '100%', height: '100%' },
});
