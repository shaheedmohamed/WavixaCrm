/**
 * Incoming-message notification sound for the CRM.
 * Synthesized with WebAudio (no audio assets needed, like callTones in call.js).
 * Browsers block AudioContext until a user gesture — initNotifySound() creates
 * the context eagerly and resumes it on the first pointerdown/keydown, so the
 * very first click/keystroke anywhere in the CRM unlocks all future dings.
 */

const STORAGE_KEY = 'crm_notify_sound';
let ctx = null;
let lastPlayAt = 0;
let unlockInstalled = false;

const ensureCtx = () => {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    ctx = null;
  }
  return ctx;
};

export const isSoundEnabled = () => localStorage.getItem(STORAGE_KEY) !== '0';
export const setSoundEnabled = (on) => localStorage.setItem(STORAGE_KEY, on ? '1' : '0');

/** Call once on app mount — creates the context and resumes it on first gesture. */
export const initNotifySound = () => {
  if (unlockInstalled) return;
  unlockInstalled = true;
  ensureCtx(); // created suspended; unlocked by the first user gesture below
  const unlock = () => {
    const c = ensureCtx();
    if (c && c.state !== 'running') c.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
  window.addEventListener('touchend', unlock);
};

const note = (c, at, freq, dur, peak) => {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
};

const ding = (c) => {
  const t = c.currentTime + 0.02;
  // Three-note rising chime — clearly audible over a busy desk.
  note(c, t, 1046.5, 0.09, 0.45);        // C6
  note(c, t + 0.08, 1318.5, 0.11, 0.45); // E6
  note(c, t + 0.16, 1568.0, 0.22, 0.40); // G6
};

/** WhatsApp-style chime for a new incoming message. */
export const playIncomingMessage = () => {
  if (!isSoundEnabled()) return;
  const now = Date.now();
  if (now - lastPlayAt < 800) return; // bursts of messages → single ding
  lastPlayAt = now;
  const c = ensureCtx();
  if (!c) return;
  if (c.state === 'running') {
    ding(c);
    return;
  }
  // Autoplay-blocked: resume and play only if it resolves fast. Scheduling on
  // a suspended (frozen) clock makes the ding fire minutes late on the next
  // click — silent is better than stale.
  c.resume()
    .then(() => {
      if (c.state === 'running' && Date.now() - now < 4000) ding(c);
    })
    .catch(() => {});
};
