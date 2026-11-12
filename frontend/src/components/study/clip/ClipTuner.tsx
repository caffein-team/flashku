import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export type Clip = { startSec: number; endSec: number };

type Props = {
  /** Posisi video saat ini (detik), dilaporkan pemutar. */
  time: number;
  onSeek: (sec: number) => void;
  /** Pakai rentang yang ditandai sebagai klip kartu (tanpa mengubah deck.ts) untuk dicoba. */
  onTry: (clip: Clip) => void;
};

const fmt = (n: number | null) => (n === null ? '—' : n.toFixed(2));

/**
 * Alat bantu DEV untuk menentukan timestamp klip: putar video bebas, tandai awal dan akhir baris lirik,
 * coba hasilnya, lalu salin potongan kode ke `clip` di deck.ts. Tidak muncul di build produksi.
 */
export function ClipTuner({ time, onSeek, onTry }: Props) {
  const { colors } = useTheme();
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [jump, setJump] = useState('');
  const [copied, setCopied] = useState(false);

  const valid = start !== null && end !== null && end > start;
  const snippet = valid ? `clip: { startSec: ${start.toFixed(2)}, endSec: ${end.toFixed(2)} },` : '';

  const nudge = (delta: number) => onSeek(Math.max(0, time + delta));

  const copy = async () => {
    if (!snippet) return;
    console.log('[ClipTuner]', snippet);
    try {
      await Clipboard.setStringAsync(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const box = { backgroundColor: colors.surface, borderColor: colors.border };
  const chip = { backgroundColor: colors.surfaceMuted };

  return (
    <View style={[styles.panel, box]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.textMuted }]}>PENENTU KLIP (DEV)</Text>
        <Text style={[styles.time, { color: colors.primary }]}>{time.toFixed(2)} s</Text>
      </View>

      <View style={styles.row}>
        {[-5, -1, -0.25, 0.25, 1, 5].map((d) => (
          <Pressable key={d} style={[styles.nudge, chip]} onPress={() => nudge(d)}>
            <Text style={[styles.nudgeText, { color: colors.text }]}>{d > 0 ? `+${d}` : d}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <TextInput
          value={jump}
          onChangeText={setJump}
          placeholder="Lompat ke detik…"
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          style={[styles.input, { color: colors.text, borderColor: colors.inputBorder }]}
        />
        <Pressable
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={() => {
            const n = parseFloat(jump.replace(',', '.'));
            if (Number.isFinite(n)) onSeek(Math.max(0, n));
          }}
        >
          <Text style={[styles.btnText, { color: colors.primaryText }]}>Lompat</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Pressable style={[styles.mark, chip]} onPress={() => setStart(time)}>
          <Text style={[styles.markLabel, { color: colors.textMuted }]}>Tandai mulai</Text>
          <Text style={[styles.markValue, { color: colors.text }]}>{fmt(start)}</Text>
        </Pressable>
        <Pressable style={[styles.mark, chip]} onPress={() => setEnd(time)}>
          <Text style={[styles.markLabel, { color: colors.textMuted }]}>Tandai selesai</Text>
          <Text style={[styles.markValue, { color: colors.text }]}>{fmt(end)}</Text>
        </Pressable>
      </View>

      <Text
        selectable
        style={[styles.snippet, { color: valid ? colors.text : colors.textMuted, backgroundColor: colors.surfaceMuted }]}
      >
        {valid ? snippet : 'Tandai mulai dan selesai (selesai harus setelah mulai)'}
      </Text>

      <View style={styles.row}>
        <Pressable
          disabled={!valid}
          style={[styles.btn, styles.flex, { backgroundColor: colors.primary }, !valid && { opacity: 0.4 }]}
          onPress={() => valid && onTry({ startSec: start, endSec: end })}
        >
          <Text style={[styles.btnText, { color: colors.primaryText }]}>Coba klip</Text>
        </Pressable>
        <Pressable
          disabled={!valid}
          style={[styles.btn, styles.flex, { backgroundColor: colors.successSoft }, !valid && { opacity: 0.4 }]}
          onPress={copy}
        >
          <Text style={[styles.btnText, { color: colors.success }]}>{copied ? 'Tersalin ✓' : 'Salin kode'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: { borderRadius: 20, borderWidth: 1, padding: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6 },
  time: { fontFamily: font.extrabold, fontSize: 20 },
  row: { flexDirection: 'row', gap: 8 },
  nudge: { flex: 1, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nudgeText: { fontFamily: font.bold, fontSize: 12 },
  input: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, fontFamily: font.regular, fontSize: 14 },
  btn: { height: 40, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: font.bold, fontSize: 13 },
  mark: { flex: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 2 },
  markLabel: { fontFamily: font.medium, fontSize: 11 },
  markValue: { fontFamily: font.bold, fontSize: 16 },
  snippet: { fontFamily: font.medium, fontSize: 12, padding: 10, borderRadius: 10, overflow: 'hidden' },
});
