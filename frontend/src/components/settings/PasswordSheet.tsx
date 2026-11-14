import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { z } from 'zod';

import { getErrorBody, getErrorMessage } from '@/api/client';
import { usersApi } from '@/api/users';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { notify } from '@/lib/notify';
import { BottomSheet } from './Sheets';

const schema = z
  .object({
    current: z.string().min(1, 'Kata sandi saat ini wajib diisi'),
    next: z.string().min(8, 'Kata sandi baru minimal 8 karakter'),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ['confirm'], message: 'Konfirmasi tidak sama dengan kata sandi baru' })
  .refine((v) => v.next !== v.current, { path: ['next'], message: 'Kata sandi baru harus berbeda dari yang lama' });

type Field = 'current' | 'next' | 'confirm';
type Errors = Partial<Record<Field, string>>;

export function PasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [values, setValues] = useState({ current: '', next: '', confirm: '' });
  const [errors, setErrors] = useState<Errors>({});
  const nextRef = useRef<ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<ComponentRef<typeof TextInput>>(null);

  const set = (field: Field) => (text: string) => {
    setValues((v) => ({ ...v, [field]: text }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const save = useMutation({
    mutationFn: () => usersApi.changePassword({ currentPassword: values.current, newPassword: values.next }),
    onSuccess: () => {
      notify('Kata sandi diubah');
      onClose();
    },
    onError: (e) => {
      const body = getErrorBody(e);
      const fromServer: Errors = {
        current: body.errors?.current_password,
        next: body.errors?.new_password,
      };
      // Salah kata sandi lama hanya dikirim sebagai `message`, tanpa `errors`.
      if (/current password/i.test(String(body.message))) fromServer.current = 'Kata sandi saat ini salah';
      if (fromServer.current || fromServer.next) setErrors(fromServer);
      else notify(getErrorMessage(e));
    },
  });

  const submit = () => {
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      return;
    }
    save.mutate();
  };

  return (
    <BottomSheet visible={visible} title="Ganti kata sandi" onClose={onClose}>
      <View style={styles.form}>
        <TextField
          label="Kata sandi saat ini"
          password
          autoComplete="current-password"
          value={values.current}
          onChangeText={set('current')}
          error={errors.current}
          returnKeyType="next"
          onSubmitEditing={() => nextRef.current?.focus()}
          autoFocus
        />
        <TextField
          ref={nextRef}
          label="Kata sandi baru"
          password
          autoComplete="new-password"
          placeholder="Minimal 8 karakter"
          value={values.next}
          onChangeText={set('next')}
          error={errors.next}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
        />
        <TextField
          ref={confirmRef}
          label="Ulangi kata sandi baru"
          password
          autoComplete="new-password"
          value={values.confirm}
          onChangeText={set('confirm')}
          error={errors.confirm}
          returnKeyType="done"
          onSubmitEditing={submit}
        />
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
  form: { gap: 14 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
