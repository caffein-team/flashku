import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/Button';
import { OtpInput } from '@/components/OtpInput';
import { goBack } from '@/lib/navigation';
import { OTP_LENGTH } from '@/lib/schemas';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

const RESEND_SECONDS = 60;

export default function VerifyOtpScreen() {
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();

  const [otp, setOtp] = useState('');
  const [failed, setFailed] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  // OTP pertama sudah dikirim oleh layar sebelumnya, jadi cooldown langsung berjalan.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = useMutation({
    mutationFn: () => authApi.verify({ email, otp }),
    onSuccess: async (result) => {
      if (result.token) {
        await signIn(result); // route guard otomatis memindahkan ke tab
      } else {
        Alert.alert('Berhasil', 'Akunmu sudah terverifikasi. Silakan masuk.');
        router.replace('/login');
      }
    },
    onError: (error) => {
      setFailed(true);
      Alert.alert('Verifikasi gagal', getErrorMessage(error));
    },
  });

  const resend = useMutation({
    mutationFn: () => authApi.sendOtp(email),
    onSuccess: () => {
      setCooldown(RESEND_SECONDS);
      setOtp('');
      setFailed(false);
      Alert.alert('Terkirim', `Kode baru dikirim ke ${email}.`);
    },
    onError: (error) => Alert.alert('Gagal mengirim kode', getErrorMessage(error)),
  });

  const ready = otp.length === OTP_LENGTH;

  return (
    <AuthScreen
      compact
      title="Verifikasi email"
      subtitle={`Masukkan ${OTP_LENGTH} digit kode yang dikirim ke ${email || 'emailmu'}.`}
      footer={
        <Pressable hitSlop={8} onPress={() => goBack('/register')}>
          <Text style={[styles.back, { color: colors.link }]}>Ganti email</Text>
        </Pressable>
      }
    >
      <OtpInput
        value={otp}
        length={OTP_LENGTH}
        error={failed}
        autoFocus
        onChange={(v) => {
          setOtp(v);
          setFailed(false);
        }}
      />
      <Button title="Verifikasi" loading={verify.isPending} disabled={!ready} onPress={() => verify.mutate()} />
      <Pressable
        disabled={cooldown > 0 || resend.isPending}
        onPress={() => resend.mutate()}
        hitSlop={8}
        style={styles.resend}
      >
        <Text
          style={[
            styles.resendText,
            { color: cooldown > 0 || resend.isPending ? colors.textMuted : colors.link },
          ]}
        >
          {cooldown > 0 ? `Kirim ulang kode (${cooldown}d)` : 'Kirim ulang kode'}
        </Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  resend: { alignSelf: 'center' },
  resendText: { fontFamily: font.bold, fontSize: 14 },
  back: { fontFamily: font.bold, fontSize: 14 },
});
