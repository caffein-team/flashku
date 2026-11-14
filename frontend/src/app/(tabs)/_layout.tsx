import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <TabIconView name={name} color={color} focused={focused} />;
  };
}

function TabIconView({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, focused && { backgroundColor: colors.tabActive }]}>
      <Ionicons name={name} size={22} color={color as string} />
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border, height: 72, paddingTop: 6 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Beranda', tabBarIcon: tabIcon('home-outline') }} />
      <Tabs.Screen name="songs" options={{ title: 'Lagu', tabBarIcon: tabIcon('musical-notes-outline') }} />
      <Tabs.Screen name="deck" options={{ title: 'Deck', tabBarIcon: tabIcon('copy-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Pengaturan', tabBarIcon: tabIcon('options-outline'), popToTopOnBlur: true }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
