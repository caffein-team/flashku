import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { PageHeader } from '@/components/PageHeader';
import { OptionSheet, TimeSheet } from '@/components/settings/Sheets';
import { Card, NavRow, SectionTitle, ToggleRow, webSwitchProps } from '@/components/settings/SettingsUI';
import { useNotificationSettings } from '@/features/settings/notifications/useNotificationSettings';
import {
  REPEAT_LABELS,
  formatTime,
  type Repeat,
} from '@/features/settings/notifications/types';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

const REPEAT_OPTIONS = (Object.keys(REPEAT_LABELS) as Repeat[]).map((value) => ({
  value,
  label: REPEAT_LABELS[value],
}));

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const { settings: s, loaded, update, saveState, unsupported } = useNotificationSettings();
  const [sheet, setSheet] = useState<'time' | 'repeat' | null>(null);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));
  const subOff = !s.enabled;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title="Notifikasi" onBack={goBack} />

      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(250)} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.content}>
            <Card>
              <ToggleRow
                large
                title="Aktifkan notifikasi"
                subtitle="Tetap semangat belajar bersama FlashKu."
                value={s.enabled}
                onChange={(enabled) => update({ enabled })}
              />
            </Card>

            <View style={[styles.group, subOff && styles.dim]} pointerEvents={subOff ? 'none' : 'auto'}>
              <SectionTitle>Aktivitas belajar</SectionTitle>
              <Card>
                <ToggleRow
                  title="Pengingat belajar"
                  subtitle="Luangkan waktu untuk latihan harian."
                  value={s.studyReminder}
                  onChange={(studyReminder) => update({ studyReminder })}
                />
                <ToggleRow
                  first={false}
                  title="Target & streak"
                  subtitle="Jaga streak dan capai target belajarmu."
                  value={s.streakGoal}
                  onChange={(streakGoal) => update({ streakGoal })}
                />
                <ToggleRow
                  first={false}
                  title="Ringkasan mingguan"
                  subtitle="Lihat perkembanganmu setiap minggu."
                  value={s.weeklySummary}
                  onChange={(weeklySummary) => update({ weeklySummary })}
                />
              </Card>

              <SectionTitle>Jadwal pengingat</SectionTitle>
              <Card style={s.studyReminder ? undefined : styles.dim}>
                <NavRow
                  first
                  label="Waktu belajar"
                  value={formatTime(s.studyTime)}
                  disabled={!s.studyReminder}
                  onPress={() => setSheet('time')}
                />
                <NavRow
                  label="Ulangi"
                  value={REPEAT_LABELS[s.repeat]}
                  disabled={!s.studyReminder}
                  onPress={() => setSheet('repeat')}
                />
              </Card>

              <View style={[styles.quiet, { backgroundColor: colors.banner }]}>
                <View style={styles.flex}>
                  <Text style={[styles.quietTitle, { color: colors.bannerText }]}>Mode tenang</Text>
                  <Text style={[styles.quietSub, { color: colors.link }]}>
                    Jeda notifikasi pukul {formatTime(s.quietFrom)}–{formatTime(s.quietTo)}
                  </Text>
                </View>
                <QuietSwitch value={s.quietMode} onChange={(quietMode) => update({ quietMode })} />
              </View>
            </View>

            <SaveStatus state={saveState} unsupported={unsupported} />
          </ScrollView>
        </Animated.View>
      )}

      <TimeSheet
        key={sheet === 'time' ? 'open' : 'closed'} // setel ulang pilihan jam/menit tiap dibuka
        visible={sheet === 'time'}
        title="Waktu belajar"
        value={s.studyTime}
        onSave={(studyTime) => update({ studyTime })}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === 'repeat'}
        title="Ulangi"
        options={REPEAT_OPTIONS}
        selected={s.repeat}
        onSelect={(repeat) => update({ repeat })}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function QuietSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel="Mode tenang"
      trackColor={{ false: colors.track, true: colors.primary }}
      thumbColor="#fff"
      {...webSwitchProps}
    />
  );
}

function SaveStatus({ state, unsupported }: { state: 'idle' | 'saving' | 'saved' | 'error'; unsupported: boolean }) {
  const { colors } = useTheme();
  let content: ReactNode;
  if (state === 'saving') {
    content = (
      <>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={[styles.status, { color: colors.textMuted }]}>Menyimpan…</Text>
      </>
    );
  } else if (state === 'error') {
    content = (
      <>
        <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
        <Text style={[styles.status, { color: colors.danger }]}>Tersimpan di perangkat, belum tersinkron ke server</Text>
      </>
    );
  } else {
    content = (
      <>
        <Ionicons name="checkmark" size={16} color={colors.textMuted} />
        <Text style={[styles.status, { color: colors.textMuted }]}>Perubahan tersimpan otomatis</Text>
      </>
    );
  }
  return (
    <View style={styles.statusWrap}>
      <View style={styles.statusRow}>{content}</View>
      {unsupported && state !== 'saving' && (
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Pengingat berjalan di aplikasi Android; di web hanya pengaturan yang disimpan.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  group: { gap: 12 },
  dim: { opacity: 0.45 },
  quiet: { borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  quietTitle: { fontFamily: font.bold, fontSize: 16 },
  quietSub: { fontFamily: font.medium, fontSize: 13, marginTop: 2 },
  statusWrap: { alignItems: 'center', gap: 4, marginTop: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20 },
  status: { fontFamily: font.regular, fontSize: 13 },
  hint: { fontFamily: font.regular, fontSize: 12, textAlign: 'center' },
});
