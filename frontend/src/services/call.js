/**
 * CRM voice-call service — talks to the WhatsApp call bridge.
 *
 * Control goes through Laravel (/api/crm/call/*). Live audio rides a dedicated
 * WebSocket (nginx /call-ws → bridge :3999/ws) carrying PCM16 mono chunks:
 *   uplink   : browser mic → 16 kHz PCM → {type:'mic'} → bridge → WhatsApp
 *   downlink : WhatsApp → bridge → {type:'audio', sr} → speaker
 */
import axios from 'axios';
import crm from './crm';

const API = `${import.meta.env.VITE_API_BASE_URL || '/api'}/crm/call`;

function api() {
  return axios.create({ headers: { Authorization: `Bearer ${crm.getToken()}` } });
}

// ---------------------------------------------------------------------------
// Audio pipeline — AudioWorklet on the real-time audio thread (ScriptProcessor
// runs on the main thread and jitters badly under load → choppy audio)
// ---------------------------------------------------------------------------
const CRM_WORKLET = `
  class CRMic extends AudioWorkletProcessor {
    constructor(){ super(); this.buf=new Float32Array(2048); this.n=0; }
    process(i,o){ const f=i[0]&&i[0][0]; if(f){ for(let k=0;k<f.length;k++){ this.buf[this.n++]=f[k]; if(this.n>=this.buf.length){ this.port.postMessage(this.buf.slice(0)); this.n=0; } } } return true; }
  }
  class CRPlay extends AudioWorkletProcessor {
    constructor(){
      super(); this.q=[]; this.last=null; this.g=0;
      this.port.onmessage=(e)=>{ const c=e.data; if(c&&c.length)this.q.push(c);
        let t=0; for(const x of this.q)t+=x.length;
        while(t>48000&&this.q.length){ t-=this.q[0].length; this.q.shift(); } };
    }
    process(i,o){
      const out=o[0][0]; let idx=0; const q=this.q;
      while(idx<out.length&&q.length){ const c=q[0]; const n=Math.min(c.length,out.length-idx); out.set(c.subarray(0,n),idx); idx+=n; q[0]=c.subarray(n); if(!q[0].length)q.shift(); }
      if(idx===0&&out.length){ if(this.last&&this.g>0.05){ for(let j=0;j<out.length;j++)out[j]=this.last[j]*this.g; this.g*=0.85; } }
      else if(idx>0){ this.last=out.slice(); this.g=0.6; }
      return true;
    }
  }
  registerProcessor('cr-mic', CRMic);
  registerProcessor('cr-play', CRPlay);
`;

class CallAudio {
  constructor() {
    this.ws = null;
    this.micCtx = null;
    this.playCtx = null;
    this.playQueue = [];
    this.muted = false;
    this.onEvent = null;
    this._workletUrl = null;
  }

  _loadWorklet(ctx) {
    if (!this._workletUrl) {
      this._workletUrl = URL.createObjectURL(new Blob([CRM_WORKLET], { type: 'application/javascript' }));
    }
    return ctx.audioWorklet.addModule(this._workletUrl);
  }

  async connect() {
    const { data } = await api().post(`${API}/ws-ticket`);
    const ws = new WebSocket(`${data.url}?ticket=${data.ticket}`);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => {
      // binary frames: [0x01|PCM16 audio] [0x02|JPEG remote video];
      // untagged buffers are legacy PCM audio.
      if (ev.data instanceof ArrayBuffer) {
        const u8 = new Uint8Array(ev.data);
        if (u8[0] === 2) { this._pushRemoteVideo(u8.slice(1)); return; }
        if (u8[0] === 3) { this._pushRemoteH264(u8.subarray(1)); return; }
        if (u8[0] === 1) { this.enqueuePlay(u8.slice(1).buffer, 16000); return; }
        this.enqueuePlay(ev.data, 16000);
        return;
      }
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'audio') this.enqueuePlay(m.b64, m.sr);
      else if (m.type === 'event' || m.type === 'state' || m.type === 'ack') this.onEvent && this.onEvent(m);
    };
    return new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = rej;
    });
  }

  /** start capturing the agent mic and start the playback pump */
  async startMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.micStream = stream;
    this.micCtx = new AudioContext();
    const src = this.micCtx.createMediaStreamSource(stream);
    const inRate = this.micCtx.sampleRate;
    const sendBlock = (f) => {
      if (this.muted || !this.ws || this.ws.readyState !== 1) return;
      // downsample to 16 kHz with linear interpolation
      const ratio = inRate / 16000;
      const outLen = Math.floor(f.length / ratio);
      const i16 = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const pos = i * ratio;
        const i0 = Math.min(f.length - 1, Math.floor(pos));
        const i1 = Math.min(f.length - 1, i0 + 1);
        const s = Math.max(-1, Math.min(1, f[i0] + (f[i1] - f[i0]) * (pos - i0)));
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      const frame = new Uint8Array(i16.byteLength + 1); // tag 0x01 = audio
      frame[0] = 1; frame.set(new Uint8Array(i16.buffer), 1);
      this.ws.send(frame.buffer); // binary frame → bridge → WhatsApp page
    };
    try {
      await this._loadWorklet(this.micCtx);
      const node = new AudioWorkletNode(this.micCtx, 'cr-mic', { numberOfInputs: 1, numberOfOutputs: 1 });
      node.port.onmessage = (e) => sendBlock(e.data);
      src.connect(node);
      node.connect(this.micCtx.destination); // silent output — keeps it pulled
      this.micProc = node;
    } catch (e) {
      const proc = this.micCtx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e2) => sendBlock(e2.inputBuffer.getChannelData(0));
      src.connect(proc);
      proc.connect(this.micCtx.destination);
      this.micProc = proc;
    }
    this.micSrc = src;

    // playback side
    this.playCtx = this.playCtx || new AudioContext();
    if (this.playCtx.state === 'suspended') this.playCtx.resume();
    if (!this.playProc) {
      try {
        await this._loadWorklet(this.playCtx);
        const node = new AudioWorkletNode(this.playCtx, 'cr-play', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
        node.connect(this.playCtx.destination);
        this.playProc = node;
        this._playPost = (f) => node.port.postMessage(f);
      } catch (e) {
        this.lastPlayChunk = null;
        this.plcGain = 0;
        const out = this.playCtx.createScriptProcessor(4096, 0, 1);
        out.onaudioprocess = (e2) => {
          const buf = e2.outputBuffer.getChannelData(0);
          const q = this.playQueue;
          let i = 0;
          while (i < buf.length && q.length) {
            const chunk = q[0];
            const n = Math.min(chunk.data.length - chunk.pos, buf.length - i);
            buf.set(chunk.data.subarray(chunk.pos, chunk.pos + n), i);
            i += n;
            chunk.pos += n;
            if (chunk.pos >= chunk.data.length) q.shift();
          }
          if (i === 0) {
            if (this.lastPlayChunk && this.plcGain > 0.05) {
              const n = Math.min(buf.length, this.lastPlayChunk.length);
              for (let j = 0; j < n; j++) buf[j] = this.lastPlayChunk[j] * this.plcGain;
              this.plcGain *= 0.7;
            }
          } else {
            this.lastPlayChunk = buf.slice();
            this.plcGain = 0.6;
          }
          if (q.length > 10) q.splice(0, q.length - 10);
        };
        out.connect(this.playCtx.destination);
        this.playProc = out;
        this._playPost = (f) => this.playQueue.push({ data: f, pos: 0 });
      }
    }
  }

  enqueuePlay(data, sr) {
    if (!this.playCtx) return;
    const i16 = data instanceof ArrayBuffer
      ? new Int16Array(data)
      : (() => { const bin = atob(data); const a = new Int16Array(bin.length >> 1); for (let i = 0; i < a.length; i++) a[i] = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) << 16 >> 16; return a; })();
    const n = i16.length;
    const dstRate = this.playCtx.sampleRate;
    const ratio = sr / dstRate;
    const outLen = Math.floor(n / ratio);
    const f = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i0 = Math.min(n - 1, Math.floor(pos));
      const i1 = Math.min(n - 1, i0 + 1);
      const fr = pos - i0;
      const a = i16[i0];
      const b = i16[i1];
      f[i] = (a + (b - a) * fr) / 32768;
    }
    if (this._playPost) this._playPost(f);
    else this.playQueue.push({ data: f, pos: 0 });
  }

  setMuted(m) { this.muted = m; }

  // ------------------------------------------------------------------
  // Video — agent camera → H.264 (WebCodecs, tag 0x03) → bridge fake camera;
  // remote H.264 → decoder → remoteVideoCanvas → <video srcObject>.
  // JPEG frames (tag 0x02) stay as fallback for browsers without WebCodecs.
  // ------------------------------------------------------------------
  async startVideo() {
    if (this.camStream) return;
    this.camStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20 } },
    });
    this.camOn = true;
    this.camVideo = document.createElement('video');
    this.camVideo.muted = true;
    this.camVideo.playsInline = true;
    this.camVideo.srcObject = this.camStream;
    await this.camVideo.play().catch(() => {});

    if (typeof VideoEncoder === 'function') {
      try {
        this.venc = new VideoEncoder({
          output: (chunk) => {
            try {
              if (!this.ws || this.ws.readyState !== 1) return;
              const b = new Uint8Array(chunk.byteLength);
              chunk.copyTo(b);
              const f = new Uint8Array(b.length + 10);
              f[0] = 3; // h264 camera chunk
              f[1] = chunk.type === 'key' ? 1 : 0;
              new DataView(f.buffer).setBigUint64(2, BigInt(chunk.timestamp || 0));
              f.set(b, 10);
              this.ws.send(f.buffer);
            } catch (e) {}
          },
          error: () => {},
        });
        this.venc.configure({
          codec: 'avc1.42001f', width: 640, height: 360,
          bitrate: 350000, framerate: 20, latencyMode: 'realtime',
          avc: { format: 'annexb' },
        });
        let n = 0;
        const tick = () => {
          if (!this.camStream) return;
          try {
            if (this.camOn && this.venc.state === 'configured' && this.venc.encodeQueueSize < 8
                && this.camVideo.readyState >= 2) {
              this.venc.encode(
                new VideoFrame(this.camVideo, { timestamp: Math.round(performance.now() * 1000) }),
                { keyFrame: n++ % 40 === 0 },
              );
            }
          } catch (e) {}
          this._camTimer = setTimeout(tick, 50); // ~20fps
        };
        tick();
        return;
      } catch (e) { try { this.venc && this.venc.close(); } catch (_) {} this.venc = null; }
    }

    // JPEG fallback
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 270;
    const cx = cv.getContext('2d');
    const tickJpeg = async () => {
      if (!this.camStream) return;
      try {
        if (this.camOn && this.ws && this.ws.readyState === 1 && this.camVideo.readyState >= 2) {
          cx.drawImage(this.camVideo, 0, 0, 480, 270);
          const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.55));
          if (blob) {
            const buf = await blob.arrayBuffer();
            const f = new Uint8Array(buf.byteLength + 1);
            f[0] = 2; f.set(new Uint8Array(buf), 1);
            this.ws.send(f);
          }
        }
      } catch (e) {}
      this._camTimer = setTimeout(tickJpeg, 90);
    };
    tickJpeg();
  }

  setCamOn(on) {
    this.camOn = !!on;
    const t = this.camStream && this.camStream.getVideoTracks()[0];
    if (t) t.enabled = this.camOn;
  }

  /** H.264 remote chunk (tag 0x03 payload: flags|ts|data) → decode → canvas */
  _pushRemoteH264(u8) {
    if (typeof VideoDecoder !== 'function') return;
    if (!this.remoteVideoCanvas) {
      this.remoteVideoCanvas = document.createElement('canvas');
      this.remoteVideoCanvas.width = 640;
      this.remoteVideoCanvas.height = 360;
      this._rvCtx = this.remoteVideoCanvas.getContext('2d');
      this._rvCtx.fillStyle = '#000';
      this._rvCtx.fillRect(0, 0, 640, 360);
      this.remoteStream = this.remoteVideoCanvas.captureStream(20);
    }
    if (!this.vdec) {
      try {
        this.vdec = new VideoDecoder({
          output: (frame) => {
            try {
              const sc = Math.min(640 / frame.displayWidth, 360 / frame.displayHeight);
              const dw = frame.displayWidth * sc, dh = frame.displayHeight * sc;
              this._rvCtx.fillStyle = '#000';
              this._rvCtx.fillRect(0, 0, 640, 360);
              this._rvCtx.drawImage(frame, (640 - dw) / 2, (360 - dh) / 2, dw, dh);
            } catch (e) {}
            frame.close();
          },
          error: () => {},
        });
        this.vdec.configure({ codec: 'avc1.42001f', optimizeForLatency: true });
        this._vdecKey = false;
      } catch (e) { this.vdec = null; return; }
    }
    try {
      const flags = u8[0];
      if (!this._vdecKey && !(flags & 1)) return; // wait for a keyframe
      const ts = Number(new DataView(u8.buffer, u8.byteOffset).getBigUint64(1));
      this.vdec.decode(new EncodedVideoChunk({ type: flags & 1 ? 'key' : 'delta', timestamp: ts, data: u8.subarray(9) }));
      if (flags & 1) this._vdecKey = true;
    } catch (e) {}
  }

  _pushRemoteVideo(u8) {
    if (!this.remoteVideoCanvas) {
      this.remoteVideoCanvas = document.createElement('canvas');
      this.remoteVideoCanvas.width = 640;
      this.remoteVideoCanvas.height = 360;
      this._rvCtx = this.remoteVideoCanvas.getContext('2d');
      this._rvCtx.fillStyle = '#000';
      this._rvCtx.fillRect(0, 0, 640, 360);
      this.remoteStream = this.remoteVideoCanvas.captureStream(12);
    }
    createImageBitmap(new Blob([u8], { type: 'image/jpeg' }))
      .then((bmp) => {
        const ctx = this._rvCtx;
        const sc = Math.min(640 / bmp.width, 360 / bmp.height);
        const dw = bmp.width * sc, dh = bmp.height * sc;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 360);
        ctx.drawImage(bmp, (640 - dw) / 2, (360 - dh) / 2, dw, dh);
        bmp.close();
      })
      .catch(() => {});
  }

  stopVideo() {
    this.camOn = false;
    clearTimeout(this._camTimer);
    try { this.camStream && this.camStream.getTracks().forEach((t) => t.stop()); } catch {}
    try { this.venc && this.venc.state !== 'closed' && this.venc.close(); } catch {}
    try { this.vdec && this.vdec.state !== 'closed' && this.vdec.close(); } catch {}
    this.venc = this.vdec = null;
    this._vdecKey = false;
    this.camStream = this.camVideo = null;
    this._camTimer = null;
    this.remoteVideoCanvas = this._rvCtx = this.remoteStream = null;
  }

  stopMedia() {
    this.stopVideo();
    try { this.micProc && this.micProc.disconnect(); } catch {}
    try { this.micSrc && this.micSrc.disconnect(); } catch {}
    try { this.micStream && this.micStream.getTracks().forEach(t => t.stop()); } catch {}
    try { this.micCtx && this.micCtx.close(); } catch {}
    this.micCtx = this.micProc = this.micSrc = this.micStream = null;
  }

  close() {
    this.stopMedia();
    try { this.playProc && this.playProc.disconnect(); } catch {}
    try { this.playCtx && this.playCtx.close(); } catch {}
    this.playCtx = this.playProc = null;
    this._playPost = null;
    this.playQueue = [];
    try { this.ws && this.ws.close(); } catch {}
    this.ws = null;
  }
}

export const callAudio = new CallAudio();

// ---------------------------------------------------------------------------
// Synthesized call tones (no assets needed)
// ---------------------------------------------------------------------------
function makeLoop(spec, cycleMs) {
  // spec: [{f, onMs, offMs}, ...] beeps rendered into a looping AudioBuffer
  const ctx = new AudioContext();
  const sr = ctx.sampleRate;
  const n = Math.round(sr * cycleMs / 1000);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  let t = 0;
  for (const b of spec) {
    const start = Math.round(sr * t / 1000);
    const len = Math.round(sr * b.onMs / 1000);
    for (let i = 0; i < len && start + i < n; i++) {
      // 4 ms raised-cosine edges — no clicks
      const edge = Math.min(1, Math.min(i, len - i) / (sr * 0.004));
      d[start + i] = Math.sin(2 * Math.PI * b.f * i / sr) * 0.5 * edge * edge;
    }
    t += b.onMs + b.offMs;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const g = ctx.createGain(); g.gain.value = 0.4;
  src.connect(g); g.connect(ctx.destination);
  src.start();
  return { ctx, src, stop() { try { src.stop(); } catch {} try { ctx.close(); } catch {} } };
}

let _tone = null;
export const callTones = {
  /** outgoing "dialing/connecting" pattern — two soft beeps, real ringback
   *  takes over via downlink once the call is ringing */
  ringback() {
    this.stop();
    _tone = makeLoop([{ f: 440, onMs: 380, offMs: 220 }, { f: 440, onMs: 380, offMs: 0 }], 3200);
  },
  /** incoming-call ringtone — classic two-tone loop */
  ringtone() {
    this.stop();
    _tone = makeLoop([{ f: 700, onMs: 200, offMs: 100 }, { f: 900, onMs: 200, offMs: 0 }], 1600);
  },
  stop() { if (_tone) { _tone.stop(); _tone = null; } },
};

// ---------------------------------------------------------------------------
// REST control
// ---------------------------------------------------------------------------
export const callApi = {
  state: () => api().get(`${API}/state`).then(r => r.data),
  dial: (to, video = false) => api().post(`${API}/dial`, { to, video }).then(r => r.data),
  answer: () => api().post(`${API}/answer`).then(r => r.data),
  reject: () => api().post(`${API}/reject`).then(r => r.data),
  hangup: () => api().post(`${API}/hangup`).then(r => r.data),
  mute: (mute) => api().post(`${API}/mute`, { mute }).then(r => r.data),
};
