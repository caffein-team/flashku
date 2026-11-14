import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Song } from '@/api/songs';
import { BottomSheet } from '@/components/settings/Sheets';
import { youtubeThumbnail } from '@/features/songs/thumbnail';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export type SongMenuAction = 'multiselect' | 'deck' | 'link' | 'enrich' | 'rename' | 'delete';

const ITEMS: { action: SongMenuAction; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { action: 'multiselect', label: 'Multi select', icon: 'checkbox-outline' },
  { action: 'deck', label: 'Add to deck', icon: 'folder-open-outline' },
  { action: 'link', label: 'Copy original link', icon: 'link-outline' },
  { action: 'enrich', label: 'Ulangi terjemahan AI', icon: 'language-outline' },
  { action: 'rename', label: 'Rename', icon: 'pencil-outline' },
];

export function SongMenuSheet({
  song,
  onClose,
  onAction,
}: {
  song: Song | null;
  onClose: () => void;
  onAction: (action: SongMenuAction, song: Song) => void;
}) {
  const { colors } = useTheme();

  const row = (action: SongMenuAction, label: string, icon: keyof typeof Ionicons.glyphMap, color: string) => (
    <Pressable
      key={action}
      accessibilityRole="button"
      onPress={() => song && onAction(action, song)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.label, { color: action === 'delete' ? colors.danger : colors.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={!!song} onClose={onClose}>
      {song && (
        <>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={[styles.thumb, { backgroundColor: colors.banner }]}>
              <Ionicons name="musical-notes-outline" size={24} color={colors.link} />
              <Image
                source={{ uri: song.thumbnail ?? youtubeThumbnail(song.youtubeId) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {song.title}
              </Text>
              <Text style={[styles.artist, { color: colors.textMuted }]} numberOfLines={1}>
                {song.artist}
              </Text>
            </View>
          </View>
          {ITEMS.map((i) => row(i.action, i.label, i.icon, colors.primary))}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {row('delete', 'Delete', 'trash-outline', colors.danger)}
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  thumb: { width: 52, height: 52, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.bold, fontWeight: '700', fontSize: 16 },
  artist: { fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, height: 52, borderRadius: 12, paddingHorizontal: 4 },
  label: { fontFamily: font.medium, fontSize: 16 },
  divider: { height: StyleSheet.hairlineWidth },
});
