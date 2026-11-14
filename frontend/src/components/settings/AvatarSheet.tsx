import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { BottomSheet } from './Sheets';

type Props = {
  visible: boolean;
  hasAvatar: boolean;
  onClose: () => void;
  onChange: () => void;
  onRemove: () => void;
};

export function AvatarSheet({ visible, hasAvatar, onClose, onChange, onRemove }: Props) {
  const { colors } = useTheme();

  const confirmRemove = () => {
    onClose();
    Alert.alert('Hapus foto profil?', 'Avatarmu kembali ke inisial nama.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: onRemove },
    ]);
  };

  const row = (label: string, hint: string, icon: keyof typeof Ionicons.glyphMap, color: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.label, { color: color === colors.danger ? colors.danger : colors.text }]}>{label}</Text>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} title="Foto profil" onClose={onClose}>
      {row(
        hasAvatar ? 'Ganti foto' : 'Pilih foto',
        'JPG, PNG, WEBP, GIF · maks 5 MB',
        'images-outline',
        colors.primary,
        () => {
          onClose();
          onChange();
        },
      )}
      {hasAvatar && row('Hapus foto', '', 'trash-outline', colors.danger, confirmRemove)}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, borderRadius: 12, paddingHorizontal: 4 },
  label: { fontFamily: font.medium, fontSize: 16 },
  hint: { flex: 1, textAlign: 'right', fontFamily: font.regular, fontSize: 12 },
});
