import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, AndroidNotificationVisibility } from 'expo-notifications';
import * as Device from 'expo-device';
import { apiClient } from './api';

export const CHANNEL_ID = 'wavixa_messages';
export const SOUND_NAME = 'notify_ding.wav';

// The logged-in account — pushes carrying a different data.user_id belong
// to a stale token of another login sharing this device and get dropped.
let currentUserId: number | string | null = null;
export const setPushUserId = (id: number | string | null) => {
  currentUserId = id;
};

const SILENT = {
  shouldPlaySound: false,
  shouldSetBadge: false,
  shouldShowBanner: false,
  shouldShowList: false,
};

// FCM is the single source of push UI — foreground and background — so a
// message can never alert twice. The chat-list poller still plays the ding.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const targetUser = notification?.request?.content?.data?.user_id;
    if (
      currentUserId != null &&
      targetUser != null &&
      String(targetUser) !== String(currentUserId)
    ) {
      return SILENT;
    }
    return {
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    };
  },
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

/** Drop this device's push token server-side — call on logout so a
 *  signed-out install stops receiving the account's notifications. Must
 *  run while the API token is still valid. */
export const unregisterPushToken = async (): Promise<void> => {
  try {
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData?.data as string | undefined;
    await apiClient.delete('/crm/push-token', { data: token ? { token } : {} });
  } catch {}
};
