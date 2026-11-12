import { StyleSheet, Text, View } from 'react-native';

import type { Segment } from '@/features/study/deck';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  segments: Segment[];
  /** Tampilkan furigana di atas kanji. */
  furigana?: boolean;
  size?: number;
  /** Warna teks biasa; default mengikuti tema. */
  color?: string;
  /** Beri warna dan garis bawah pada kata target. */
  highlight?: boolean;
  align?: 'center' | 'flex-start';
};

/** Satu baris lirik dengan furigana per potongan (ruby text). */
export function LyricLine({ segments, furigana, size = 22, color, highlight = true, align = 'center' }: Props) {
  const { colors } = useTheme();
  const base = color ?? colors.text;
  const rubySize = Math.max(10, Math.round(size * 0.42));

  return (
    <View style={[styles.row, { justifyContent: align }]}>
      {segments.map((seg, i) => {
        const isTarget = highlight && !!seg.target;
        return (
          <View key={i} style={styles.col}>
            {furigana && (
              <Text style={[styles.ruby, { fontSize: rubySize, color: seg.reading ? colors.primary : 'transparent' }]}>
                {seg.reading ?? '・'}
              </Text>
            )}
            <Text
              style={[
                styles.text,
                { fontSize: size, color: isTarget ? colors.primary : base },
                isTarget && styles.target,
              ]}
            >
              {seg.text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  col: { alignItems: 'center' },
  ruby: { fontFamily: font.bold, fontWeight: '700', lineHeight: 14 },
  text: { fontFamily: font.bold, fontWeight: '700' },
  target: { textDecorationLine: 'underline' },
});
