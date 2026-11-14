import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { headerColor } from '@/theme/colors';
import { font } from '@/theme/fonts';

type Props = {
  title: string;
  onBack?: () => void;
};

export function PageHeader({ title, onBack }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
      {onBack ? (
        <View style={styles.row}>
          <Pressable hitSlop={12} onPress={onBack} accessibilityRole="button" accessibilityLabel="Kembali">
            <Ionicons name="arrow-back" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
        </View>
      ) : (
        <Text style={styles.title}>{title}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: headerColor,
    paddingHorizontal: 24,
    paddingBottom: 28,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontFamily: font.extrabold, fontSize: 28, color: '#fff' },
});
