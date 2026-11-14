import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { getErrorMessage } from '@/api/client';
import type { Deck } from '@/api/decks';
import { PageHeader } from '@/components/PageHeader';
import { DeckThumb } from '@/components/songs/DeckThumb';
import { DeckMenuSheet, RenameDeckSheet, type DeckMenuAction } from '@/components/songs/DeckMenuSheet';
import { useDeckDetail, useDecks, useDeleteDeck, useRenameDeck } from '@/features/songs/queries';
import { notify } from '@/lib/notify';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export default function DeckScreen() {
  const { colors } = useTheme();
  const decks = useDecks();
  const renameDeck = useRenameDeck();
  const deleteDeck = useDeleteDeck();
  const [menuDeck, setMenuDeck] = useState<Deck | null>(null);
  const [renaming, setRenaming] = useState<Deck | null>(null);

  const confirmDelete = (deck: Deck) =>
    Alert.alert('Hapus deck?', `${deck.name} akan dihapus. Lagu di dalamnya tetap ada di perpustakaan.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () =>
          deleteDeck.mutate(deck.id, {
            onSuccess: () => notify('Deck dihapus'),
            onError: (e) => notify(getErrorMessage(e)),
          }),
      },
    ]);

  const onMenuAction = (action: DeckMenuAction, deck: Deck) => {
    setMenuDeck(null);
    if (action === 'rename') setRenaming(deck);
    // Android: dialog yang dibuka bersamaan dengan Modal yang baru ditutup bisa tidak tampil, jadi ditunda.
    else setTimeout(() => confirmDelete(deck), 300);
  };

  const empty = decks.isPending ? (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} />
    </View>
  ) : decks.isError ? (
    <View style={styles.empty}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>{getErrorMessage(decks.error)}</Text>
      <Pressable onPress={() => void decks.refetch()} style={[styles.retry, { borderColor: colors.primary }]}>
        <Text style={[styles.retryText, { color: colors.primary }]}>Coba lagi</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.empty}>
      <Ionicons name="albums-outline" size={40} color={colors.textMuted} />
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        Belum ada deck. Tekan-lama sebuah lagu di tab Lagu, lalu pilih Add to deck.
      </Text>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title="Deck" />
      <FlatList
        data={decks.data?.items ?? []}
        keyExtractor={(d) => d.id}
        refreshing={decks.isRefetching}
        onRefresh={() => void decks.refetch()}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListHeaderComponent={<Text style={[styles.heading, { color: colors.text }]}>Kumpulan Deck</Text>}
        ListEmptyComponent={empty}
        renderItem={({ item, index }) => <DeckRow deck={item} index={index} onLongPress={() => setMenuDeck(item)} />}
      />

      <DeckMenuSheet deck={menuDeck} onClose={() => setMenuDeck(null)} onAction={onMenuAction} />
      <RenameDeckSheet
        deck={renaming}
        busy={renameDeck.isPending}
        onClose={() => setRenaming(null)}
        onSubmit={(name) =>
          renaming &&
          renameDeck.mutate(
            { id: renaming.id, name },
            {
              onSuccess: () => {
                setRenaming(null);
                notify('Nama deck diganti');
              },
              onError: (e) => notify(getErrorMessage(e)),
            },
          )
        }
      />
    </View>
  );
}

function DeckRow({ deck, index, onLongPress }: { deck: Deck; index: number; onLongPress: () => void }) {
  const { colors } = useTheme();
  const canStudy = deck.totalSongs > 0;
  // Gambar lagu tidak ada di daftar deck; diambil dari detail deck (cache yang sama dengan halaman isi deck).
  const detail = useDeckDetail(canStudy ? deck.id : undefined);

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(300)}>
      <Pressable
        onPress={() => router.push(`/deck/${deck.id}` as Href)}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`Buka deck ${deck.name}`}
        style={[styles.card, { backgroundColor: colors.surface }]}
      >
        <DeckThumb songs={detail.data?.songs ?? []} />
        <View style={styles.info}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {deck.name}
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {deck.totalSongs} lagu{deck.description ? ` · ${deck.description}` : ''}
          </Text>
        </View>
        <Pressable
          disabled={!canStudy}
          onPress={() => router.push(`/study/${deck.id}?scope=deck` as Href)}
          accessibilityRole="button"
          accessibilityLabel={`Pelajari deck ${deck.name}`}
          style={[styles.play, { backgroundColor: colors.primary }, !canStudy && { opacity: 0.4 }]}
        >
          <Ionicons name="play-outline" size={22} color="#fff" />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 20, paddingBottom: 32 },
  heading: { fontFamily: font.extrabold, fontSize: 18, marginBottom: 14 },
  gap: { height: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 20,
    boxShadow: '0 2px 10px rgba(60, 50, 140, 0.08)',
  },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: font.bold, fontWeight: '700', fontSize: 16 },
  meta: { fontFamily: font.regular, fontSize: 13 },
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingTop: 60, paddingHorizontal: 24 },
  emptyText: { fontFamily: font.medium, fontSize: 14, textAlign: 'center' },
  retry: { borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 8, marginTop: 4 },
  retryText: { fontFamily: font.bold, fontSize: 14 },
});
