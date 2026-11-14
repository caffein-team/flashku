import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { usePreferences } from '@/features/settings/preferences';
import type { Flashcard } from '@/features/study/cards';
import { shiftOffset, STEP, type Clip } from '@/features/study/clipOffsets';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { ClipFrame } from './clip/ClipFallback';
import ClipPlayer from './clip/ClipPlayer';
import { LyricLine } from './LyricLine';

type Media = 'video' | 'illustration';
const SPEEDS = [0.5, 0.75, 1, 1.25] as const;

type Props = {
  card: Flashcard;
  /** Klip yang diputar, sudah termasuk geseran dari user. */
  clip?: Clip;
  videoId: string;
  /** Geseran klip lagu ini (detik) dan pengubahnya; berlaku untuk semua kartu lagu. */
  offset: number;
  onOffsetChange: (offset: number) => Promise<void>;
};

/** "+1,50 detik" / "-0,25 detik" / "0,00 detik". */
const formatOffset = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2).replace('.', ',')} detik`;
/** Jeda sebelum geseran dipakai pemutar; tiap pakai memuat ulang video, jadi ketukan beruntun digabung. */
const OFFSET_APPLY_MS = 600;

export function AnswerView({ card, clip, videoId, offset, onOffsetChange }: Props) {
  const { colors } = useTheme();
  const { showRomaji } = usePreferences();
  const [media, setMedia] = useState<Media>('video');
  const [playing, setPlaying] = useState(!!clip);

  // Klip digeser dari sheet Atur klip: putar ulang dari awal yang baru.
  const clipKey = clip ? `${clip.startSec}:${clip.endSec}` : '';
  const [seenClipKey, setSeenClipKey] = useState(clipKey);
  if (seenClipKey !== clipKey) {
    setSeenClipKey(clipKey);
    setPlaying(!!clip);
  }
  const [speedIdx, setSpeedIdx] = useState(2);

  const swipe = useMemo(
    () =>
      PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 40) return;
        const next: Media = g.dx < 0 ? 'illustration' : 'video';
        setMedia(next);
        setPlaying(next === 'video');
      },
    }),
    [],
  );

  const [draft, setDraft] = useState(offset);
  const applyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (applyTimer.current) clearTimeout(applyTimer.current);
    },
    [],
  );
  const nudge = (delta: number) => {
    const next = shiftOffset(draft, delta);
    if (next === draft) return;
    setDraft(next);
    if (applyTimer.current) clearTimeout(applyTimer.current);
    // Gagal disimpan: tampilan kembali ke nilai di server (pesan error ditampilkan oleh pemanggil).
    applyTimer.current = setTimeout(() => void onOffsetChange(next).catch(() => setDraft(offset)), OFFSET_APPLY_MS);
  };

  const pill = { backgroundColor: colors.surface, borderColor: colors.border };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Penunjuk saja: geser video ke kiri/kanan untuk berpindah. */}
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {(['video', 'illustration'] as const).map((m) => (
          <View
            key={m}
            style={[styles.pageDot, { backgroundColor: m === media ? colors.primary : colors.border }]}
          />
        ))}
      </View>

      <Animated.View entering={FadeIn.duration(250).delay(40)} {...swipe.panHandlers}>
        {media === 'video' && clip ? (
          <ClipPlayer
            key={clipKey}
            videoId={videoId}
            startSec={clip.startSec}
            endSec={clip.endSec}
            playing={playing}
            rate={SPEEDS[speedIdx]}
            onPlayingChange={setPlaying}
          />
        ) : (
          // Ilustrasi: TODO dari backend. Video: klip baris ini belum diketahui.
          <ClipFrame
            icon={media === 'illustration' ? 'image-outline' : undefined}
            message={media === 'video' ? 'Klip untuk baris ini belum tersedia' : undefined}
          />
        )}
      </Animated.View>

      <View style={styles.controls}>
        <View style={styles.tools}>
          <View style={[styles.stepper, pill]}>
            <Pressable
              style={[styles.step, { backgroundColor: colors.surfaceMuted }]}
              onPress={() => nudge(-STEP)}
              accessibilityRole="button"
              accessibilityLabel={`Klip lebih awal ${STEP} detik`}
            >
              <Ionicons name="remove" size={18} color={colors.primary} />
            </Pressable>
            <Text style={[styles.offset, { color: colors.text }]} accessibilityLabel={`Geseran klip ${formatOffset(draft)}`}>
              {formatOffset(draft)}
            </Text>
            <Pressable
              style={[styles.step, { backgroundColor: colors.surfaceMuted }]}
              onPress={() => nudge(STEP)}
              accessibilityRole="button"
              accessibilityLabel={`Klip lebih lambat ${STEP} detik`}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
            </Pressable>
          </View>
          <Pressable
            style={[styles.sidePill, pill]}
            onPress={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            accessibilityRole="button"
            accessibilityLabel="Kecepatan"
          >
            <Text style={[styles.speed, { color: colors.primary }]}>{SPEEDS[speedIdx]}x</Text>
          </Pressable>
        </View>
        <View style={styles.playWrap}>
          <Pressable
            style={[styles.play, { backgroundColor: colors.primary }]}
            onPress={() => setPlaying((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Jeda' : 'Putar'}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Animated.View
        entering={FadeInDown.duration(300).delay(80)}
        style={[styles.card, styles.wordCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <Text style={[styles.reading, { color: colors.text }]}>{card.reading}</Text>
        {showRomaji && !!card.romaji && (
          <Text style={[styles.romaji, { color: colors.textMuted }]}>{card.romaji}</Text>
        )}
        <Text style={[styles.word, { color: colors.primary }]}>{card.word}</Text>
        <Text style={[styles.meaning, { color: colors.textMuted }]}>{card.meaning ?? 'Arti belum tersedia'}</Text>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(300).delay(140)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        <View style={[styles.lyricBox, { backgroundColor: colors.tint }]}>
          <View style={styles.lyricLeft}>
            <LyricLine segments={card.line} furigana size={22} align="flex-start" />
          </View>
          <Text style={[styles.translation, { color: card.translation ? colors.text : colors.textMuted }]}>
            {card.translation ?? 'Terjemahan belum tersedia'}
          </Text>
        </View>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  pageDot: { width: 8, height: 8, borderRadius: 4 },
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
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sidePill: { width: 62, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  speed: { fontFamily: font.bold, fontSize: 14 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 4 },
  step: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  offset: { minWidth: 70, textAlign: 'center', fontFamily: font.bold, fontSize: 12 },
  playWrap: { flex: 1, alignItems: 'center' },
  play: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 26, borderWidth: 1, padding: 12 },
  wordCard: { alignItems: 'center', paddingVertical: 18 },
  reading: { fontFamily: font.bold, fontWeight: '700', fontSize: 20 },
  romaji: { fontFamily: font.medium, fontSize: 15 },
  word: { fontFamily: font.extrabold, fontWeight: '800', fontSize: 64, lineHeight: 80 },
  meaning: { fontFamily: font.regular, fontSize: 20 },
  lyricBox: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  lyricLeft: { alignItems: 'flex-start' },
  translation: { fontFamily: font.bold, fontSize: 14 },
});
