import { Ionicons } from "@expo/vector-icons";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/Button";
import { PageHeader } from "@/components/PageHeader";
import { font } from "@/theme/fonts";
import { useTheme, type ThemeMode } from "@/theme/ThemeProvider";

const THEME_OPTIONS: { mode: ThemeMode; label: string }[] = [
  { mode: "light", label: "Terang" },
  { mode: "dark", label: "Gelap" },
  { mode: "system", label: "Sistem" },
];

function soon() {
  Alert.alert("Segera hadir", "Fitur ini belum tersedia.");
}

export default function SettingsScreen() {
  const { colors, mode, setMode } = useTheme();
  const { user, signOut } = useAuth();

  const displayName = user?.username ?? user?.name ?? "Nama pengguna";
  const email = user?.email ?? "";

  const confirmSignOut = () =>
    Alert.alert("Keluar", "Yakin ingin keluar dari akunmu?", [
      { text: "Batal", style: "cancel" },
      { text: "Keluar", style: "destructive", onPress: () => void signOut() },
    ]);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title="Pengaturan" />
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.card,
            styles.profile,
            { backgroundColor: colors.surface },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.flex}>
            <Text
              style={[styles.name, { color: colors.text }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            {!!email && (
              <Text
                style={[styles.email, { color: colors.textMuted }]}
                numberOfLines={1}
              >
                {email}
              </Text>
            )}
          </View>
          <Pressable hitSlop={8} onPress={soon}>
            <Text style={[styles.link, { color: colors.link }]}>Edit</Text>
          </Pressable>
        </View>

        <Text style={[styles.section, { color: colors.text }]}>Tema</Text>
        <View
          style={[
            styles.card,
            styles.segment,
            { backgroundColor: colors.surface },
          ]}
        >
          {THEME_OPTIONS.map((o) => {
            const active = o.mode === mode;
            return (
              <Pressable
                key={o.mode}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(o.mode)}
                style={[
                  styles.segmentItem,
                  active && { backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? colors.primaryText : colors.text },
                  ]}
                >
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.groupTitle, { color: colors.textMuted }]}>
            Umum
          </Text>
          <Row label="Bahasa" value="Indonesia" onPress={soon} />
          <Row label="Profil" onPress={soon} />
          <Row label="Notifikasi" onPress={soon} last />
        </View>

        {/* Donate Button */}
        {/* <View style={[styles.banner, { backgroundColor: colors.banner }]}>
          <View style={styles.flex}>
            <Text style={[styles.bannerTitle, { color: colors.bannerText }]}>Dukung FlashKu</Text>
            <Text style={[styles.bannerBody, { color: colors.bannerText }]}>
              Bantu kami terus mengembangkan aplikasi ini.
            </Text>
          </View>
          <Button title="Donasi" onPress={soon} style={styles.donate} />
        </View> */}

        <Button title="Keluar" variant="outline" onPress={confirmSignOut} />
      </ScrollView>
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  last,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, { borderTopColor: colors.border }, last && undefined]}
      accessibilityRole="button"
    >
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      {!!value && (
        <Text style={[styles.rowValue, { color: colors.textMuted }]}>
          {value}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 14 },
  card: { borderRadius: 20, overflow: "hidden" },
  profile: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: font.bold, fontSize: 20, color: "#fff" },
  name: { fontFamily: font.bold, fontSize: 16 },
  email: { fontFamily: font.regular, fontSize: 13 },
  link: { fontFamily: font.bold, fontSize: 14 },
  section: {
    fontFamily: font.bold,
    fontSize: 16,
    marginBottom: -4,
    marginLeft: 4,
  },
  segment: { flexDirection: "row", padding: 4 },
  segmentItem: {
    flex: 1,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentText: { fontFamily: font.bold, fontSize: 14 },
  groupTitle: {
    fontFamily: font.bold,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    height: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flex: 1, fontFamily: font.semibold, fontSize: 15 },
  rowValue: { fontFamily: font.regular, fontSize: 14 },
  banner: {
    borderRadius: 20,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  bannerTitle: { fontFamily: font.bold, fontSize: 15 },
  bannerBody: { fontFamily: font.regular, fontSize: 12.5, marginTop: 2 },
  donate: { height: 44, paddingHorizontal: 22, borderRadius: 14 },
});
