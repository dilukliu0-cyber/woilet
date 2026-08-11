import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../api/supabaseClient';
import { translate } from '../../i18n/translate';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Регистрирует устройство для push-уведомлений и сохраняет Expo push token
// в user_settings — Edge Functions (ai-digest и т.д.) шлют через него push
// даже когда приложение закрыто. Работает только в собранном (dev/prod)
// клиенте, не в Expo Go, поэтому падения молча игнорируются.
export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    if (!Device.isDevice) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;

    await supabase.from('user_settings').update({ push_token: token }).eq('user_id', userId);
  } catch (error) {
    console.error('Не удалось зарегистрировать push-уведомления', error);
  }
}

export async function sendTestNotification(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Woilet', body: translate('svc_test_notification') },
    trigger: null,
  });
}
