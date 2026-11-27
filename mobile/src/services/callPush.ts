/**
 * WhatsApp-style incoming-call push pipeline.
 *
 * The backend sends DATA-ONLY high-priority FCM messages:
 *   type=call.incoming {peer, caller, conversation_id, video, user_id}
 *   type=call.end      {peer, conversation_id}
 *
 * A data-only message wakes the app process even when it is killed; the
 * expo-notifications background task below receives it and renders a real
 * full-screen ringing notification via Notifee (channel wavixa_calls +
 * USE_FULL_SCREEN_INTENT), exactly like a WhatsApp call.
 *
 * Answer / Decline action presses are handled by notifee.onBackgroundEvent —
 * registered at module top level so the headless JS runtime picks them up.
 */
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiClient } from './api';
import { callService } from './callService';
import { setPushUserId as _sp, CHANNEL_ID as MSG_CHANNEL_ID } from './notifications';
import { requestOpenConversation } from './pushNav';

// @notifee/react-native and expo-task-manager are native — a binary built
// without them (or Expo Go) has no native side, so lazy-require both and
// degrade to "no call UI / no headless task, app still works". The static
// import would throw at module-eval and take the whole app down.
let notifee: any = null;
let AndroidImportance: any = null;
let AndroidCategory: any = null;
let EventType: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('@notifee/react-native');
  notifee = m.default;
  AndroidImportance = m.AndroidImportance;
  AndroidCategory = m.AndroidCategory;
  EventType = m.EventType;
} catch {}

let TaskManager: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  TaskManager = require('expo-task-manager');
} catch {}

export const CALL_CHANNEL_ID = 'wavixa_calls';
const CALL_NOTIF_ID = 'incoming-call';
const BG_TASK = 'WAVIXA_CALL_PUSH_TASK';

/** One-time channel creation (ringtone loop lives on the channel). */
export const initCallChannel = async () => {
  if (!notifee || Platform.OS !== 'android') return;
  try {
    await notifee.createChannel({
      id: CALL_CHANNEL_ID,
      name: 'مكالمات واردة',
      importance: AndroidImportance.HIGH,
      sound: 'ringtone',
      vibration: true,
      vibrationPattern: [300, 700],
      bypassDnd: true,
    });
  } catch {}
};

/** Render the full-screen ringing notification. */
const showIncomingCall = async (d: any) => {
  if (!notifee) return;
  const peer = String(d?.peer || '');
  const caller = String(d?.caller || (peer ? `+${peer}` : 'مكالمة واردة'));
  await notifee.displayNotification({
    id: CALL_NOTIF_ID,
    title: caller,
    body: 'مكالمة صوتية واردة • CareBot',
    data: { type: 'call.incoming', peer, conversation_id: d?.conversation_id ?? '' },
    android: {
      channelId: CALL_CHANNEL_ID,
      category: AndroidCategory.CALL,
      importance: AndroidImportance.HIGH,
      smallIcon: 'notification_icon',
      color: '#00A884',
      ongoing: true,
      autoCancel: false,
      loopSound: true,
      sound: 'ringtone',
      vibrationPattern: [300, 700],
      fullScreenAction: { id: 'default' },
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: '❌ رفض', pressAction: { id: 'decline' } },
        { title: '✅ رد', pressAction: { id: 'answer', launchActivity: 'default' } },
      ],
      // Callers give up quickly — drop the UI instead of ringing forever.
      timeoutAfter: 60000,
      timestamp: Date.now(),
      showTimestamp: false,
    },
  });
};

export const dismissCallNotification = async () => {
  try { await notifee?.cancelNotification(CALL_NOTIF_ID); } catch {}
};

/** The logged-in account owning this device — pushes for other accounts on
 *  a shared phone are ignored. Mirrors notifications.ts setPushUserId. The id
 *  is persisted so the headless task (no React/AuthContext) can filter too. */
let callPushUserId: string | number | null = null;
const PUSH_UID_KEY = 'wavixa_push_user_id';
export const setCallPushUserId = (id: string | number | null) => {
  callPushUserId = id;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (id == null) AsyncStorage.removeItem(PUSH_UID_KEY);
    else AsyncStorage.setItem(PUSH_UID_KEY, String(id));
  } catch {}
  _sp(id);
};

const isForCurrentUser = async (d: any): Promise<boolean> => {
  if (d?.user_id == null) return true;
  let uid = callPushUserId;
  if (uid == null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      uid = await AsyncStorage.getItem(PUSH_UID_KEY);
      if (uid) callPushUserId = uid;
    } catch {}
  }
  return uid == null || String(d.user_id) === String(uid);
};

// ── Actionable message pushes (vc >= 7) ──────────────────────────────
// The backend's version gate sends msg.incoming as DATA-ONLY to builds new
// enough to render it themselves — same headless pipeline that delivers
// incoming calls. The Notifee card gets رد/مقروء actions; the tray entry
// reuses the messages channel + per-conversation tag so lines bundle
// exactly like the server-posted notifications did.
const MSG_NOTIF_PREFIX = 'msg_';

const showMessageNotification = async (d: any) => {
  if (!notifee) return;
  const convId = String(d?.conversation_id ?? '');
  if (!convId) return;
  const tag = String(d?.tag || `conv_${convId}`);
  const title = String(d?.title || 'رسالة جديدة');
  const body = String(d?.body || '');
  await notifee.displayNotification({
    id: `${MSG_NOTIF_PREFIX}${convId}`,
    title,
    body: body.length > 500 ? `${body.slice(0, 500)}…` : body,
    data: { type: 'msg.incoming', conversation_id: convId },
    android: {
      channelId: MSG_CHANNEL_ID,
      tag,
      smallIcon: 'notification_icon',
      color: '#00A884',
      autoCancel: true,
      number: Number(d?.count) || undefined,
      timestamp: Date.now(),
      showTimestamp: true,
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        {
          title: '↩ رد',
          pressAction: { id: 'reply' },
          input: { placeholder: 'اكتب رداً…', allowFreeFormInput: true },
        },
        { title: '✓ مقروء', pressAction: { id: 'mark_read' } },
      ],
    },
  });
};

const MSG_NOTIF_ID = (convId: string | number) => `${MSG_NOTIF_PREFIX}${convId}`;

const handleMessagePushData = async (d: any) => {
  // Foreground: the realtime channel + in-app banner already cover this —
  // don't paint a tray card while the agent is staring at the app.
  if (AppState.currentState === 'active') return;
  await showMessageNotification(d);
};

const handleCallPushData = async (d: any) => {
  if (!(await isForCurrentUser(d))) return;
  if (d?.type === 'call.incoming') await showIncomingCall(d);
  else if (d?.type === 'call.end') await dismissCallNotification();
  else if (d?.type === 'msg.incoming') await handleMessagePushData(d);
};

// Data-only FCM in background/killed state lands in this expo-notifications
// task. Foreground calls ride the realtime WS instead (CallScreen pops directly).
if (Platform.OS === 'android') {
  try {
    TaskManager.defineTask(BG_TASK, async ({ data, error }: any) => {
      if (error) return;
      // Headless payloads arrive as {dataString: '<json>'}; foreground
      // deliveries carry notification.data instead — handle both.
      let payload = data?.notification?.data ?? data;
      if (typeof payload?.dataString === 'string') {
        try { payload = JSON.parse(payload.dataString); } catch {}
      }
      await handleCallPushData(payload);
    });
    Notifications.registerTaskAsync(BG_TASK).catch(() => {});
  } catch {}
}

// Action presses when the app was killed. Call 'answer' also launches the
// activity — the in-app path below confirms it once auth is hydrated.
if (notifee) {
  try {
    notifee.onBackgroundEvent(async ({ type, detail }: any) => {
      const data = detail?.notification?.data;

      // ── Message notification actions ──
      if (data?.type === 'msg.incoming') {
        const convId = String(data?.conversation_id ?? '');
        if (!convId) return;
        const action = detail?.pressAction?.id;
        if (type === EventType?.PRESS) {
          try { await notifee.cancelNotification(MSG_NOTIF_ID(convId)); } catch {}
          requestOpenConversation(convId);
          return;
        }
        if (type !== EventType?.ACTION_PRESS) return;
        if (action === 'reply') {
          const text = String(detail?.input ?? '').trim();
          if (text) {
            try {
              await apiClient.post('/crm/messages/send', {
                conversation_id: Number(convId),
                message: text,
              });
            } catch {}
          }
          // Clear the tray entry — the reply went out, the conversation's
          // unread burst is answered.
          try { await notifee.cancelNotification(MSG_NOTIF_ID(convId)); } catch {}
        } else if (action === 'mark_read') {
          // getMessages without ?peek zeroes unread_count server-side.
          try {
            await apiClient.get(`/crm/conversations/${convId}/messages`, {
              params: { limit: 1 },
            });
          } catch {}
          try { await notifee.cancelNotification(MSG_NOTIF_ID(convId)); } catch {}
        }
        return;
      }

      // ── Call notification actions ──
      if (type !== EventType?.ACTION_PRESS) return;
      const action = detail?.pressAction?.id;
      if (data?.type !== 'call.incoming') return;
      await dismissCallNotification();
      if (action === 'decline') {
        try { await apiClient.post('/crm/call/reject'); } catch {}
      }
    });
  } catch {}
}

// Warm taps on Notifee cards while the app is alive (bg→fg launch) land
// here — route them through the same open-conversation bus.
if (notifee) {
  try {
    notifee.onForegroundEvent(({ type, detail }: any) => {
      const data = detail?.notification?.data;
      if (data?.type !== 'msg.incoming') return;
      if (type === EventType?.PRESS) {
        requestOpenConversation(data?.conversation_id);
      }
    });
  } catch {}
}

/**
 * After the app cold-launches from the call notification (tap or رد):
 * hydrate call state from the bridge and answer if the user pressed رد.
 */
export const handleInitialCallNotification = async () => {
  if (!notifee) return;
  try {
    const initial = await notifee.getInitialNotification();
    const data = initial?.notification?.data;
    // Cold-start tap on a message card → queue the open; cold-start tap on
    // a call card → hydrate the call UI.
    if (data?.type === 'msg.incoming') {
      requestOpenConversation(data?.conversation_id);
      return;
    }
    if (data?.type !== 'call.incoming') return;
    await dismissCallNotification();
    await callService.syncFromBridge();
    if (initial.pressAction?.id === 'answer' && callService.state.phase === 'incoming') {
      callService.answer();
    }
  } catch {}
};

/** Foreground convenience — realtime already drives CallScreen; make sure a
 *  stale notifee entry never lingers once the call is over. */
export const cancelCallNotificationOnIdle = (phase: string) => {
  if (phase === 'idle' || phase === 'active') dismissCallNotification();
};
