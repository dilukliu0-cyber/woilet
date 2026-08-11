import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../api/supabaseClient';
import { translate } from '../../i18n/translate';

// Выбор фото → квадрат 256px → загрузка в публичный bucket avatars/{userId}/avatar.jpg.
// Возвращает путь в bucket'е или null (отмена/ошибка с сообщением).
export async function pickAndUploadAvatar(userId: string): Promise<{ path: string | null; error: string | null }> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]) return { path: null, error: null };

  const manipulated = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 256 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!manipulated.base64) return { path: null, error: translate('svc_photo_prepare_failed') };

  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, decode(manipulated.base64), { contentType: 'image/jpeg', upsert: true });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

// Публичный URL аватарки; v= сбрасывает кэш Image после перезаливки.
export function avatarUrl(path: string | null, cacheKey?: string | number): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return cacheKey ? `${data.publicUrl}?v=${cacheKey}` : data.publicUrl;
}
