import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TimeOfDay } from '@/features/settings/notifications/types';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '../Button';

type SheetProps = { visible: boolean; title?: string; onClose: () => void; children: ReactNode };

export function BottomSheet({ visible, title, onClose, children }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
          <Pressable style={styles.flex} onPress={onClose} accessibilityLabel="Tutup" />
        </Animated.View>
        <View style={styles.bottom} pointerEvents="box-none">
          <Animated.View
            entering={SlideInDown.duration(260)}
            style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            {!!title && <Text style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>}
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type Option<T extends string> = { value: T; label: string };

export function OptionSheet<T extends string>({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: Option<T>[];
  selected: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      {options.map((o) => {
        const active = o.value === selected;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              onSelect(o.value);
              onClose();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.option, active && { backgroundColor: colors.banner }]}
          >
            <Text style={[styles.optionText, { color: active ? colors.bannerText : colors.text }]}>{o.label}</Text>
            {active && <Text style={{ color: colors.primary, fontFamily: font.bold }}>✓</Text>}
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

const ITEM = 44;
const VISIBLE = 5;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

function Column({ values, selected, onSelect }: { values: number[]; selected: number; onSelect: (n: number) => void }) {
  const { colors } = useTheme();
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    const idx = Math.max(0, values.indexOf(selected));
    const t = setTimeout(() => ref.current?.scrollTo({ y: idx * ITEM, animated: false }), 30);
    return () => clearTimeout(t);
    // Hanya saat pertama tampil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView
      ref={ref}
      style={styles.column}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingVertical: ITEM * ((VISIBLE - 1) / 2) }}
      snapToInterval={ITEM}
      decelerationRate="fast"
    >
      {values.map((n) => {
        const active = n === selected;
        return (
          <Pressable
            key={n}
            onPress={() => onSelect(n)}
            style={[styles.item, active && { backgroundColor: colors.banner }]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.itemText, { color: active ? colors.bannerText : colors.textMuted }]}>
              {String(n).padStart(2, '0')}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Jam 00–23, menit kelipatan 5. */
export function TimeSheet({
  visible,
  title,
  value,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  value: TimeOfDay;
  onSave: (t: TimeOfDay) => void;
  onClose: () => void;
}) {
  const [hour, setHour] = useState(value.hour);
  const [minute, setMinute] = useState(value.minute - (value.minute % 5));

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <View style={styles.columns}>
        <Column values={HOURS} selected={hour} onSelect={setHour} />
        <Text style={styles.colon}>:</Text>
        <Column values={MINUTES} selected={minute} onSelect={setMinute} />
      </View>
      <Button
        title="Simpan"
        onPress={() => {
          onSave({ hour, minute });
          onClose();
        }}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 10, 30, 0.45)' },
  bottom: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, gap: 12 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 6 },
  sheetTitle: { fontFamily: font.extrabold, fontSize: 18 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  optionText: { fontFamily: font.semibold, fontSize: 15 },
  columns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  column: { height: ITEM * VISIBLE, width: 96, flexGrow: 0 },
  item: { height: ITEM, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontFamily: font.bold, fontSize: 22 },
  colon: { fontFamily: font.bold, fontSize: 24, color: '#888' },
});
