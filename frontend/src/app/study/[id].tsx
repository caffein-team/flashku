import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { AnswerView } from '@/components/study/AnswerView';
import { QuestionView } from '@/components/study/QuestionView';
import { StudyHeader } from '@/components/study/StudyHeader';
import { useSongs } from '@/features/songs/SongsProvider';
import { getDeck } from '@/features/study/deck';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export default function StudyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { songs, markLearned } = useSongs();

  const song = songs.find((s) => s.id === id);
  const deck = useMemo(() => getDeck(id ?? ''), [id]);

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const empty = deck.length === 0;
  const finished = !empty && index >= deck.length;
  const card = deck[index];

  const answer = (easy: boolean) => {
    if (easy && song) markLearned(song.id);
    // TODO: kirim hasil (mudah/sulit) ke backend untuk penjadwalan ulang kartu.
    setRevealed(false);
    setIndex((i) => i + 1);
  };

  const close = () => router.back();

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <StudyHeader title={song?.title ?? 'Lagu'} artist={song?.artist ?? ''} onClose={close} />

      <View style={[styles.flex, styles.body]}>
        {empty ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.done}>
            <View style={[styles.doneIcon, { backgroundColor: colors.banner }]}>
              <Ionicons name="albums-outline" size={40} color={colors.primary} />
            </View>
            <Text style={[styles.doneTitle, { color: colors.text }]}>Kartu belum tersedia</Text>
            <Text style={[styles.doneText, { color: colors.textMuted }]}>
              Kosakata untuk lagu ini masih disiapkan.
            </Text>
          </Animated.View>
        ) : finished ? (
          <Animated.View entering={FadeIn.duration(300)} style={styles.done}>
            <View style={[styles.doneIcon, { backgroundColor: colors.successSoft }]}>
              <Ionicons name="checkmark" size={44} color={colors.success} />
            </View>
            <Text style={[styles.doneTitle, { color: colors.text }]}>Sesi selesai</Text>
            <Text style={[styles.doneText, { color: colors.textMuted }]}>
              Kamu sudah melewati {deck.length} kartu dari lagu ini.
            </Text>
          </Animated.View>
        ) : (
          // key = kartu baru: kartu lama keluar ke kiri, kartu baru masuk dari kanan.
          <Animated.View
            key={card.id}
            entering={SlideInRight.duration(280)}
            exiting={SlideOutLeft.duration(200)}
            style={styles.flex}
          >
            {revealed ? (
              <Animated.View key="answer" entering={FadeIn.duration(220)} style={styles.flex}>
                <AnswerView card={card} videoId={song?.id ?? ''} />
              </Animated.View>
            ) : (
              <Animated.View key="question" exiting={FadeOut.duration(120)} style={[styles.flex, styles.questionWrap]}>
                <QuestionView card={card} />
              </Animated.View>
            )}
          </Animated.View>
        )}
      </View>

      <View
        style={[
          styles.bar,
          { backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: insets.bottom + 16 },
        ]}
      >
        {empty || finished ? (
          <Button title="Kembali ke daftar lagu" onPress={close} />
        ) : revealed ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.rate}>
            <RateButton label="Sulit" bg={colors.dangerSoft} fg={colors.danger} onPress={() => answer(false)} />
            <RateButton label="Mudah" bg={colors.successSoft} fg={colors.success} onPress={() => answer(true)} />
          </Animated.View>
        ) : (
          <Button title="Lihat Jawaban" onPress={() => setRevealed(true)} />
        )}
      </View>
    </View>
  );
}

function RateButton({ label, bg, fg, onPress }: { label: string; bg: string; fg: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.rateBtn, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}
    >
      <Text style={[styles.rateText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { paddingTop: 4 },
  questionWrap: { paddingHorizontal: 20, paddingBottom: 20 },
  bar: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    boxShadow: '0 -4px 16px rgba(60, 50, 140, 0.06)',
  },
  rate: { flexDirection: 'row', gap: 12 },
  rateBtn: { flex: 1, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  rateText: { fontFamily: font.bold, fontSize: 16 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: font.extrabold, fontSize: 24 },
  doneText: { fontFamily: font.regular, fontSize: 15, textAlign: 'center' },
});
