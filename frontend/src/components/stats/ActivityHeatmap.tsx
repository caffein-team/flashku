import { useRef, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ActivityStats } from '@/features/stats/activity';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

const ROW_LABELS: Record<number, string> = { 0: 'Sen', 2: 'Rab', 4: 'Jum', 6: 'Min' };
const GAP = 4;
const CELL = 14;
const LABEL_WIDTH = 30;
const MONTH_ROW = 16;

/** Kisi aktivitas: kolom = minggu, baris = Senin–Minggu; warna makin pekat = makin banyak sesi. */
export function ActivityHeatmap({ stats }: { stats: ActivityStats }) {
  const { colors } = useTheme();
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const levels = [colors.surfaceMuted, `${colors.primary}40`, `${colors.primary}73`, `${colors.primary}B3`, colors.primary];
  const levelOf = (sessions: number) => Math.min(sessions === 0 ? 0 : sessions + 1, levels.length - 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.grid}>
        <View style={{ width: LABEL_WIDTH, gap: GAP }}>
          <View style={{ height: MONTH_ROW }} />
          {Array.from({ length: 7 }, (_, d) => (
            <View key={d} style={{ height: CELL, justifyContent: 'center' }}>
              <Text style={[styles.labelText, { color: colors.textMuted }]}>{ROW_LABELS[d] ?? ''}</Text>
            </View>
          ))}
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          contentContainerStyle={styles.weeks}
        >
          {stats.weeks.map((week, w) => (
            <View key={w} style={{ width: CELL, gap: GAP }}>
              <View style={{ height: MONTH_ROW, justifyContent: 'center' }}>
                {stats.monthLabels[w] && (
                  <Text style={[styles.labelText, styles.month, { color: colors.text }]}>{stats.monthLabels[w]}</Text>
                )}
              </View>
              {week.map((cell, d) => (
                <View
                  key={d}
                  accessibilityLabel={`${cell.date.toDateString()}: ${cell.sessions} sesi`}
                  style={[styles.cell, { backgroundColor: cell.future ? 'transparent' : levels[levelOf(cell.sessions)] }]}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.legend}>
        <Text style={[styles.labelText, { color: colors.textMuted }]}>Lebih sedikit</Text>
        <View style={styles.swatches}>
          {levels.map((c, i) => (
            <View key={i} style={[styles.swatch, { backgroundColor: c }]} />
          ))}
        </View>
        <Text style={[styles.labelText, { color: colors.textMuted }]}>Lebih banyak</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 14 },
  grid: { flexDirection: 'row', gap: GAP },
  weeks: { gap: GAP, paddingRight: 28 },
  month: { position: 'absolute', left: 0, width: 40 },
  cell: { width: CELL, height: CELL, borderRadius: 4 },
  labelText: { fontFamily: font.medium, fontSize: 11 },
  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swatches: { flexDirection: 'row', gap: 4 },
  swatch: { width: 14, height: 14, borderRadius: 3 },
});
