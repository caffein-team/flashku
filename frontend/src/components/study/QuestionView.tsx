import { StyleSheet, Text, View } from 'react-native';

import type { Flashcard } from '@/features/study/cards';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { LyricLine } from './LyricLine';

export function QuestionView({ card }: { card: Flashcard }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.word, { color: colors.primary }]}>{card.word}</Text>
      <View style={styles.line}>
        <LyricLine segments={card.line} size={20} color={colors.textMuted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 6,
  },
  word: { fontFamily: font.extrabold, fontWeight: '800', fontSize: 84, lineHeight: 100 },
  line: { marginTop: 4 },
});
