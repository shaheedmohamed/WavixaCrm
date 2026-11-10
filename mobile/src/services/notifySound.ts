import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Same 3-note chime (C6-E6-G6) the CRM web synthesizes via WebAudio,
// pre-rendered to a wav so playback is instant and reliable.
const DING = require('../../assets/notify_ding.wav');

let player: ReturnType<typeof createAudioPlayer> | null = null;
let lastPlayAt = 0;
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

/** WhatsApp-style ding for a new incoming message while the app is open. */
export const playIncomingMessage = async () => {
  const now = Date.now();
  if (now - lastPlayAt < 800) return; // bursts → single ding (same as web)
  lastPlayAt = now;
  try {
    await ensureMode();
    if (!player) {
      player = createAudioPlayer(DING);
    }
    player.seekTo(0);
    player.play();
  } catch {}
};
