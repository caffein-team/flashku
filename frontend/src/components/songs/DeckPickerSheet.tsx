import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getErrorMessage } from '@/api/client';
import { BottomSheet } from '@/components/settings/Sheets';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { useAddSongToDeck, useCreateDeck, useDecks } from '@/features/songs/queries';
import { notify } from '@/lib/notify';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

/** Pilih deck tujuan untuk satu atau beberapa lagu; deck baru bisa dibuat langsung dari sini. */
export function DeckPickerSheet({
  songIds,
  onClose,
  onDone,
}: {
  /** Kosong = sheet tertutup. */
  songIds: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const decks = useDecks();
  const createDeck = useCreateDeck();
  const addSong = useAddSongToDeck();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const busy = createDeck.isPending || addSong.isPending;

  const addAll = async (deckId: string, deckName: string) => {
    try {
      await Promise.all(songIds.map((songId) => addSong.mutateAsync({ deckId, songId })));
      notify(`${songIds.length > 1 ? `${songIds.length} lagu` : 'Lagu'} ditambahkan ke ${deckName}`);
      onDone();
    } catch (e) {
      notify(getErrorMessage(e));
    }
  };

  const createAndAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const deck = await createDeck.mutateAsync(trimmed);
      await addAll(deck.id, deck.name);
    } catch (e) {
      notify(getErrorMessage(e));
    }
  };

  return (
    <BottomSheet visible={songIds.length > 0} title="Tambah ke deck" onClose={onClose}>
      {decks.isPending ? (
        <ActivityIndicator color={colors.primary} style={styles.pad} />
      ) : decks.isError ? (
        <Text style={[styles.empty, { color: colors.danger }]}>{getErrorMessage(decks.error)}</Text>
      ) : (
        <ScrollView style={styles.list}>
          {decks.data.items.map((d) => (
            <Pressable
              key={d.id}
              disabled={busy}
              onPress={() => void addAll(d.id, d.name)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
            >
              <Ionicons name="albums-outline" size={22} color={colors.primary} />
              <View style={styles.flex}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {d.name}
                </Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>{d.totalSongs} lagu</Text>
              </View>
            </Pressable>
          ))}
          {decks.data.items.length === 0 && (
            <Text style={[styles.empty, { color: colors.textMuted }]}>Belum ada deck. Buat yang pertama di bawah.</Text>
          )}
        </ScrollView>
      )}

      {creating ? (
        <View style={styles.create}>
          <TextField label="Nama deck" value={name} onChangeText={setName} placeholder="Mis. Yorushika Deck" autoFocus />
          <Button title="Buat dan tambahkan" onPress={() => void createAndAdd()} loading={busy} disabled={!name.trim()} />
        </View>
      ) : (
        <Pressable onPress={() => setCreating(true)} accessibilityRole="button" style={styles.row}>
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={[styles.name, { color: colors.primary }]}>Deck baru</Text>
        </Pressable>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingVertical: 24 },
  list: { maxHeight: 260 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, borderRadius: 12, paddingHorizontal: 4 },
  name: { fontFamily: font.semibold, fontSize: 15 },
  meta: { fontFamily: font.regular, fontSize: 12.5 },
  empty: { fontFamily: font.regular, fontSize: 14, textAlign: 'center', paddingVertical: 16 },
  create: { gap: 12 },
});
