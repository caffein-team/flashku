import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import type { Song } from '@/api/songs';
import { youtubeThumbnail } from '@/features/songs/thumbnail';
import { useTheme } from '@/theme/ThemeProvider';

const GAP = 2;

/**
 * Thumbnail deck dari gambar lagunya: 1 lagu = satu gambar, 2 atau 3 lagu = 1 baris 2 kolom,
 * 4 lagu atau lebih = 2 baris 2 kolom. Tanpa lagu: ikon.
 */
export function DeckThumb({ songs, size = 64 }: { songs: Song[]; size?: number }) {
  const { colors } = useTheme();
  const shown = songs.length >= 4 ? songs.slice(0, 4) : songs.length >= 2 ? songs.slice(0, 2) : songs.slice(0, 1);
  const grid = shown.length === 4;

  return (
    <View style={[styles.box, { width: size, height: size, backgroundColor: colors.banner }]}>
      {shown.length === 0 ? (
        <Ionicons name="albums-outline" size={26} color={colors.link} />
      ) : (
        <View style={[styles.grid, grid && styles.wrap]}>
          {shown.map((s) => (
            <Image
              key={s.id}
              source={{ uri: s.thumbnail ?? youtubeThumbnail(s.youtubeId) }}
              contentFit="cover"
              style={{
                // Lebar dan tinggi tiap petak dihitung dari jumlah kolom dan baris, dengan celah GAP.
                width: shown.length === 1 ? size : (size - GAP) / 2,
                height: shown.length === 1 || shown.length === 2 ? size : (size - GAP) / 2,
              }}
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', gap: GAP },
  wrap: { flexWrap: 'wrap', alignContent: 'flex-start', width: '100%', height: '100%' },
});
