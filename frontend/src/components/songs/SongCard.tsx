import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { songProgress, songStatus, type Song } from '@/features/songs/SongsProvider';
import { youtubeThumbnail } from '@/features/songs/thumbnail';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  song: Song;
  index: number;
  /** Mode pencarian: thumbnail jadi tombol play dan persentase muncul. */
  expanded: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  /** Buka sesi flashcard lagu ini. */
  onOpen: () => void;
};

const EASE = Easing.out(Easing.cubic);

export function SongCard({ song, index, expanded, playing, onTogglePlay, onOpen }: Props) {
  const { colors } = useTheme();
  const progress = songProgress(song);
  const status = songStatus(song);
  const pct = Math.round(progress * 100);
  const preparing = song.total === 0;
  const isPlaying = expanded && playing;

  // 0 = tampilan biasa, 1 = mode pencarian
  const exp = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    exp.value = withTiming(expanded ? 1 : 0, { duration: 300, easing: EASE });
  }, [expanded, exp]);

  // Isi progress bar tumbuh dari 0 saat pertama tampil.
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 600, easing: EASE });
  }, [progress, fill]);

  const play = useSharedValue(isPlaying ? 1 : 0);
  useEffect(() => {
    play.value = withTiming(isPlaying ? 1 : 0, { duration: 220 });
  }, [isPlaying, play]);

  // Scrim gelap tipis saat mode pencarian supaya tombol play terbaca di atas gambar.
  const scrimStyle = useAnimatedStyle(() => ({ opacity: exp.value * 0.28 }));
  const playingTint = useAnimatedStyle(() => ({ opacity: play.value * 0.85 }));
  const playBtnStyle = useAnimatedStyle(() => ({
    opacity: exp.value,
    transform: [{ scale: 0.7 + 0.3 * exp.value }],
  }));
  const cardStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(play.value, [0, 1], ['transparent', colors.primary]),
  }));
  const pctStyle = useAnimatedStyle(() => ({ opacity: exp.value }));
  const barFill = useAnimatedStyle(() => ({
    width: `${fill.value * 100}%`,
    backgroundColor:
      status === 'done'
        ? interpolateColor(exp.value, [0, 1], [colors.primary, colors.success])
        : colors.primary,
  }));

  return (
    <Animated.View
      entering={index < 8 ? FadeInDown.delay(index * 60).duration(350) : undefined}
      style={[styles.card, { backgroundColor: colors.surface }, cardStyle]}
    >
      <Pressable
        onPress={expanded ? onTogglePlay : onOpen}
        accessibilityRole="button"
        accessibilityLabel={expanded ? (isPlaying ? 'Jeda lagu' : 'Putar lagu') : `Pelajari ${song.title}`}
      >
        <View style={[styles.thumb, { backgroundColor: colors.banner }]}>
          <View style={styles.thumbIcon}>
            <Ionicons name="musical-notes-outline" size={30} color={colors.link} />
          </View>
          <Image
            source={{ uri: youtubeThumbnail(song.id) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            accessibilityIgnoresInvertColors
          />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }, scrimStyle]} />
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.primary }, playingTint]}
          />
          <Animated.View style={[styles.thumbIcon, playBtnStyle]}>
            <View style={styles.playCircle}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color={colors.primary} />
            </View>
          </Animated.View>
          {!!song.duration && (
            <View style={styles.duration}>
              <Text style={styles.durationText}>{song.duration}</Text>
            </View>
          )}
        </View>
      </Pressable>

      <Pressable style={styles.info} onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Pelajari ${song.title}`}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {song.title}
        </Text>
        <View style={styles.artistRow}>
          <Text style={[styles.artist, { color: colors.textMuted }]} numberOfLines={1}>
            {song.artist}
          </Text>
          {isPlaying && (
            <Animated.View entering={FadeInDown.duration(200)} style={styles.nowPlaying}>
              <Ionicons name="stats-chart" size={13} color={colors.primary} />
              <Text style={[styles.nowPlayingText, { color: colors.primary }]}>Sedang diputar</Text>
            </Animated.View>
          )}
        </View>
        <View style={[styles.track, { backgroundColor: colors.track }]}>
          <Animated.View style={[styles.fill, barFill]} />
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
            {preparing ? 'Kosakata sedang disiapkan' : `${song.learned} dari ${song.total} kosakata`}
          </Text>
          {!preparing && (
            <Animated.View style={pctStyle}>
              {status === 'done' ? (
                <Text style={[styles.pct, { color: colors.success }]}>✓ Selesai</Text>
              ) : (
                <Text style={[styles.pct, { color: colors.primary }]}>{pct}%</Text>
              )}
            </Animated.View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    boxShadow: '0 2px 10px rgba(60, 50, 140, 0.08)',
  },
  thumb: { width: 100, height: 76, borderRadius: 14, overflow: 'hidden' },
  thumbIcon: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: '#000',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { color: '#fff', fontFamily: font.bold, fontSize: 11 },
  info: { flex: 1, gap: 4 },
  title: { fontFamily: font.bold, fontWeight: '700', fontSize: 15.5 },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  artist: { fontFamily: font.regular, fontSize: 13.5, flexShrink: 1 },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nowPlayingText: { fontFamily: font.bold, fontSize: 12 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 2 },
  fill: { height: '100%', borderRadius: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meta: { fontFamily: font.regular, fontSize: 12.5, flexShrink: 1 },
  pct: { fontFamily: font.bold, fontSize: 12.5 },
});
