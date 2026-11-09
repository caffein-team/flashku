import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ComponentRef } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  clamp,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { headerColor } from '@/theme/colors';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type Props = {
  expanded: boolean;
  onOpen: () => void;
  onClose: () => void;
  query: string;
  onChangeQuery: (q: string) => void;
  /** Offset scroll list, untuk efek header yang memadat. */
  scrollY: SharedValue<number>;
};

const BAR = 46;
const SIDE = 24;

/**
 * Header ungu: judul "FlashKu" + tombol search. Saat tombol ditekan, tombol melebar
 * menjadi kolom pencarian dan judul memudar (satu nilai progress 0→1 mengatur semuanya).
 */
export function SongsHeader({ expanded, onOpen, onClose, query, onChangeQuery, scrollY }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(expanded ? 1 : 0, { duration: 320, easing: Easing.out(Easing.cubic) });
    if (expanded) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
    inputRef.current?.blur();
  }, [expanded, p]);

  const maxWidth = width - SIDE * 2;

  const containerStyle = useAnimatedStyle(() => {
    const compact = clamp(scrollY.value, 0, 40) / 40; // memadat saat scroll
    return {
      paddingBottom: interpolate(p.value, [0, 1], [22, 32]) - compact * 8,
      boxShadow: `0 ${4 * compact}px ${14 * compact}px rgba(30, 20, 120, ${0.3 * compact})`,
    };
  });

  const titleStyle = useAnimatedStyle(() => ({
    opacity: clamp(1 - p.value * 1.8, 0, 1),
    transform: [{ translateX: -16 * p.value }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: interpolate(p.value, [0, 1], [BAR, maxWidth]),
    backgroundColor: interpolateColor(p.value, [0, 1], ['rgba(255,255,255,0.22)', 'rgba(255,255,255,1)']),
  }));

  const inputWrapStyle = useAnimatedStyle(() => ({
    opacity: clamp((p.value - 0.4) / 0.6, 0, 1),
  }));

  return (
    <Animated.View style={[styles.header, { paddingTop: insets.top + 16 }, containerStyle]}>
      <View style={styles.row}>
        <Animated.Text style={[styles.title, titleStyle]} numberOfLines={1}>
          FlashKu
        </Animated.Text>

        <Animated.View style={[styles.bar, barStyle]}>
          <Pressable
            style={styles.searchSlot}
            onPress={expanded ? undefined : onOpen}
            accessibilityRole="button"
            accessibilityLabel="Cari lagu"
            hitSlop={6}
          >
            <Ionicons name="search-outline" size={22} color={expanded ? colors.textMuted : '#fff'} />
          </Pressable>

          <Animated.View style={[styles.inputWrap, inputWrapStyle]} pointerEvents={expanded ? 'auto' : 'none'}>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={onChangeQuery}
              placeholder="Cari lagu, artis, atau kosakata..."
              placeholderTextColor={colors.placeholder}
              returnKeyType="search"
              autoCorrect={false}
              style={[styles.input, { color: '#111' }]}
              onBlur={() => {
                if (!query) onClose();
              }}
            />
            {!!query && (
              <Pressable hitSlop={8} onPress={() => onChangeQuery('')} accessibilityLabel="Hapus pencarian">
                <Ionicons name="close-circle" size={18} color={colors.placeholder} />
              </Pressable>
            )}
            <Pressable
              style={styles.filterBtn}
              onPress={() => Alert.alert('Segera hadir', 'Filter lanjutan belum tersedia.')}
              accessibilityLabel="Filter"
            >
              <Ionicons name="options-outline" size={20} color={headerColor} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: headerColor,
    paddingHorizontal: SIDE,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    zIndex: 2,
  },
  row: { height: BAR, justifyContent: 'center' },
  title: { position: 'absolute', left: 0, fontFamily: font.extrabold, fontSize: 28, color: '#fff' },
  bar: {
    position: 'absolute',
    right: 0,
    height: BAR,
    borderRadius: BAR / 2,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchSlot: { width: BAR, height: BAR, alignItems: 'center', justifyContent: 'center' },
  inputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 6 },
  input: { flex: 1, fontFamily: font.regular, fontSize: 14.5, height: BAR, padding: 0 },
  filterBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E4E3FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
