import { Image } from "expo-image";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { headerColor } from "@/theme/colors";
import { font } from "@/theme/fonts";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Baris di dasar layar, mis. "Belum punya akun? Daftar". */
  footer?: ReactNode;
  /** Logo lebih kecil (dipakai di layar Daftar/OTP). */
  compact?: boolean;
};

export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  compact,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const logo = compact ? 52 : 60;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View style={[styles.header, { paddingTop: insets.top + 24 }]}>
            <Text style={styles.glyph} accessible={false}>
              歌
            </Text>
            <View
              style={[
                styles.logo,
                { width: logo, height: logo, borderRadius: logo * 0.3 },
              ]}
            >
              {/* <Ionicons name="copy-outline" size={logo * 0.5} color={headerColor} /> */}
              <Image
                source={require("@/assets/images/app-icon-light-outline-512.png")}
                style={{ width: "100%", height: "100%" }}
              />
            </View>
            <Text style={styles.brand}>FlashKu</Text>
            <Text style={styles.tagline}>
              Belajar bahasa Jepang lewat lagu favoritmu
            </Text>
          </View>

          <View style={styles.body}>
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {subtitle}
            </Text>
            <View style={styles.form}>{children}</View>
          </View>
        </View>

        {footer && (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
            {footer}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "space-between" },
  header: {
    backgroundColor: headerColor,
    borderBottomLeftRadius: 44,
    borderBottomRightRadius: 44,
    alignItems: "center",
    paddingBottom: 28,
    overflow: "hidden",
  },
  glyph: {
    position: "absolute",
    right: -18,
    top: -26,
    fontSize: 190,
    lineHeight: 220,
    color: "rgba(255,255,255,0.14)",
    fontFamily: font.extrabold,
  },
  logo: {
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    marginTop: 10,
    fontFamily: font.extrabold,
    fontSize: 32,
    color: "#fff",
  },
  tagline: {
    marginTop: 4,
    fontFamily: font.regular,
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
  },
  body: { paddingHorizontal: 28, paddingTop: 28 },
  title: { fontFamily: font.extrabold, fontSize: 26 },
  subtitle: { marginTop: 4, fontFamily: font.regular, fontSize: 15 },
  form: { marginTop: 20, gap: 16 },
  footer: { alignItems: "center", paddingTop: 24, paddingHorizontal: 28 },
});
