import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

import { getErrorMessage } from '@/api/client';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, usersApi } from '@/api/users';
import { useAuth } from '@/auth/AuthProvider';
import { notify } from '@/lib/notify';

const mimeFromUri = (uri: string) => {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
};

/** Ganti dan hapus foto profil; `busy` true selama unggah atau hapus berjalan. */
export function useAvatar() {
  const { updateUser } = useAuth();
  const [busy, setBusy] = useState(false);

  const change = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    const mimeType = asset.mimeType ?? mimeFromUri(asset.uri);
    if (!AVATAR_MIME_TYPES.includes(mimeType)) {
      notify('Format foto harus JPG, PNG, WEBP, atau GIF.');
      return;
    }
    if (asset.fileSize && asset.fileSize > AVATAR_MAX_BYTES) {
      notify('Ukuran foto maksimal 5 MB.');
      return;
    }

    setBusy(true);
    try {
      const url = await usersApi.uploadAvatar({ uri: asset.uri, mimeType });
      updateUser({ picture: url });
      notify('Foto profil diperbarui');
    } catch (e) {
      notify(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await usersApi.deleteAvatar();
      updateUser({ picture: undefined });
      notify('Foto profil dihapus');
    } catch (e) {
      notify(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return { busy, change, remove };
}
