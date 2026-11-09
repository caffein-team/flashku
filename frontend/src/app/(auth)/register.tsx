import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert } from 'react-native';

import { authApi } from '@/api/auth';
import { getErrorBody, getErrorMessage } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { useGoogleSignIn } from '@/auth/useGoogleSignIn';
import { FooterLink, GoogleButton, OrDivider, TempSkipButton } from '@/components/AuthExtras';
import { AuthScreen } from '@/components/AuthScreen';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { OTP_ENABLED } from '@/lib/config';
import { registerSchema, type RegisterForm } from '@/lib/schemas';

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const google = useGoogleSignIn();

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', email: '', password: '' },
  });

  const register = useMutation({
    mutationFn: async (v: RegisterForm) => {
      const name = v.username.trim();
      const email = v.email.trim();
      const result = await authApi.register({ name, email, password: v.password });

      if (OTP_ENABLED) {
        await authApi.sendOtp(email);
        return { email, result: null };
      }
      // Tanpa OTP: pakai token dari register, atau login otomatis dengan akun yang baru dibuat.
      return { email, result: result.token ? result : await authApi.login(email, v.password) };
    },
    onSuccess: async ({ email, result }) => {
      if (result) await signIn(result); // route guard memindahkan ke halaman utama
      else router.push({ pathname: '/verify-otp', params: { email } });
    },
    onError: (error) => {
      // Tampilkan error validasi backend di field yang bersangkutan.
      const fieldErrors = getErrorBody(error).errors;
      if (fieldErrors) {
        const map = { name: 'username', email: 'email', password: 'password' } as const;
        let shown = false;
        for (const [key, message] of Object.entries(fieldErrors)) {
          const field = map[key as keyof typeof map];
          if (field) {
            setError(field, { message });
            shown = true;
          }
        }
        if (shown) return;
      }
      Alert.alert('Gagal mendaftar', getErrorMessage(error));
    },
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
      <TempSkipButton />
    </AuthScreen>
  );
}
