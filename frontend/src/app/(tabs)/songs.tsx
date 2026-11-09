import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  LinearTransition,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { SongCard } from '@/components/songs/SongCard';
import { SongsHeader } from '@/components/songs/SongsHeader';
import { songStatus, useSongs, type Song, type SongStatus } from '@/features/songs/SongsProvider';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Filter = 'all' | SongStatus;
type Sort = 'newest' | 'oldest' | 'title';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Semua' },
  { key: 'new', label: 'Baru' },
  { key: 'learning', label: 'Dipelajari' },
  { key: 'done', label: 'Selesai' },
];

const SORTS: { key: Sort; label: string }[] = [
  { key: 'newest', label: 'Terbaru' },
  { key: 'oldest', label: 'Terlama' },
  { key: 'title', label: 'Judul A–Z' },
];

const AnimatedFlatList = Animated.FlatList<Song>;

export default function SongsScreen() {
  const { colors } = useTheme();
  const { songs } = useSongs();

  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);

  const closeSearch = useCallback(() => {
    setSearching(false);
    setQuery('');
  }, []);

  // Tombol back Android menutup mode pencarian dulu.
  useEffect(() => {
    if (!searching) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      return true;
    });
    return () => sub.remove();
  }, [searching, closeSearch]);

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = songs.filter(
      (s) =>
        (filter === 'all' || songStatus(s) === filter) &&
        (!q || s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)),
    );
    return list.sort((a, b) =>
      sort === 'title' ? a.title.localeCompare(b.title) : sort === 'oldest' ? a.addedAt - b.addedAt : b.addedAt - a.addedAt,
    );
  }, [songs, filter, sort, query]);

  // Scroll: header memadat, FAB menyingkir saat scroll turun dan muncul lagi saat naik.
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
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="musical-notes-outline" size={40} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              {query || filter !== 'all' ? 'Lagu tidak ditemukan' : 'Belum ada lagu. Tekan + untuk menambah.'}
            </Text>
          </View>
        }
      />

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
  fab: { position: 'absolute', right: 24, bottom: 24 },
  fabBtn: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 16px rgba(60, 50, 200, 0.35)',
  },
});
