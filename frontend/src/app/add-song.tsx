import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import axios from 'axios';

import { getErrorMessage } from '@/api/client';
import { songsApi } from '@/api/songs';
import { Button } from '@/components/Button';
import { addSongToCache, songsKey, useSongsList } from '@/features/songs/queries';
import { youtubeThumbnail } from '@/features/songs/thumbnail';
import { fetchYouTubeInfo, parseYouTubeId } from '@/features/songs/youtube';
import { goBack } from '@/lib/navigation';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

const STEPS = ['Tempel link YouTube', 'AI memilih kosakata dari lirik', 'Belajar lewat flashcard'];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gateway (mis. Cloudflare 524 setelah ~100 dtk) memutus request padahal server masih bekerja. */
function isCutOff(e: unknown): boolean {
  if (!axios.isAxiosError(e)) return false;
  const status = e.response?.status;
  return !e.response || e.code === 'ECONNABORTED' || (!!status && [502, 504, 524].includes(status));
}

/** Request import bisa dipotong gateway sementara server tetap menyelesaikannya: tunggu lagunya muncul (±3 menit). */
async function importWithRecovery(url: string, youtubeId: string | null, onWaiting: () => void) {
  try {
    return await songsApi.import(url);
  } catch (e) {
    if (!isCutOff(e) || !youtubeId) throw e;
    onWaiting();
    for (let i = 0; i < 36; i++) {
      await sleep(5000);
      try {
        const { items } = await songsApi.list(100, 0);
        const song = items.find((s) => s.youtubeId === youtubeId);
        if (song) return { song, message: 'Lagu berhasil diimpor.' };
      } catch {}
    }
    throw e;
  }
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AddSongScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const library = useSongsList();
  const [phase, setPhase] = useState<'idle' | 'import' | 'wait' | 'enrich'>('idle');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [url, setUrl] = useState('');
  const [focused, setFocused] = useState(false);
  const debounced = useDebounced(url.trim(), 450);

  const typed = url.trim().length > 0;
  const videoId = parseYouTubeId(debounced);
  const invalid = typed && debounced === url.trim() && !videoId;
  const duplicate = !!videoId && !!library.data?.pages.some((p) => p.items.some((s) => s.youtubeId === videoId));

  const info = useQuery({
    queryKey: ['youtube-info', videoId],
    queryFn: () => fetchYouTubeInfo(debounced),
    enabled: !!videoId,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const checking = typed && (debounced !== url.trim() || (!!videoId && info.isFetching));
  const found = !!videoId && !!info.data && debounced === url.trim();
  const canSave = found && !duplicate;

  const save = useMutation({
    mutationFn: async () => {
      setPhase('import');
      const { song, message } = await importWithRecovery(url.trim(), videoId, () => setPhase('wait'));
      let enrichNote: string | undefined;
      if (song.lyricsStatus !== 'not_found') {
        setPhase('enrich');
        try {
          await songsApi.enrich(song.id);
        } catch {
          enrichNote = 'Terjemahan AI belum berhasil dibuat, jadi arti kata mungkin masih kosong.';
        }
      }
      return { song, message, enrichNote };
    },
    onSuccess: ({ song, message, enrichNote }) => {
      addSongToCache(qc, song);
      if (mounted.current) goBack('/songs');
      Alert.alert('Lagu ditambahkan', [message, enrichNote].filter(Boolean).join('\n\n'));
    },
    onError: (e) => Alert.alert('Gagal menambah lagu', getErrorMessage(e)),
    // Server bisa menyimpan lagu walau responsnya gagal, jadi daftar selalu dimuat ulang.
    onSettled: () => {
      setPhase('idle');
      void qc.invalidateQueries({ queryKey: songsKey });
    },
  });

  let status: { icon: keyof typeof Ionicons.glyphMap; color: string; text: string } | null = null;
  if (typed) {
    if (checking) status = { icon: 'time-outline', color: colors.textMuted, text: 'Memeriksa link...' };
    else if (invalid) status = { icon: 'close-circle-outline', color: colors.danger, text: 'Link YouTube tidak valid' };
    else if (videoId && info.isError) status = { icon: 'close-circle-outline', color: colors.danger, text: 'Lagu tidak ditemukan' };
    else if (duplicate) status = { icon: 'alert-circle-outline', color: colors.danger, text: 'Lagu ini sudah ada di daftarmu' };
    else if (found) status = { icon: 'checkmark', color: colors.link, text: 'Link valid, lagu ditemukan' };
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable hitSlop={12} onPress={() => goBack('/songs')} accessibilityRole="button" accessibilityLabel="Kembali">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.text }]}>Tambah Lagu</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.text }]}>Link YouTube</Text>
        <View
          style={[
            styles.field,
            {
              backgroundColor: colors.surface,
              borderColor: focused ? colors.primary : status?.color === colors.danger ? colors.danger : colors.inputBorder,
            },
          ]}
        >
          <Ionicons name="link-outline" size={22} color={colors.textMuted} />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://www.youtube.com/watch?v=..."
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[styles.input, { color: colors.text }]}
          />
          {typed && (
            <Pressable hitSlop={8} onPress={() => setUrl('')} accessibilityLabel="Hapus link">
              <Ionicons name="close-circle" size={18} color={colors.placeholder} />
            </Pressable>
          )}
        </View>

        {status && (
          <Animated.View key={status.text} entering={FadeIn.duration(200)} style={styles.status}>
            <Ionicons name={status.icon} size={16} color={status.color} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
          </Animated.View>
        )}

        {found && info.data && (
          <Animated.View
            entering={FadeInDown.duration(300)}
            exiting={FadeOut.duration(150)}
            layout={LinearTransition}
            style={[styles.preview, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
          >
            <View style={[styles.thumb, { backgroundColor: colors.banner }]}>
              <Ionicons name="musical-notes-outline" size={30} color={colors.link} />
              {!!videoId && (
                <Image source={{ uri: youtubeThumbnail(videoId) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              )}
            </View>
            <View style={styles.flex}>
              <Text style={[styles.previewTitle, { color: colors.text }]} numberOfLines={2}>
                {info.data.title}
              </Text>
              {!!info.data.author && (
                <Text style={[styles.previewArtist, { color: colors.textMuted }]} numberOfLines={1}>
                  {info.data.author}
                </Text>
              )}
            </View>
          </Animated.View>
        )}

        <Animated.View layout={LinearTransition}>
          <Text style={[styles.label, styles.how, { color: colors.text }]}>Cara kerjanya</Text>
          {STEPS.map((text, i) => (
            <View key={text} style={styles.step}>
              <View style={[styles.stepNo, { backgroundColor: colors.banner }]}>
                <Text style={[styles.stepNoText, { color: colors.bannerText }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.text }]}>{text}</Text>
            </View>
          ))}
        </Animated.View>
      </ScrollView>

      {phase !== 'idle' && (
        <View style={styles.progress}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={[styles.progressText, { color: colors.textMuted }]}>
            {phase === 'import'
              ? 'Mengunduh audio dan mengambil lirik… ini bisa memakan waktu 1–2 menit.'
              : phase === 'wait'
                ? 'Server masih memproses lagu. Menunggu sampai selesai…'
                : 'AI menerjemahkan lirik dan arti kata…'}
          </Text>
        </View>
      )}

      <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
        <Button title="Kembali" variant="outline" onPress={() => goBack('/songs')} style={styles.actionBtn} />
        <Button
          title="Simpan"
          onPress={() => save.mutate()}
          disabled={!canSave}
          loading={save.isPending}
          style={styles.actionBtn}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  topTitle: { fontFamily: font.extrabold, fontSize: 20 },
  content: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },
  label: { fontFamily: font.bold, fontSize: 14, marginBottom: 8 },
  field: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15, height: '100%' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  statusText: { fontFamily: font.medium, fontSize: 13 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 20, borderWidth: 1, marginTop: 16 },
  thumb: { width: 100, height: 76, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  previewTitle: { fontFamily: font.bold, fontSize: 15.5 },
  previewArtist: { fontFamily: font.regular, fontSize: 13.5, marginTop: 2 },
  how: { marginTop: 28, marginBottom: 14 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  stepNo: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { fontFamily: font.bold, fontSize: 14 },
  stepText: { fontFamily: font.regular, fontSize: 15 },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingTop: 8 },
  progressText: { flex: 1, fontFamily: font.regular, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12 },
  actionBtn: { flex: 1 },
});
