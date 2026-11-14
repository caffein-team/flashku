import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';

import { useAvatar } from '@/features/settings/profile/useAvatar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AuthUser } from '@/api/auth';
import { usersApi } from '@/api/users';
import { assetUrl, getErrorBody, getErrorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { AvatarSheet } from '@/components/settings/AvatarSheet';
import { PasswordSheet } from '@/components/settings/PasswordSheet';
import { BottomSheet } from '@/components/settings/Sheets';
import { Card, NavRow } from '@/components/settings/SettingsUI';
import { TextField } from '@/components/TextField';
import { z } from 'zod';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

/** Aturan username di backend: 3–50 karakter, huruf/angka/underscore/strip. */
const usernameSchema = z
  .string()
  .min(3, 'Nama pengguna minimal 3 karakter')
  .max(50, 'Nama pengguna maksimal 50 karakter')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Hanya huruf, angka, underscore, dan strip');

/** "9 November 2026"; "—" jika tanggal tidak tersedia. */
function formatJoined(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { user, updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const avatar = useAvatar();

  const name = user?.username ?? user?.name ?? 'Nama pengguna';
  const email = user?.email ?? '—';
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <PageHeader title="Profil" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.hero}>
          <Pressable
            onPress={() => setAvatarMenu(true)}
            disabled={avatar.busy}
            accessibilityRole="button"
            accessibilityLabel="Ganti foto profil"
            style={styles.avatarWrap}
          >
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
              {!!user?.picture && (
                <Image source={{ uri: assetUrl(user.picture) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              )}
              {avatar.busy && (
                <View style={styles.avatarBusy}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
            </View>
            <View style={[styles.camera, { backgroundColor: colors.surface, borderColor: colors.background }]}>
              <Ionicons name="camera" size={16} color={colors.primary} />
            </View>
          </Pressable>
          <Text style={[styles.heroName, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[styles.heroEmail, { color: colors.textMuted }]} numberOfLines={1}>
            {email}
          </Text>
        </Card>

        <Card>
          <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Informasi akun</Text>
          <InfoRow label="Nama pengguna" value={name} />
          <InfoRow label="Email" value={email} />
          <InfoRow label="Tanggal bergabung" value={formatJoined(user?.createdAt)} />
        </Card>

        <Card>
          <Text style={[styles.cardTitle, { color: colors.textMuted }]}>Keamanan</Text>
          <NavRow label="Ganti kata sandi" onPress={() => setPasswordOpen(true)} />
        </Card>

        <Button
          title="Edit profil"
          onPress={() => setEditing(true)}
          left={<Ionicons name="pencil" size={18} color={colors.primaryText} />}
        />
      </ScrollView>

      <AvatarSheet
        visible={avatarMenu}
        hasAvatar={!!user?.picture}
        onClose={() => setAvatarMenu(false)}
        onChange={() => void avatar.change()}
        onRemove={() => void avatar.remove()}
      />
      <PasswordSheet key={passwordOpen ? 'password-open' : 'password-closed'} visible={passwordOpen} onClose={() => setPasswordOpen(false)} />

      <EditSheet
        // setel ulang isian tiap dibuka
        key={editing ? 'edit-open' : 'edit-closed'}
        visible={editing}
        initialName={name === 'Nama pengguna' ? '' : name}
        email={email}
        onClose={() => setEditing(false)}
        onSaved={(u) => updateUser({ name: u.name, username: u.username, picture: u.picture })}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.info, { borderTopColor: colors.border }]}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

function EditSheet({
  visible,
  initialName,
  email,
  onClose,
  onSaved,
}: {
  visible: boolean;
  initialName: string;
  email: string;
  onClose: () => void;
  onSaved: (user: AuthUser) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | undefined>();

  const save = useMutation({
    mutationFn: (value: string) => usersApi.updateProfile({ username: value }),
    onSuccess: (updated, value) => {
      onSaved({ ...updated, username: updated?.username ?? value });
      onClose();
    },
    onError: (e) => {
      const fieldError = getErrorBody(e).errors?.username;
      setError(fieldError ?? getErrorMessage(e));
    },
  });

  const submit = () => {
    const value = name.trim();
    const parsed = usernameSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nama pengguna tidak valid');
      return;
    }
    if (value === initialName) {
      onClose();
      return;
    }
    setError(undefined);
    save.mutate(value);
  };

  return (
    <BottomSheet visible={visible} title="Edit profil" onClose={onClose}>
      <TextField
        label="Nama pengguna"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(undefined);
        }}
        placeholder="Nama pengguna"
        returnKeyType="done"
        onSubmitEditing={submit}
        error={error}
        autoFocus
      />
      <View style={styles.emailNote}>
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>Email</Text>
        <Text style={[styles.infoValue, { color: colors.text }]}>{email}</Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>Email tidak dapat diubah dari sini.</Text>
      </View>
      <View style={styles.actions}>
        <Button title="Batal" variant="outline" onPress={onClose} style={styles.flex} />
        <Button title="Simpan" onPress={submit} loading={save.isPending} style={styles.flex} />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  hero: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 16, gap: 4 },
  avatarWrap: { marginBottom: 8 },
  avatarBusy: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  camera: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontFamily: font.bold, fontSize: 30, color: '#fff' },
  heroName: { fontFamily: font.extrabold, fontSize: 20 },
  heroEmail: { fontFamily: font.regular, fontSize: 14 },
  cardTitle: { fontFamily: font.bold, fontSize: 14, paddingHorizontal: 16, paddingVertical: 14 },
  info: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  infoLabel: { fontFamily: font.regular, fontSize: 13 },
  infoValue: { fontFamily: font.bold, fontSize: 16 },
  emailNote: { gap: 2 },
  hint: { fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
