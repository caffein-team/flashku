import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = TextInputProps & {
  label: string;
  error?: string;
  password?: boolean;
};

export const TextField = forwardRef<ComponentRef<typeof TextInput>, Props>(function TextField(
  { label, error, password, style, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : focused ? colors.primary : colors.inputBorder,
          },
        ]}
      >
        <TextInput
          ref={ref}
          placeholderTextColor={colors.placeholder}
          secureTextEntry={password && hidden}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[styles.input, { color: colors.text }, style]}
          {...rest}
        />
        {password && (
          <Pressable
            accessibilityLabel={hidden ? 'Tampilkan kata sandi' : 'Sembunyikan kata sandi'}
            hitSlop={10}
            onPress={() => setHidden((h) => !h)}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={22} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
      {!!error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontFamily: font.bold, fontSize: 14 },
  field: {
    height: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: { flex: 1, fontFamily: font.regular, fontSize: 16, height: '100%' },
  error: { fontFamily: font.medium, fontSize: 13 },
});
