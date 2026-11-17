import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import * as Device from 'expo-device';
import { apiClient } from './api';

export const CHANNEL_ID = 'wavixa_messages';
export const SOUND_NAME = 'notify_ding.wav';

// Foreground notifications show as a banner + play the channel sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let initPromise: Promise<boolean> | null = null;

/** Create the custom-sound Android channel + request permissions. */
export const initNotifications = (): Promise<boolean> => {
  // Multiple screens call this concurrently — share one in-flight attempt.
  initPromise ??= initNotificationsInternal().then(
    (granted) => {
      if (!granted) initPromise = null;
      return granted;
    },
    () => {
      initPromise = null;
      return false;
    }
  );
  return initPromise;
};

const initNotificationsInternal = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'رسائل العملاء',
        importance: AndroidImportance.HIGH,
        sound: SOUND_NAME,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00A884',
        lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
        enableVibrate: true,
      });
    } catch (e) {
      // Some ROMs NPE inside the native channel builder on the full option
      // set — a degraded channel still delivers notifications, and a failure
      // here must never crash app startup.
      console.warn('[notifications] channel creation with full options failed, retrying minimal:', e);
      try {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'رسائل العملاء',
          importance: AndroidImportance.HIGH,
        });
      } catch (e2) {
        console.warn('[notifications] notification channel creation failed:', e2);
      }
    }
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }

  return status === 'granted';
};

/** Immediate local notification on the custom channel (app is open/foreground). */
export const notifyNewMessage = async (title: string, body: string) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: body?.slice(0, 120) || '',
        sound: SOUND_NAME,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch {}
};

/** Register the native FCM device token on the CRM backend (direct FCM —
 *  no Expo push middleman needed). */
export const registerPushToken = async (): Promise<string | null> => {
  try {
    if (!Device.isDevice) return null; // simulators can't receive push

    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData?.data as string | undefined;
    if (!token) return null;

    // Tell the backend so message-received webhooks can ping this device.
    await apiClient
      .post('/crm/push-token', {
        token,
        platform: Platform.OS,
        device_name: Device.deviceName ?? 'mobile',
      })
      .catch(() => {});

    return token;
  } catch {
    return null;
  }
};

/** Called once per app start after login. */
export const setupPush = async () => {
  const ok = await initNotifications();
  if (ok) await registerPushToken();
};
