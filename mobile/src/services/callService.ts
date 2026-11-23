/**
 * Mobile voice calls — mirrors the web CRM's call.js pipeline.
 *
 * Control plane : REST /api/crm/call/* → Laravel → whatsapp-callbridge
 * Audio plane   : dedicated WebSocket (/call-ws → bridge /ws) carrying
 *                 raw PCM16 mono @16 kHz.
 *   uplink   : device mic → PCM16 → binary [0x01|pcm] → bridge → WhatsApp
 *   downlink : WhatsApp → bridge → [0x01|pcm] / {type:'audio',b64} → speaker
 *
 * Capture/playback uses react-native-audio-api (Web Audio for RN):
 *  - AudioBufferQueueSourceNode = gapless streaming playback queue
 *  - AudioRecorder('voiceCommunication') = platform AEC + noise suppression
 * Call state also arrives out-of-band via realtime 'call.event' broadcasts
 * (incoming calls while the app has no call WS open).
 */
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { Alert } from 'react-native';
import { apiClient } from './api';

// react-native-audio-api is a native module — a plain import crashes the
// whole bundle when the running binary predates the library (Expo Go, old
// builds). Lazy-require keeps the app alive; calls report a clear error.
let RNAudioContext: any = null;
let RNAudioRecorder: any = null;
let RNAudioManager: any = null;
let RNAUDIO_AVAILABLE = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const m = require('react-native-audio-api');
  RNAudioContext = m.AudioContext;
  RNAudioRecorder = m.AudioRecorder;
  RNAudioManager = m.AudioManager;
  RNAUDIO_AVAILABLE = !!(RNAudioContext && RNAudioRecorder);
} catch {}

export type CallPhase =
  | 'idle' | 'dialing' | 'ringing' | 'connecting' | 'active' | 'incoming';

export interface CallState {
  phase: CallPhase;
  peer: string | null;      // digits (or @g.us group id)
  peerLabel: string | null; // display name resolved by the caller
  direction: 'in' | 'out' | null;
  muted: boolean;
  speakerOn: boolean;
  startedAt: number | null; // ms epoch when the call went active
  error: string | null;
}

const INITIAL: CallState = {
  phase: 'idle',
  peer: null,
  peerLabel: null,
  direction: null,
  muted: false,
  speakerOn: false,
  startedAt: null,
  error: null,
};

// ---------------------------------------------------------------------------
// base64 → Uint8Array (no Buffer in RN hermes)
// ---------------------------------------------------------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const t = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();
function b64ToU8(b64: string): Uint8Array {
  const len = b64.replace(/=+$/, '').length;
  const out = new Uint8Array((len * 3) >> 2);
  let o = 0;
  for (let i = 0; i < len; i += 4) {
    const n =
      (B64_LOOKUP[b64.charCodeAt(i)] << 18) |
      (B64_LOOKUP[b64.charCodeAt(i + 1)] << 12) |
      ((B64_LOOKUP[b64.charCodeAt(i + 2)] || 0) << 6) |
      (B64_LOOKUP[b64.charCodeAt(i + 3)] || 0);
    out[o++] = (n >> 16) & 0xff;
    if (o < out.length) out[o++] = (n >> 8) & 0xff;
    if (o < out.length) out[o++] = n & 0xff;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Audio plumbing
// ---------------------------------------------------------------------------
class CallAudio {
  ws: WebSocket | null = null;
  muted = false;
  onEvent: ((m: any) => void) | null = null;

  private playCtx: any = null;
  private playNode: any = null; // AudioBufferQueueSourceNode
  private recorder: any = null;
  private sendBuf = new Float32Array(1600);
  private sendLen = 0;

  async connect() {
    const { data } = await apiClient.post('/crm/call/ws-ticket');
    if (!data?.ok) throw new Error(data?.err || 'ws ticket failed');
    const ws = new WebSocket(`${data.url}?ticket=${data.ticket}`);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => {
      const d = ev.data;
      // binary downlink: [0x01|PCM16]; 0x02/0x03 are video — voice calls ignore
      if (d instanceof ArrayBuffer) {
        const u8 = new Uint8Array(d);
        if (u8.length < 2) return;
        if (u8[0] === 2 || u8[0] === 3) return;
        const pcm = u8[0] === 1 ? d.slice(1) : d;
        this.play(new Int16Array(pcm), 16000);
        return;
      }
      // RN may hand us base64 strings for binary frames
      if (typeof d === 'string' && d.length > 0 && d[0] !== '{') {
        const u8 = b64ToU8(d);
        if (u8.length > 1 && u8[0] === 1) {
          this.play(new Int16Array(u8.slice(1).buffer), 16000);
        }
        return;
      }
      let m: any;
      try { m = JSON.parse(d as string); } catch { return; }
      if (m.type === 'audio' && m.b64) {
        const u8 = b64ToU8(m.b64);
        this.play(new Int16Array(u8.buffer.slice(0)), m.sr || 16000);
      } else if (m.type === 'event' || m.type === 'state' || m.type === 'ack' || m.type === 'error') {
        this.onEvent?.(m);
      }
    };
    return new Promise<void>((res, rej) => {
      ws.onopen = () => res();
      ws.onerror = () => rej(new Error('ws connect failed'));
      ws.onclose = () => rej(new Error('ws closed'));
    });
  }

  /** Playback side — gapless queue of resampled PCM at the ctx rate. */
  ensurePlayback() {
    if (this.playCtx && this.playNode) return;
    try {
      this.playCtx = new RNAudioContext();
      this.playNode = this.playCtx.createBufferQueueSource();
      this.playNode.connect(this.playCtx.destination);
      this.playNode.start();
    } catch {}
  }

  /** PCM16 @srcRate → Float32 @ctx rate, enqueued for gapless playback. */
  play(i16: Int16Array, srcRate: number) {
    if (!this.playCtx || !this.playNode || i16.length === 0) return;
    try {
      const dstRate = this.playCtx.sampleRate;
      const ratio = srcRate / dstRate;
      const n = i16.length;
      const outLen = Math.max(1, Math.floor(n / ratio));
      const f = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const i0 = Math.min(n - 1, Math.floor(pos));
        const i1 = Math.min(n - 1, i0 + 1);
        f[i] = (i16[i0] + (i16[i1] - i16[i0]) * (pos - i0)) / 32768;
      }
      const buf = this.playCtx.createBuffer(1, outLen, dstRate);
      buf.getChannelData(0).set(f);
      this.playNode.enqueueBuffer(buf);
    } catch {}
  }

  /** Mic → WS. Requested 16 kHz mono; resample defensively if the
   *  device delivers another rate. Chunks coalesce into ~20 ms frames. */
  async startMic() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) throw new Error('mic permission denied');
    const rec = new RNAudioRecorder({ androidInputPreset: 'voiceCommunication' });
    this.recorder = rec;
    const inRate = 16000; // requested rate — event buffers should already match
    rec.onAudioReady(
      { sampleRate: inRate, bufferLength: 640, channelCount: 1 },
      (event: any) => {
        try {
          const buf = event?.buffer;
          if (!buf) return;
          const f: Float32Array = buf.getChannelData(0);
          const rate = buf.sampleRate || inRate;
          this.push(f, rate);
        } catch {}
      }
    );
    await rec.start();
  }

  /** Accumulate Float32 samples → PCM16@16k frames (~20 ms) → binary send. */
  private push(f: Float32Array, inRate: number) {
    if (this.muted || !this.ws || this.ws.readyState !== 1) return;
    const ratio = inRate / 16000;
    const outLen = Math.floor(f.length / ratio);
    for (let i = 0; i < outLen; i++) {
      if (this.sendLen >= this.sendBuf.length) this.flush();
      const pos = i * ratio;
      const i0 = Math.min(f.length - 1, Math.floor(pos));
      const i1 = Math.min(f.length - 1, i0 + 1);
      this.sendBuf[this.sendLen++] = f[i0] + (f[i1] - f[i0]) * (pos - i0);
    }
    if (this.sendLen >= 320) this.flush(); // ~20 ms @16k
  }

  private flush() {
    if (!this.sendLen || !this.ws || this.ws.readyState !== 1) return;
    const i16 = new Int16Array(this.sendLen);
    for (let i = 0; i < this.sendLen; i++) {
      const s = Math.max(-1, Math.min(1, this.sendBuf[i]));
      i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const frame = new Uint8Array(i16.byteLength + 1);
    frame[0] = 1; // 0x01 = PCM16 audio
    frame.set(new Uint8Array(i16.buffer), 1);
    try { this.ws.send(frame.buffer); } catch {}
    this.sendLen = 0;
    this.sendBuf = new Float32Array(1600);
  }

  async stop() {
    try { await this.recorder?.stop(); } catch {}
    this.recorder = null;
    try { this.playNode?.stop(); } catch {}
    try { await this.playCtx?.close(); } catch {}
    this.playCtx = null;
    this.playNode = null;
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}

// ---------------------------------------------------------------------------
// Synthesized call tones (port of the web makeLoop, no assets needed)
// ---------------------------------------------------------------------------
type ToneSpec = { f: number; onMs: number; offMs: number };
let _toneCtx: any = null;
let _toneNodes: any[] = [];

function startTone(spec: ToneSpec[], cycleMs: number) {
  stopTone();
  try {
    const ctx = new RNAudioContext();
    _toneCtx = ctx;
    const sr = ctx.sampleRate;
    const n = Math.round((sr * cycleMs) / 1000);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    let t = 0;
    for (const b of spec) {
      const start = Math.round((sr * t) / 1000);
      const len = Math.round((sr * b.onMs) / 1000);
      for (let i = 0; i < len && start + i < n; i++) {
        const edge = Math.min(1, Math.min(i, len - i) / (sr * 0.004));
        d[start + i] = Math.sin((2 * Math.PI * b.f * i) / sr) * 0.5 * edge * edge;
      }
      t += b.onMs + b.offMs;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.4;
    src.connect(g);
    g.connect(ctx.destination);
    src.start();
    _toneNodes = [src];
  } catch {}
}

function stopTone() {
  for (const n of _toneNodes) { try { n.stop(); } catch {} }
  _toneNodes = [];
  try { _toneCtx?.close(); } catch {}
  _toneCtx = null;
}

// ---------------------------------------------------------------------------
// Call manager singleton
// ---------------------------------------------------------------------------
type Listener = (s: CallState) => void;

class CallService {
  state: CallState = INITIAL;
  private audio = new CallAudio();
  private listeners = new Set<Listener>();
  private mediaStarted = false;

  constructor() {
    this.audio.onEvent = (m) => this.onBridgeEvent(m);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => { try { fn(this.state); } catch {} });
  }

  private async ensureMedia() {
    this.audio.ensurePlayback();
    if (!RNAUDIO_AVAILABLE) {
      throw new Error('needs-build');
    }
    if (this.mediaStarted) return;
    this.mediaStarted = true;
    try {
      await this.audio.connect();
      await this.audio.startMic();
      await RNAudioManager.setCommunicationDevice('earpiece').catch(() => {});
    } catch (e) {
      this.mediaStarted = false;
      throw e;
    }
  }

  // -- control ---------------------------------------------------------------
  async dial(to: string, peerLabel?: string | null) {
    if (this.state.phase !== 'idle') return;
    this.set({
      phase: 'dialing', peer: to, peerLabel: peerLabel || `+${to}`,
      direction: 'out', error: null, startedAt: null, muted: false,
    });
    try {
      if (!RNAUDIO_AVAILABLE) {
        this.set(INITIAL);
        Alert.alert('المكالمات', 'المكالمات الصوتية تحتاج تحديث التطبيق لآخر إصدار');
        return;
      }
      // open the audio pipe in parallel with the REST dial walk (10-40 s)
      this.ensureMedia().catch(() => {});
      const res = await apiClient.post('/crm/call/dial', { to });
      if (!res.data?.ok) {
        await this.teardown();
        this.set(INITIAL);
        Alert.alert('فشل المكالمة', res.data?.err || 'فشل بدء المكالمة');
        return;
      }
    } catch (e: any) {
      await this.teardown();
      this.set(INITIAL);
      Alert.alert('فشل المكالمة', e.response?.data?.err || e.response?.data?.message || 'فشل بدء المكالمة');
    }
  }

  async answer() {
    if (this.state.phase !== 'incoming') return;
    stopTone();
    this.set({ phase: 'connecting' });
    try {
      if (!RNAUDIO_AVAILABLE) {
        await apiClient.post('/crm/call/reject').catch(() => {});
        await this.teardown();
        this.set(INITIAL);
        Alert.alert('المكالمات', 'المكالمات الصوتية تحتاج تحديث التطبيق لآخر إصدار');
        return;
      }
      await this.ensureMedia();
      await apiClient.post('/crm/call/answer');
    } catch (e: any) {
      await this.teardown();
      this.set(INITIAL);
      Alert.alert('فشل المكالمة', e.response?.data?.message || 'تعذر الرد');
    }
  }

  async reject() {
    stopTone();
    try { await apiClient.post('/crm/call/reject'); } catch {}
    await this.teardown();
    this.set(INITIAL);
  }

  async hangup() {
    try { await apiClient.post('/crm/call/hangup'); } catch {}
    await this.teardown();
    this.set(INITIAL);
  }

  async toggleMute(): Promise<boolean> {
    const next = !this.state.muted;
    this.audio.muted = next;
    this.set({ muted: next });
    try { await apiClient.post('/crm/call/mute', { mute: next }); } catch {}
    return next;
  }

  async toggleSpeaker(): Promise<boolean> {
    const next = !this.state.speakerOn;
    this.set({ speakerOn: next });
    try {
      await RNAudioManager.setCommunicationDevice(next ? 'speaker' : 'earpiece');
    } catch {}
    return next;
  }

  // -- events -----------------------------------------------------------------
  /** Bridge WS frames ({type:'state'|'event', callState, peer, ...}) */
  private onBridgeEvent(m: any) {
    const s = m.callState;
    if (!s) return;
    this.applyPhase(s, m.peer);
  }

  /** Realtime broadcast (incoming calls while no WS is open). */
  handleRealtimeEvent(data: any) {
    if (!data?.callState) return;
    this.applyPhase(data.callState, data.peer);
  }

  /**
   * Hydrate from the bridge's live state — used when the app cold-launches
   * from the incoming-call notification so CallScreen renders 'incoming'
   * even though no realtime/WS event was seen this session.
   */
  async syncFromBridge() {
    try {
      const { data } = await apiClient.get('/crm/call/state');
      if (data?.callState && data.callState !== 'idle') {
        this.applyPhase(data.callState === 'ringing' && data.peer && this.state.phase === 'idle'
          ? 'incoming' : data.callState, data.peer);
      }
    } catch {}
  }

  private applyPhase(s: string, peer?: string | null) {
    if (s === 'active') {
      stopTone();
      if (this.state.phase !== 'active') {
        this.set({ phase: 'active', startedAt: Date.now(), muted: this.audio.muted });
      }
      return;
    }
    if (s === 'idle') {
      stopTone();
      // keep the error (if any) for the UI to flash
      this.teardown();
      this.set({ ...INITIAL, error: this.state.error });
      return;
    }
    if (s === 'incoming' && this.state.phase === 'idle') {
      startTone(
        [{ f: 700, onMs: 200, offMs: 100 }, { f: 900, onMs: 200, offMs: 0 }],
        1600
      );
      this.audio.ensurePlayback();
      this.set({
        phase: 'incoming', peer: peer || this.state.peer,
        peerLabel: peer ? `+${peer}` : this.state.peerLabel,
        direction: 'in', startedAt: null, muted: false,
      });
      return;
    }
    if (s === 'ringing' || s === 'dialing' || s === 'connecting') {
      if (this.state.phase === 'dialing' || this.state.phase === 'connecting') {
        if (s === 'ringing' && this.state.phase === 'dialing') {
          startTone([{ f: 440, onMs: 380, offMs: 220 }, { f: 440, onMs: 380, offMs: 0 }], 3200);
        }
        this.set({ phase: s as CallPhase, peer: peer || this.state.peer });
      } else if (s === 'ringing' && this.state.phase === 'incoming') {
        // remote side still ringing — keep incoming UI
      }
    }
  }

  private async teardown() {
    stopTone();
    this.mediaStarted = false;
    this.audio.muted = false;
    await this.audio.stop();
    try { await RNAudioManager.setCommunicationDevice('systemDefault'); } catch {}
  }
}

export const callService = new CallService();
