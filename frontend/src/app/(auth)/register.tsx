import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert } from 'react-native';

import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/client';
import { useGoogleSignIn } from '@/auth/useGoogleSignIn';
import { FooterLink, GoogleButton, OrDivider } from '@/components/AuthExtras';
import { AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { registerSchema, type RegisterForm } from '@/lib/schemas';

export default function RegisterScreen() {
  const google = useGoogleSignIn();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '' },
  });

  const register = useMutation({
    // 1) /auth/register  2) /auth/send-otp  → lanjut ke layar OTP  3) /auth/verify
    mutationFn: async (v: RegisterForm) => {
      const input = { ...v, username: v.username.trim(), email: v.email.trim() };
      await authApi.register(input);
      await authApi.sendOtp(input.email);
      return input.email;
    },
    onSuccess: (email) => router.push({ pathname: '/verify-otp', params: { email } }),
    onError: (error) => Alert.alert('Gagal mendaftar', getErrorMessage(error)),
  });

  const busy = register.isPending || google.loading;
  const submit = handleSubmit((v) => register.mutate(v));

  return (
    <AuthScreen
      compact
      title="Buat akun baru"
      subtitle="Mulai belajar bahasa Jepang dari lagu favoritmu."
      footer={<FooterLink text="Sudah punya akun?" linkText="Masuk" href="/login" />}
    >
      <Controller
        control={control}
        name="username"
        render={({ field }) => (
          <TextField
            label="Username"
            placeholder="Username"
            textContentType="username"
            autoComplete="username-new"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.username?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            placeholder="nama@email.com"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Kata sandi"
            placeholder="Minimal 8 karakter"
            password
            textContentType="newPassword"
            autoComplete="password-new"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
          />
        )}
      />

      <Button title="Daftar" loading={register.isPending} disabled={busy} onPress={submit} />
      <OrDivider />
      <GoogleButton
        title="Daftar dengan Google"
        onPress={google.signInWithGoogle}
        loading={google.loading}
        disabled={busy}
      />
    </AuthScreen>
  );
}
