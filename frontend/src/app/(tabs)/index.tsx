import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { Song } from '@/api/songs';
import { useAuth } from '@/auth/AuthProvider';
import { PageHeader } from '@/components/PageHeader';
import { useSongsList } from '@/features/songs/queries';
import { useProgress } from '@/features/stats/progress';
import { useVocabularyCount } from '@/features/stats/vocabulary';
import { youtubeThumbnail } from '@/features/songs/thumbnail';
import { getLastStudiedSong } from '@/features/study/lastStudied';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export default function HomeScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const list = useSongsList();
  const progress = useProgress();
  const vocabulary = useVocabularyCount();
  const lastId = useQuery({ queryKey: ['last-studied'], queryFn: getLastStudiedSong, gcTime: 0 });

  const songs = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const username = user?.username ?? user?.name;
  const total = list.data?.pages[0]?.total;
  const resume = songs.find((s) => s.id === lastId.data) ?? songs[0];

  const level = Math.max(progress.data?.level ?? 0, user?.level ?? 0) || 1;
  const percent = Math.min(100, Math.max(0, progress.data?.percent ?? 0));
  const stats = [
    { label: 'Kosakata', value: vocabulary.count ?? '—' },
    { label: 'Lagu', value: total ?? '—' },
  ];

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title={`Halo${username ? ` ${username}` : ''}!`} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.levelCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statValue, { color: colors.link }]}>{level}</Text>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>Level</Text>
          <View
            style={[styles.bar, { backgroundColor: colors.track }]}
            accessibilityRole="progressbar"
            accessibilityLabel="Progres XP menuju level berikutnya"
            accessibilityValue={{ min: 0, max: 100, now: percent }}
          >
            <View style={[styles.barFill, { backgroundColor: colors.link, width: `${percent}%` }]} />
          </View>
          {!!progress.data?.xpRequired && (
            <Text style={[styles.xpText, { color: colors.textMuted }]}>
              {progress.data.xp}/{progress.data.xpRequired} XP
            </Text>
          )}
        </View>

        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={[styles.stat, { backgroundColor: colors.surface }]}>
              <Text style={[styles.statValue, { color: colors.link }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {resume && (
          <>
            <Text style={[styles.heading, { color: colors.text }]}>Lanjutkan belajar</Text>
            <ResumeCard song={resume} />
          </>
        )}

        <Text style={[styles.heading, { color: colors.text }]}>Jelajahi</Text>
        <LinkRow icon="albums-outline" label="Belajar semua kartu" onPress={() => router.push('/study/all?scope=all' as Href)} />
        <LinkRow
          icon="heart-outline"
          label="Lagu terfavorit"
          onPress={() => router.navigate({ pathname: '/songs', params: { filter: 'favorite', t: String(Date.now()) } } as Href)}
        />
        <LinkRow icon="add" label="Tambah lagu" onPress={() => router.push('/add-song' as Href)} />
      </ScrollView>
    </View>
  );
}

function ResumeCard({ song }: { song: Song }) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={[styles.thumb, { backgroundColor: colors.banner }]}>
        <Ionicons name="musical-notes-outline" size={26} color={colors.link} />
        <Image
          source={{ uri: song.thumbnail ?? youtubeThumbnail(song.youtubeId) }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </View>
      <View style={styles.info}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {song.artist}
        </Text>
      </View>
      <Pressable
        onPress={() => router.push(`/study/${song.id}` as Href)}
        accessibilityRole="button"
        accessibilityLabel={`Lanjutkan belajar ${song.title}`}
        style={[styles.play, { backgroundColor: colors.primary }]}
      >
        <Ionicons name="play-outline" size={22} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

function LinkRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.link, { backgroundColor: colors.surface }, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.linkIcon, { backgroundColor: colors.banner }]}>
        <Ionicons name={icon} size={22} color={colors.link} />
      </View>
      <Text style={[styles.linkLabel, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, paddingBottom: 32, gap: 12 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, borderRadius: 20, paddingVertical: 14, alignItems: 'center', gap: 2 },
  // Tidak memakai `stat`: flex: 1 di dalam kolom membuat kartu ini menciut ke tinggi 0.
  levelCard: { borderRadius: 20, paddingTop: 14, paddingBottom: 18, paddingHorizontal: 20, alignItems: 'center', gap: 2 },
  bar: { alignSelf: 'stretch', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 8 },
  xpText: { fontFamily: font.regular, fontSize: 12, marginTop: 4 },
  barFill: { height: '100%', borderRadius: 5 },
  statValue: { fontFamily: font.extrabold, fontSize: 26 },
  statLabel: { fontFamily: font.regular, fontSize: 13 },
  heading: { fontFamily: font.extrabold, fontSize: 18, marginTop: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 20 },
  thumb: { width: 64, height: 64, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  title: { fontFamily: font.bold, fontWeight: '700', fontSize: 16 },
  meta: { fontFamily: font.regular, fontSize: 13 },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 20 },
  linkIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  linkLabel: { fontFamily: font.bold, fontWeight: '700', fontSize: 16 },
});
