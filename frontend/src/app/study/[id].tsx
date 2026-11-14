import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useLocalSearchParams, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { songsApi, type SongDetail } from '@/api/songs';
import { studyApi, type Rating, type SessionContinuation } from '@/api/study';
import { Button } from '@/components/Button';
import { AnswerView } from '@/components/study/AnswerView';
import { QuestionView } from '@/components/study/QuestionView';
import { StudyHeader } from '@/components/study/StudyHeader';
import { songKey, useDecks, useSongDetail, useToggleFavorite } from '@/features/songs/queries';
import { progressFromReview, progressKey } from '@/features/stats/progress';
import { buildCards } from '@/features/study/cards';
import { setLastStudiedSong } from '@/features/study/lastStudied';
import { goBack } from '@/lib/navigation';
import { notify } from '@/lib/notify';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export default function StudyScreen() {
  const { id, scope } = useLocalSearchParams<{ id: string; scope?: string }>();
  const isDeck = scope === 'deck';
  const isAll = scope === 'all';
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const songQuery = useSongDetail(isDeck || isAll ? undefined : id);
  const decks = useDecks();
  const deck = isDeck ? decks.data?.items.find((d) => d.id === id) : undefined;
  const toggleFavorite = useToggleFavorite();
  const { user, updateUser } = useAuth();
  const qc = useQueryClient();

  // POST membuat catatan sesi di server, jadi hasilnya tidak di-cache.
  const sessionKey = ['study-session', scope ?? 'song', id];
  const fetchSession = (more?: SessionContinuation) =>
    studyApi.startSession(isAll ? { all: true } : isDeck ? { deckId: id! } : { songId: id! }, more);
  const sessionQuery = useQuery({
    queryKey: sessionKey,
    queryFn: () => fetchSession(),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const songIds = useMemo(
    () => [...new Set((sessionQuery.data?.cards ?? []).map((c) => String(c.song_id)))],
    [sessionQuery.data],
  );
  const combineDetails = useCallback(
    (results: UseQueryResult<SongDetail>[]) => ({
      byId: new Map(results.flatMap((r) => (r.data ? [[r.data.id, r.data] as const] : []))),
      pending: results.some((r) => r.isPending),
      error: results.find((r) => r.error)?.error,
    }),
    [],
  );
  const details = useQueries({
    queries: songIds.map((songId) => ({ queryKey: songKey(songId), queryFn: () => songsApi.detail(songId) })),
    combine: combineDetails,
  });

  const cards = useMemo(
    () => (sessionQuery.data ? buildCards(sessionQuery.data.cards, details.byId) : []),
    [sessionQuery.data, details.byId],
  );

  useEffect(() => {
    if (!isDeck && !isAll && id) void setLastStudiedSong(id);
  }, [isDeck, isAll, id]);

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const reviewWarned = useRef(false);
  const [totalXp, setTotalXp] = useState(0);
  const [answered, setAnswered] = useState(0);
  // Kartu yang sudah muncul di layar ini; dikirim ke server saat meminta kartu berikutnya.
  const seenPhrases = useRef(new Set<string>());
  const recentRows = useRef<string[]>([]);
  const [advancing, setAdvancing] = useState(false);
  const [pulse, setPulse] = useState<{ xp: number; level?: number } | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Geseran dikirim berurutan: tiap permintaan menghitung selisihnya dari nilai server terbaru.
  const offsetQueue = useRef<Promise<unknown>>(Promise.resolve());

  const loading =
    (!isDeck && !isAll && songQuery.isPending) || sessionQuery.isPending || details.pending || advancing;
  const error = songQuery.error ?? sessionQuery.error ?? details.error;
  const empty = !loading && !error && cards.length === 0 && answered === 0;
  const finished = !loading && !error && answered > 0 && index >= cards.length;
  const card = cards[index];
  const song = songQuery.data;
  const cardSong = card && details.byId.get(card.songId);
  const clip = card?.clip;
  const cardOffset = cardSong?.lyricsOffset ?? 0;

  const cardSongId = card?.songId;
  /** Simpan total geseran baru ke server (PATCH berupa selisih); waktu baris di cache ikut diperbarui. */
  const changeOffset = (total: number) => {
    if (!cardSongId) return Promise.resolve();
    const songId = cardSongId;
    const run = async () => {
      const current = qc.getQueryData<SongDetail>(songKey(songId))?.lyricsOffset ?? 0;
      const delta = Math.round((total - current) * 100) / 100;
      if (delta === 0) return;
      qc.setQueryData(songKey(songId), await songsApi.shiftOffset(songId, delta));
    };
    const result = offsetQueue.current.then(run, run);
    offsetQueue.current = result.catch(() => undefined);
    return result.catch((e: unknown) => {
      notify(getErrorMessage(e));
      throw e;
    });
  };

  const review = useMutation({
    // Urutan kartu berikutnya selalu diambil ulang dari /study/session setelah penilaian tersimpan.
    mutationFn: async (input: { phraseId: string; rating: Rating }) => {
      const res = await studyApi.review({ sessionId: sessionQuery.data!.sessionId, ...input });
      const next = await fetchSession({
        sessionId: sessionQuery.data!.sessionId,
        excludePhraseIds: [...seenPhrases.current],
        excludeRowIds: recentRows.current,
      }).catch(() => null);
      return { res, next };
    },
    onSuccess: ({ res, next }) => {
      if (next) {
        qc.setQueryData(sessionKey, next);
        setIndex(0);
      } else {
        setIndex((i) => i + 1);
      }
      const progress = progressFromReview(res);
      if (progress) qc.setQueryData(progressKey, progress);
      setTotalXp((n) => n + res.xp_earned);
      setPulse({ xp: res.xp_earned, level: res.user_level > (user?.level ?? 1) ? res.user_level : undefined });
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulse(null), 1400);
      updateUser({ level: res.user_level });
    },
    onError: (e) => {
      // Satu peringatan per sesi; kartu tetap lanjut supaya belajar tidak terhenti.
      setIndex((i) => i + 1);
      if (reviewWarned.current) return;
      reviewWarned.current = true;
      Alert.alert('Penilaian belum tersimpan', getErrorMessage(e));
    },
    onSettled: () => setAdvancing(false),
  });

  const answer = (rating: Rating) => {
    if (!card) return;
    seenPhrases.current.add(card.id);
    recentRows.current = [...recentRows.current, card.rowId].slice(-5);
    setAdvancing(true);
    setAnswered((n) => n + 1);
    setRevealed(false);
    review.mutate({ phraseId: card.id, rating });
  };

  const close = () => goBack((isDeck ? '/deck' : isAll ? '/' : '/songs') as Href);

  let emptyMessage = 'Tidak ada kartu yang perlu dipelajari sekarang. Kembali lagi nanti.';
  if (!isDeck && !isAll && song?.lyricsStatus === 'not_found') {
    emptyMessage = 'Lirik lagu ini belum ditemukan, jadi kartu belum bisa dibuat.';
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <StudyHeader
        title={isAll ? 'Semua lagu' : isDeck ? (deck?.name ?? 'Deck') : (song?.title ?? 'Lagu')}
        artist={isAll ? 'Kartu jatuh tempo' : isDeck ? (deck ? `${deck.totalSongs} lagu` : '') : (song?.artist ?? '')}
        onClose={close}
        liked={!!cardSong?.isFavorite}
        onToggleLike={card ? () => toggleFavorite.mutate(card.songId) : undefined}
      />

      <View style={[styles.flex, styles.body]}>
        {pulse && (
          <Animated.View
            entering={FadeInDown.duration(200)}
            exiting={FadeOut.duration(250)}
            style={[styles.xp, { backgroundColor: colors.primary }]}
            pointerEvents="none"
          >
            <Text style={[styles.xpText, { color: colors.primaryText }]}>
              +{pulse.xp} XP{pulse.level ? ` · naik ke level ${pulse.level}` : ''}
            </Text>
          </Animated.View>
        )}
        {loading ? (
          <View style={styles.done}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.doneText, { color: colors.textMuted }]}>Menyiapkan kartu…</Text>
          </View>
        ) : error ? (
          <Message
            icon="cloud-offline-outline"
            title="Gagal memuat kartu"
            text={getErrorMessage(error)}
            tint={colors.dangerSoft}
            iconColor={colors.danger}
          />
        ) : empty ? (
          <Message icon="albums-outline" title="Belum ada kartu" text={emptyMessage} tint={colors.banner} iconColor={colors.primary} />
        ) : finished ? (
          <Message
            icon="checkmark"
            title="Sesi selesai"
            text={`Kamu sudah melewati ${answered} kartu${isAll ? '' : isDeck ? ' dari deck ini' : ' dari lagu ini'} dan mendapat ${totalXp} XP.`}
            tint={colors.successSoft}
            iconColor={colors.success}
          />
        ) : (
          <Animated.View
            key={card.id}
            entering={SlideInRight.duration(280)}
            exiting={SlideOutLeft.duration(200)}
            style={styles.flex}
          >
            {revealed ? (
              <Animated.View key="answer" entering={FadeIn.duration(220)} style={styles.flex}>
                <AnswerView
                  card={card}
                  clip={clip}
                  videoId={card.youtubeId}
                  offset={cardOffset}
                  onOffsetChange={changeOffset}
                />
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
        {error ? (
          <Button
            title="Coba lagi"
            onPress={() => {
              void songQuery.refetch();
              void sessionQuery.refetch();
              void qc.invalidateQueries({ queryKey: ['song'] });
            }}
          />
        ) : loading || empty || finished ? (
          <Button title="Kembali ke daftar lagu" onPress={close} />
        ) : revealed ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.rate}>
            <RateButton label="Sulit" bg={colors.dangerSoft} fg={colors.danger} onPress={() => answer('again')} />
            <RateButton label="Mudah" bg={colors.successSoft} fg={colors.success} onPress={() => answer('good')} />
          </Animated.View>
        ) : (
          <Button title="Lihat Jawaban" onPress={() => setRevealed(true)} />
        )}
      </View>
    </View>
  );
}

function Message({
  icon,
  title,
  text,
  tint,
  iconColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: ReactNode;
  tint: string;
  iconColor: string;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.done}>
      <View style={[styles.doneIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={40} color={iconColor} />
      </View>
      <Text style={[styles.doneTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.doneText, { color: colors.textMuted }]}>{text}</Text>
    </Animated.View>
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
  xp: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    zIndex: 5,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    boxShadow: '0 4px 14px rgba(40, 30, 120, 0.25)',
  },
  xpText: { fontFamily: font.bold, fontSize: 14 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  doneIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: font.extrabold, fontSize: 24 },
  doneText: { fontFamily: font.regular, fontSize: 15, textAlign: 'center' },
});
