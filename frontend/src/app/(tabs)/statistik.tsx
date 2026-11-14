import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { ActivityHeatmap } from '@/components/stats/ActivityHeatmap';
import { buildActivityStats } from '@/features/stats/activity';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export default function StatsScreen() {
  const { colors } = useTheme();
  const stats = useMemo(() => buildActivityStats(), []);
  const box = { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title="Statistik" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: colors.text }]}>Aktivitas bermain</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Lihat konsistensi latihanmu setiap hari.</Text>

        <View style={styles.row}>
          <View style={[styles.stat, box]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.totalSessions}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Total sesi</Text>
          </View>
          <View style={[styles.stat, box]}>
            <Text style={[styles.statValue, { color: colors.primary }]}>{stats.activeDays}</Text>
            <Text style={[styles.statLabel, { color: colors.textMuted }]}>Hari aktif</Text>
          </View>
        </View>

        <View style={[styles.card, box]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Keaktifan harian</Text>
            <View style={[styles.chip, { backgroundColor: colors.tint }]}>
              <Text style={[styles.chipText, { color: colors.link }]}>{stats.year}</Text>
            </View>
          </View>
          <Text style={[styles.range, { color: colors.textMuted }]}>{stats.rangeLabel}</Text>
          <ActivityHeatmap stats={stats} />
        </View>

        <View style={[styles.card, styles.streak, box]}>
          <View style={[styles.streakBox, { backgroundColor: colors.banner }]}>
            <Text style={[styles.streakNum, { color: colors.link }]}>{stats.streak.days}</Text>
            <Text style={[styles.streakUnit, { color: colors.bannerText }]}>hari</Text>
          </View>
          <View style={styles.flex}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Berturut-turut</Text>
            <Text style={[styles.range, { color: colors.textMuted }]}>{stats.streak.label}</Text>
            <Text style={[styles.cheer, { color: colors.link }]}>
              {stats.streak.days > 0 ? 'Pertahankan ritme latihanmu!' : 'Mulai latihan hari ini!'}
            </Text>
          </View>
        </View>

        <Text style={[styles.note, { color: colors.textMuted }]}>
          Warna semakin pekat = semakin banyak sesi.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 14 },
  heading: { fontFamily: font.extrabold, fontSize: 22 },
  sub: { fontFamily: font.regular, fontSize: 14, marginTop: -8 },
  row: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, borderRadius: 20, borderWidth: 1, padding: 16, gap: 2 },
  statValue: { fontFamily: font.extrabold, fontSize: 32 },
  statLabel: { fontFamily: font.medium, fontSize: 14 },
  card: { borderRadius: 24, borderWidth: 1, padding: 16 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: font.bold, fontSize: 17 },
  chip: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6 },
  chipText: { fontFamily: font.bold, fontSize: 13 },
  range: { fontFamily: font.regular, fontSize: 13, marginTop: 4 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  streakBox: { width: 84, height: 84, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  streakNum: { fontFamily: font.extrabold, fontSize: 32, lineHeight: 36 },
  streakUnit: { fontFamily: font.medium, fontSize: 14 },
  cheer: { fontFamily: font.semibold, fontSize: 14, marginTop: 8 },
  note: { fontFamily: font.regular, fontSize: 12, lineHeight: 18 },
});
