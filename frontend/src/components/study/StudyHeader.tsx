import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = { title: string; artist: string; onClose: () => void };

export function StudyHeader({ title, artist, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.row, { paddingTop: insets.top + 16 }]}>
      <Pressable hitSlop={12} onPress={onClose} accessibilityRole="button" accessibilityLabel="Tutup">
        <Ionicons name="chevron-down" size={28} color={colors.text} />
      </Pressable>
      <View style={styles.titles}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.artist, { color: colors.textMuted }]} numberOfLines={1}>
          {artist}
        </Text>
      </View>
      <Pressable
        hitSlop={12}
        onPress={() => Alert.alert('Segera hadir', 'Menu kartu belum tersedia.')}
        accessibilityRole="button"
        accessibilityLabel="Menu"
      >
        <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 10 },
  titles: { flex: 1 },
  title: { fontFamily: font.extrabold, fontWeight: '800', fontSize: 20 },
  artist: { fontFamily: font.regular, fontSize: 13 },
});
