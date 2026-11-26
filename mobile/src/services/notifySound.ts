import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// WhatsApp message tone — incoming message while INSIDE the open chat.
const CHAT_TONE = require('../../assets/chat_incoming.wav');
// iPhone-style notification tone — incoming message alert while the app
// is open on another screen (chat list etc). Same family as the push
// notification sound so in-app and tray alerts match.
const NOTIFY_TONE = require('../../assets/notify_tone.wav');

type Player = ReturnType<typeof createAudioPlayer>;
const players: Partial<Record<'chat' | 'notify', Player>> = {};
const lastPlayAt: Record<'chat' | 'notify', number> = { chat: 0, notify: 0 };
let audioModeSet = false;

const ensureMode = async () => {
  if (audioModeSet) return;
  audioModeSet = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    });
  } catch {}
};

const play = async (kind: 'chat' | 'notify') => {
  const now = Date.now();
  if (now - lastPlayAt[kind] < 800) return; // bursts → single sound
  lastPlayAt[kind] = now;
  try {
    await ensureMode();
    // Fresh player per play: a finished player left at the end position can
    // silently no-op when play() races seekTo(0) on Android.
    const old = players[kind];
    const player = createAudioPlayer(kind === 'chat' ? CHAT_TONE : NOTIFY_TONE);
    players[kind] = player;
    player.play();
    old?.remove();
  } catch {}
};

/** Incoming message while the user is inside that chat — WhatsApp tone. */
export const playChatIncoming = () => play('chat');

/** Incoming message while the app is open on another screen — notification tone. */
export const playIncomingMessage = () => play('notify');
