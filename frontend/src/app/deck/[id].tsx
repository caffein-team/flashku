import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/PageHeader';
import { SongCard } from '@/components/songs/SongCard';
import { useDeckDetail, useRemoveSongFromDeck } from '@/features/songs/queries';
import { goBack } from '@/lib/navigation';
import { notify } from '@/lib/notify';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

/** Daftar lagu di dalam satu deck; ketuk lagu untuk mempelajarinya. */
export default function DeckSongsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const detail = useDeckDetail(id);
  const songs = detail.data?.songs ?? [];
  const removeSong = useRemoveSongFromDeck(id);

  const confirmRemove = (songId: string, title: string) =>
    Alert.alert('Keluarkan dari deck?', `${title} akan dikeluarkan dari deck ini. Lagunya tetap ada di perpustakaan.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluarkan',
        style: 'destructive',
        onPress: () =>
          removeSong.mutate(songId, {
            onSuccess: () => notify('Lagu dikeluarkan dari deck'),
            onError: (e) => notify(getErrorMessage(e)),
          }),
      },
    ]);

  const empty = detail.isPending ? (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : detail.isError ? (
    <View style={styles.empty}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>{getErrorMessage(detail.error)}</Text>
      <Pressable onPress={() => void detail.refetch()} style={[styles.retry, { borderColor: colors.primary }]}>
        <Text style={[styles.retryText, { color: colors.primary }]}>Coba lagi</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.empty}>
      <Ionicons name="musical-notes-outline" size={40} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        Deck ini belum berisi lagu. Tekan-lama sebuah lagu di tab Lagu, lalu pilih Add to deck.
      </Text>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title={detail.data?.deck.name ?? 'Deck'} onBack={() => goBack('/deck' as Href)} />
      <FlatList
        data={songs}
        keyExtractor={(s) => s.id}
        refreshing={detail.isRefetching}
        onRefresh={() => void detail.refetch()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => (
          <SongCard
            song={item}
            index={index}
            expanded={false}
            playing={false}
            onTogglePlay={() => {}}
            onOpen={() => router.push(`/study/${item.id}` as Href)}
            onRemove={() => confirmRemove(item.id, item.title)}
            removeLabel={`Keluarkan ${item.title} dari deck`}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 20, paddingBottom: 32 },
  gap: { height: 12 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 24 },
  emptyText: { fontFamily: font.medium, fontSize: 14, textAlign: 'center' },
  retry: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 8, marginTop: 4 },
  retryText: { fontFamily: font.bold, fontSize: 14 },
});
