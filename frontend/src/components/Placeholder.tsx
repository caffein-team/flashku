import { StyleSheet, Text, View } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { PageHeader } from './PageHeader';

export function Placeholder({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title={title} />
      <View style={styles.center}>
        <Text style={[styles.text, { color: colors.textMuted }]}>Segera hadir</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: font.medium, fontSize: 15 },
});
