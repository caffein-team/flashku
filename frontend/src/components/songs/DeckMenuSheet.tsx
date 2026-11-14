import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Deck } from '@/api/decks';
import { Button } from '@/components/Button';
import { BottomSheet } from '@/components/settings/Sheets';
import { TextField } from '@/components/TextField';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export type DeckMenuAction = 'rename' | 'delete';

/** Menu tekan-lama sebuah deck: ganti nama dan hapus. */
export function DeckMenuSheet({
  deck,
  onClose,
  onAction,
}: {
  deck: Deck | null;
  onClose: () => void;
  onAction: (action: DeckMenuAction, deck: Deck) => void;
}) {
  const { colors } = useTheme();

  const row = (action: DeckMenuAction, label: string, icon: keyof typeof Ionicons.glyphMap, color: string) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => deck && onAction(action, deck)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.label, { color: action === 'delete' ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={!!deck} onClose={onClose}>
      {deck && (
        <>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={[styles.thumb, { backgroundColor: colors.banner }]}>
              <Ionicons name="albums-outline" size={24} color={colors.link} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {deck.name}
              </Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{deck.totalSongs} lagu</Text>
            </View>
          </View>
          {row('rename', 'Rename', 'pencil-outline', colors.primary)}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {row('delete', 'Delete', 'trash-outline', colors.danger)}
        </>
      )}
    </BottomSheet>
  );
}

/** Sheet ganti nama deck; kolom diisi nama saat ini. `deck` null = tertutup. */
export function RenameDeckSheet({
  deck,
  busy,
  onClose,
  onSubmit,
}: {
  deck: Deck | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  return (
    <BottomSheet visible={!!deck} title="Ganti nama deck" onClose={onClose}>
      {/* `key` membuat isian awal selalu nama deck yang dipilih. */}
      {deck && <RenameForm key={deck.id} initial={deck.name} busy={busy} onSubmit={onSubmit} />}
    </BottomSheet>
  );
}

function RenameForm({ initial, busy, onSubmit }: { initial: string; busy: boolean; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <View style={styles.form}>
      <TextField label="Nama deck" value={name} onChangeText={setName} autoFocus />
      <Button
        title="Simpan"
        loading={busy}
        disabled={!trimmed || trimmed === initial}
        onPress={() => onSubmit(trimmed)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.bold, fontWeight: '700', fontSize: 16 },
  meta: { fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, height: 52, borderRadius: 12, paddingHorizontal: 4 },
  label: { fontFamily: font.medium, fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth },
  form: { gap: 12 },
});
