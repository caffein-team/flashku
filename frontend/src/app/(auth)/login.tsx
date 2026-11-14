import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { authApi } from '@/api/auth';
import { getErrorBody, getErrorMessage, getErrorStatus } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { GOOGLE_AUTH_ENABLED } from '@/lib/config';
import { useGoogleSignIn } from '@/auth/useGoogleSignIn';
import { FooterLink, GoogleButton, OrDivider, TempSkipButton } from '@/components/AuthExtras';
import { AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { loginSchema, type LoginForm } from '@/lib/schemas';
import { font } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeProvider';

export default function LoginScreen() {
  const { colors } = useTheme();
  const { signIn } = useAuth();
  const google = useGoogleSignIn();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const login = useMutation({
    mutationFn: (v: LoginForm) => authApi.login(v.identifier.trim(), v.password),
    onSuccess: (result) => signIn(result),
    onError: async (error, v) => {
      // ASUMSI: backend membalas 403 untuk akun yang belum terverifikasi (konfirmasi dengan backend).
      if (getErrorStatus(error) === 403) {
        const email = getErrorBody(error).email ?? (v.identifier.includes('@') ? v.identifier.trim() : null);
        if (email) {
          try {
            await authApi.sendOtp(email);
          } catch {}
          router.push({ pathname: '/verify-otp', params: { email } });
          return;
        }
      }
      Alert.alert('Gagal masuk', getErrorMessage(error));
    },
  });

  const busy = login.isPending || google.loading;

  return (
    <AuthScreen
      title="Selamat datang kembali"
      subtitle="Masuk untuk melanjutkan belajarmu."
      footer={<FooterLink text="Belum punya akun?" linkText="Daftar" href="/register" />}
    >
      <Controller
        control={control}
        name="identifier"
        render={({ field }) => (
          <TextField
            label="Username / Email"
            placeholder="nama@email.com"
            keyboardType="email-address"
            textContentType="username"
            autoComplete="username"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.identifier?.message}
          />
        )}
      />
      <View style={styles.passwordBlock}>
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <TextField
              label="Kata sandi"
              placeholder="Masukkan kata sandi"
              password
              textContentType="password"
              autoComplete="current-password"
              returnKeyType="go"
              onSubmitEditing={() => void handleSubmit((v) => login.mutate(v))()}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.password?.message}
            />
          )}
        />
        <Pressable
          style={styles.forgot}
          hitSlop={8}
          onPress={() => Alert.alert('Segera hadir', 'Fitur lupa kata sandi belum tersedia.')}
        >
          <Text style={[styles.forgotText, { color: colors.link }]}>Lupa kata sandi?</Text>
        </Pressable>
      </View>

      <Button title="Masuk" loading={login.isPending} disabled={busy} onPress={handleSubmit((v) => login.mutate(v))} />
      {GOOGLE_AUTH_ENABLED && (
        <>
          <OrDivider />
          <GoogleButton
            title="Lanjutkan dengan Google"
            onPress={google.signInWithGoogle}
            loading={google.loading}
            disabled={busy}
          />
        </>
      )}
      <TempSkipButton />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  passwordBlock: { gap: 12 },
  forgot: { alignSelf: 'flex-end' },
  forgotText: { fontFamily: font.bold, fontSize: 13 },
});
