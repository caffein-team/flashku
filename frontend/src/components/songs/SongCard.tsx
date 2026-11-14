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

import { LYRICS_STATUS_LABEL, formatDuration, type Song } from '@/api/songs';
import { youtubeThumbnail } from '@/features/songs/thumbnail';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  song: Song;
  index: number;
  /** Mode pencarian: thumbnail jadi tombol play. */
  expanded: boolean;
  playing: boolean;
  onTogglePlay: () => void;
  onOpen: () => void;
  onLongPress?: () => void;
  /** Mode multi-pilih: kartu menampilkan kotak centang. */
  selectMode?: boolean;
  selected?: boolean;
  /** Tombol hapus di pojok kanan atas kartu; hanya tampil bila diisi. */
  onRemove?: () => void;
  removeLabel?: string;
};

const EASE = Easing.out(Easing.cubic);

export function SongCard({
  song,
  index,
  expanded,
  playing,
  onTogglePlay,
  onOpen,
  onLongPress,
  selectMode,
  selected,
  onRemove,
  removeLabel = 'Hapus',
}: Props) {
  const { colors } = useTheme();
  const isPlaying = expanded && playing;

  // 0 = tampilan biasa, 1 = mode pencarian
  const exp = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    exp.value = withTiming(expanded ? 1 : 0, { duration: 300, easing: EASE });
  }, [expanded, exp]);

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
    borderColor: selected ? colors.primary : interpolateColor(play.value, [0, 1], ['transparent', colors.primary]),
  }));
  return (
    <Animated.View
      entering={index < 8 ? FadeInDown.delay(index * 60).duration(350) : undefined}
      style={[styles.card, { backgroundColor: colors.surface }, cardStyle]}
    >
      <Pressable
        onPress={expanded && !selectMode ? onTogglePlay : onOpen}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={expanded ? (isPlaying ? 'Jeda lagu' : 'Putar lagu') : `Pelajari ${song.title}`}
      >
        <View style={[styles.thumb, { backgroundColor: colors.banner }]}>
          <View style={styles.thumbIcon}>
            <Ionicons name="musical-notes-outline" size={30} color={colors.link} />
          </View>
          <Image
            source={{ uri: song.thumbnail ?? youtubeThumbnail(song.youtubeId) }}
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
          {selectMode && (
            <View
              style={[
                styles.check,
                selected ? { backgroundColor: colors.primary, borderColor: colors.primary } : { borderColor: '#fff' },
              ]}
            >
              {selected && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
          )}
          {song.durationSec > 0 && (
            <View style={styles.duration}>
              <Text style={styles.durationText}>{formatDuration(song.durationSec)}</Text>
            </View>
          )}
        </View>
      </Pressable>

      <Pressable style={[styles.info, (!!onRemove || song.isFavorite) && styles.infoRemovable]} onPress={onOpen} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={`Pelajari ${song.title}`}>
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
        <Text
          style={[styles.meta, { color: song.lyricsStatus === 'not_found' ? colors.danger : colors.textMuted }]}
          numberOfLines={1}
        >
          {LYRICS_STATUS_LABEL[song.lyricsStatus]}
        </Text>
      </Pressable>

      {song.isFavorite && (
        <View style={styles.favorite} pointerEvents="none" accessibilityLabel="Favorit">
          <Ionicons name="heart" size={16} color={colors.primary} />
        </View>
      )}

      {onRemove && (
        <Pressable
          onPress={onRemove}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          style={({ pressed }) => [styles.remove, pressed && { backgroundColor: colors.dangerSoft }]}
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
        </Pressable>
      )}
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
  check: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  durationText: { color: '#fff', fontFamily: font.bold, fontSize: 11 },
  info: { flex: 1, gap: 4 },
  infoRemovable: { paddingRight: 26 },
  favorite: { position: 'absolute', right: 12, bottom: 10 },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: font.bold, fontWeight: '700', fontSize: 15.5 },
  artistRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  artist: { fontFamily: font.regular, fontSize: 13.5, flexShrink: 1 },
  nowPlaying: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nowPlayingText: { fontFamily: font.bold, fontSize: 12 },
  meta: { fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },
});
