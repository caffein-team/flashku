import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { ActivityIndicator, Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DeckPickerSheet } from '@/components/songs/DeckPickerSheet';
import { SongCard } from '@/components/songs/SongCard';
import { SongMenuSheet, type SongMenuAction } from '@/components/songs/SongMenuSheet';
import { SongsHeader } from '@/components/songs/SongsHeader';
import { youtubeUrl, type Song } from '@/api/songs';
import { getErrorMessage } from '@/api/client';
import { useDeleteSongs, useEnrichSong, useSongsList } from '@/features/songs/queries';
import { notify } from '@/lib/notify';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Filter = 'all' | 'favorite';
type Sort = 'newest' | 'oldest' | 'title';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'favorite', label: 'Favorit' },
];

const SORTS: { key: Sort; label: string }[] = [
  { key: 'newest', label: 'Terbaru' },
  { key: 'oldest', label: 'Terlama' },
  { key: 'title', label: 'Judul A–Z' },
];

const AnimatedFlatList = Animated.FlatList<Song>;

export default function SongsScreen() {
  const { colors } = useTheme();
  const list = useSongsList();
  const songs = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const params = useLocalSearchParams<{ filter?: string; t?: string }>();
  const [filter, setFilter] = useState<Filter>(params.filter === 'favorite' ? 'favorite' : 'all');
  const [sort, setSort] = useState<Sort>('newest');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [deckTargets, setDeckTargets] = useState<string[]>([]);
  const deleteSongs = useDeleteSongs();
  const enrichSong = useEnrichSong();
  const selecting = selected !== null;

  // Beranda membuka tab ini dengan filter Favorit; `t` membuat tautan yang sama terbaca sebagai param baru.
  const paramKey = `${params.filter}:${params.t}`;
  const [seenKey, setSeenKey] = useState(paramKey);
  if (seenKey !== paramKey) {
    setSeenKey(paramKey);
    if (params.filter === 'favorite') setFilter('favorite');
  }

  const closeSearch = useCallback(() => {
    setSearching(false);
    setQuery('');
  }, []);

  // Tombol back Android menutup mode pilih atau pencarian lebih dulu.
  useEffect(() => {
    if (!searching && !selecting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selecting) setSelected(null);
      else closeSearch();
      return true;
    });
    return () => sub.remove();
  }, [searching, selecting, closeSearch]);

  const toggleSelected = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size === 0 ? null : next;
    });

  const confirmDelete = (ids: string[], title?: string) =>
    Alert.alert(
      ids.length > 1 ? `Hapus ${ids.length} lagu?` : 'Hapus lagu?',
      `${title ?? 'Lagu yang dipilih'} akan dikeluarkan dari perpustakaan dan semua deck-mu.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () =>
            deleteSongs.mutate(ids, {
              onSuccess: () => {
                setSelected(null);
                notify(ids.length > 1 ? `${ids.length} lagu dihapus` : 'Lagu dihapus');
              },
              onError: (e) => notify(getErrorMessage(e)),
            }),
        },
      ],
    );

  const onMenuAction = (action: SongMenuAction, song: Song) => {
    setMenuSong(null);
    if (action === 'multiselect') setSelected(new Set([song.id]));
    else if (action === 'deck') setDeckTargets([song.id]);
    // Android: dialog yang dibuka bersamaan dengan Modal yang baru ditutup bisa tidak tampil, jadi ditunda.
    else if (action === 'delete') setTimeout(() => confirmDelete([song.id], song.title), 300);
    else if (action === 'enrich') {
      if (enrichSong.isPending) {
        notify('Terjemahan AI masih diproses, tunggu sebentar.');
        return;
      }
      notify(`Menerjemahkan "${song.title}" dengan AI… ini bisa memakan waktu.`);
      enrichSong.mutate(song.id, {
        onSuccess: (message) => notify(message),
        onError: (e) => notify(getErrorMessage(e)),
      });
    } else if (action === 'rename') notify('Ganti nama lagu belum didukung server.');
    else
      void Clipboard.setStringAsync(youtubeUrl(song.youtubeId)).then(() => notify('Link YouTube disalin'));
  };

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = songs.filter(
      (s) =>
        (filter === 'all' || s.isFavorite) &&
        (!q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)),
    );
    return list.sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : sort === 'oldest'
          ? (a.addedAt ?? '').localeCompare(b.addedAt ?? '')
          : (b.addedAt ?? '').localeCompare(a.addedAt ?? ''),
    );
  }, [songs, filter, sort, query]);

  const scrollY = useSharedValue(0);
  const lastY = useSharedValue(0);
  const fabHidden = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    const dy = y - lastY.value;
    if (y <= 0 || dy < -6) fabHidden.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.cubic) });
    else if (dy > 6) fabHidden.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
    lastY.value = y;
    scrollY.value = y;
  });

  const fabStyle = useAnimatedStyle(() => ({
    opacity: 1 - fabHidden.value,
    transform: [{ translateY: fabHidden.value * 90 }, { scale: 1 - fabHidden.value * 0.2 }],
  }));

  const nextSort = () => setSort((s) => SORTS[(SORTS.findIndex((x) => x.key === s) + 1) % SORTS.length].key);
  const sortLabel = SORTS.find((s) => s.key === sort)!.label;

  const listHeader = (
    <View>
      <View style={styles.titleRow}>
        <Text style={[styles.heading, { color: colors.text }]}>Lagu kamu</Text>
        <Pressable onPress={nextSort} hitSlop={8} accessibilityLabel="Ubah urutan">
          <Text style={[styles.sort, { color: colors.textMuted }]}>Urut: {sortLabel}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                active
                  ? { backgroundColor: colors.primary, borderColor: colors.primary }
                  : { backgroundColor: colors.surface, borderColor: colors.inputBorder },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? colors.primaryText : colors.text }]}>{f.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <SongsHeader
        expanded={searching}
        onOpen={() => setSearching(true)}
        onClose={closeSearch}
        query={query}
        onChangeQuery={setQuery}
        scrollY={scrollY}
      />

      <AnimatedFlatList
        data={data}
        keyExtractor={(s) => s.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        onRefresh={() => void list.refetch()}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.primary} /> : undefined}
        itemLayoutAnimation={LinearTransition.duration(260)}
        ListHeaderComponent={listHeader}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <SongCard
            song={item}
            index={index}
            expanded={searching}
            playing={playingId === item.id}
            onTogglePlay={() => setPlayingId((cur) => (cur === item.id ? null : item.id))}
            onOpen={() => (selecting ? toggleSelected(item.id) : router.push(`/study/${item.id}` as Href))}
            onLongPress={() => !selecting && setMenuSong(item)}
            selectMode={selecting}
            selected={!!selected?.has(item.id)}
          />
        )}
        ListEmptyComponent={
          list.isPending ? (
            <View style={styles.empty}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : list.isError ? (
            <View style={styles.empty}>
              <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>{getErrorMessage(list.error)}</Text>
              <Pressable onPress={() => void list.refetch()} style={[styles.retry, { borderColor: colors.primary }]}>
                <Text style={[styles.retryText, { color: colors.primary }]}>Coba lagi</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                {query || filter !== 'all' ? 'Lagu tidak ditemukan' : 'Belum ada lagu. Tekan + untuk menambah.'}
              </Text>
            </View>
          )
        }
      />

      {selecting ? (
        <Animated.View entering={FadeInDown.duration(220)} style={[styles.selectBar, { backgroundColor: colors.surface }]}>
          <Pressable hitSlop={8} onPress={() => setSelected(null)} accessibilityLabel="Batal pilih">
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
          <Text style={[styles.selectCount, { color: colors.text }]}>{selected.size} dipilih</Text>
          <Pressable
            onPress={() => setDeckTargets([...selected])}
            style={[styles.selectBtn, { backgroundColor: colors.banner }]}
            accessibilityRole="button"
          >
            <Text style={[styles.selectBtnText, { color: colors.bannerText }]}>Ke deck</Text>
          </Pressable>
          <Pressable
            onPress={() => confirmDelete([...selected])}
            style={[styles.selectBtn, { backgroundColor: colors.dangerSoft }]}
            accessibilityRole="button"
          >
            <Text style={[styles.selectBtnText, { color: colors.danger }]}>Hapus</Text>
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.fab, fabStyle]}>
          <Pressable
            onPress={() => router.push('/add-song' as Href)}
            accessibilityRole="button"
            accessibilityLabel="Tambah lagu"
            style={({ pressed }) => [styles.fabBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.85 }]}
          >
            <Ionicons name="add" size={32} color="#fff" />
          </Pressable>
        </Animated.View>
      )}

      <SongMenuSheet song={menuSong} onClose={() => setMenuSong(null)} onAction={onMenuAction} />
      <DeckPickerSheet
        songIds={deckTargets}
        onClose={() => setDeckTargets([])}
        onDone={() => {
          setDeckTargets([]);
          setSelected(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120 },
  gap: { height: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontFamily: font.extrabold, fontSize: 20 },
  sort: { fontFamily: font.regular, fontSize: 13 },
  chips: { gap: 8, paddingTop: 14, paddingBottom: 16 },
  chip: { height: 34, paddingHorizontal: 16, borderRadius: 17, borderWidth: 1, justifyContent: 'center' },
  chipText: { fontFamily: font.bold, fontSize: 13 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60 },
  emptyText: { fontFamily: font.medium, fontSize: 14, textAlign: 'center' },
  footer: { paddingVertical: 16 },
  retry: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 8, marginTop: 4 },
  retryText: { fontFamily: font.bold, fontSize: 14 },
  fab: { position: 'absolute', right: 24, bottom: 24 },
  selectBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    boxShadow: '0 6px 20px rgba(40, 30, 120, 0.22)',
  },
  selectCount: { flex: 1, fontFamily: font.bold, fontSize: 15 },
  selectBtn: { height: 40, paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center' },
  selectBtnText: { fontFamily: font.bold, fontSize: 13 },
  fabBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 16px rgba(60, 50, 200, 0.35)',
  },
});
