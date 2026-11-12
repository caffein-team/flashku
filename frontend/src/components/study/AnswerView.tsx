import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import type { Flashcard } from '@/features/study/deck';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import type { ClipPlayerHandle } from './clip/config';
import { ClipFrame } from './clip/ClipFallback';
import ClipPlayer from './clip/ClipPlayer';
import { ClipTuner, type Clip } from './clip/ClipTuner';
import { LyricLine } from './LyricLine';

type Media = 'video' | 'illustration';
const SPEEDS = [0.5, 0.75, 1, 1.25] as const;

/** Sisi belakang kartu: potongan lagu (video/ilustrasi), arti kata, dan baris lirik lengkap dengan furigana. */
export function AnswerView({ card, videoId }: { card: Flashcard; videoId: string }) {
  const { colors } = useTheme();
  const [media, setMedia] = useState<Media>('video');
  const [playing, setPlaying] = useState(!!card.clip);
  const [liked, setLiked] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(2);

  // Alat penentu klip (hanya dev): putar video penuh, tandai baris, coba hasilnya.
  const [tuning, setTuning] = useState(false);
  const [time, setTime] = useState(0);
  const [tried, setTried] = useState<Clip | null>(null);
  const handleRef = useRef<ClipPlayerHandle>(null);
  const clip = tried ?? card.clip;
  const showPlayer = media === 'video' && (tuning || !!clip);

  const pill = { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Animated.View entering={FadeIn.duration(250)} style={[styles.tabs, pill]}>
        <Tab
          label="Video"
          icon="videocam-outline"
          active={media === 'video'}
          onPress={() => {
            setMedia('video');
            setPlaying(true);
          }}
        />
        <Tab
          label="Ilustrasi"
          icon="image-outline"
          active={media === 'illustration'}
          onPress={() => {
            setMedia('illustration');
            setPlaying(false);
          }}
        />
      </Animated.View>

      <Animated.View entering={FadeIn.duration(250).delay(40)}>
        {showPlayer ? (
          <ClipPlayer
            key={tuning ? 'tune' : 'clip'}
            videoId={videoId}
            startSec={tuning || !clip ? 0 : clip.startSec}
            endSec={tuning || !clip ? 100000 : clip.endSec}
            playing={playing}
            rate={SPEEDS[speedIdx]}
            onPlayingChange={setPlaying}
            onTime={tuning ? setTime : undefined}
            handleRef={handleRef}
          />
        ) : (
          // Ilustrasi: TODO dari backend. Video: klip baris ini belum diketahui.
          <ClipFrame message={media === 'video' ? 'Klip untuk baris ini belum tersedia' : undefined} />
        )}
      </Animated.View>

      <View style={styles.controls}>
        <Pressable
          style={[styles.sidePill, pill]}
          onPress={() => setLiked((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Favorit"
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={colors.primary} />
        </Pressable>
        <Pressable
          style={[styles.play, { backgroundColor: colors.primary }]}
          onPress={() => setPlaying((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Jeda' : 'Putar'}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#fff" />
        </Pressable>
        <Pressable
          style={[styles.sidePill, pill]}
          onPress={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
          accessibilityRole="button"
          accessibilityLabel="Kecepatan"
        >
          <Text style={[styles.speed, { color: colors.primary }]}>{SPEEDS[speedIdx]}x</Text>
        </Pressable>
      </View>

      {__DEV__ && media === 'video' && (
        <Pressable
          onPress={() => {
            setTuning((t) => !t);
            setPlaying(tuning); // masuk mode atur: mulai dijeda; keluar: putar klip
            setTime(0);
          }}
          style={styles.devToggle}
          accessibilityRole="button"
        >
          <Text style={[styles.devToggleText, { color: colors.textMuted }]}>
            {tuning ? 'Tutup penentu klip' : 'Atur klip (dev)'}
          </Text>
        </Pressable>
      )}
      {__DEV__ && tuning && (
        <ClipTuner
          time={time}
          onSeek={(sec) => handleRef.current?.seekTo(sec)}
          onTry={(c) => {
            setTried(c);
            setTuning(false);
            setPlaying(true);
          }}
        />
      )}

      <Animated.View
        entering={FadeInDown.duration(300).delay(80)}
        style={[styles.card, styles.wordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.reading, { color: colors.text }]}>{card.reading}</Text>
        <Text style={[styles.word, { color: colors.primary }]}>{card.word}</Text>
        <Text style={[styles.meaning, { color: colors.textMuted }]}>{card.meaning}</Text>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(300).delay(140)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.lyricBox, { backgroundColor: colors.tint }]}>
          <View style={styles.lyricLeft}>
            <LyricLine segments={card.line} furigana size={22} align="flex-start" />
          </View>
          <Text style={[styles.translation, { color: colors.text }]}>{card.translation}</Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

function Tab({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const fg = active ? colors.primaryText : colors.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.tab, { backgroundColor: active ? colors.primary : colors.surfaceMuted }]}
    >
      <Ionicons name={icon} size={18} color={fg} />
      <Text style={[styles.tabText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  tabs: { flexDirection: 'row', gap: 6, padding: 4, borderRadius: 24, borderWidth: 1 },
  tab: { flex: 1, height: 38, borderRadius: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tabText: { fontFamily: font.bold, fontSize: 14 },
  media: { height: 186, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E53935' },
  badgeText: { fontFamily: font.bold, fontSize: 12, color: '#222' },
  devToggle: { alignSelf: 'center', paddingVertical: 2 },
  devToggleText: { fontFamily: font.medium, fontSize: 12, textDecorationLine: 'underline' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  sidePill: { width: 62, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  speed: { fontFamily: font.bold, fontSize: 14 },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 26, borderWidth: 1, padding: 12 },
  wordCard: { alignItems: 'center', paddingVertical: 18 },
  reading: { fontFamily: font.bold, fontWeight: '700', fontSize: 20 },
  word: { fontFamily: font.extrabold, fontWeight: '800', fontSize: 64, lineHeight: 80 },
  meaning: { fontFamily: font.regular, fontSize: 20 },
  lyricBox: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  lyricLeft: { alignItems: 'flex-start' },
  translation: { fontFamily: font.bold, fontSize: 14 },
});
