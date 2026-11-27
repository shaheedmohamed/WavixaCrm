/**
 * Minimal Laravel Reverb (Pusher-protocol) client for the mobile app.
 *
 * The CRM backend broadcasts `crm.event` on private channel `crm.{ownerId}`
 * through Reverb (nginx /reverb/app → 127.0.0.1:8090). We only need
 * subscribe + dispatch, so a hand-rolled client avoids pulling in pusher-js.
 *
 * Channel auth: POST /api/crm/broadcasting/auth {socket_id, channel_name}.
 */
import { apiClient } from './api';
import { Config } from '../constants/config';
import { User } from '../types/crm';

type RealtimeEvent = { type: string; data: any };
type Listener = (ev: RealtimeEvent) => void;

const REVERB_KEY = 'ddaee3e38fe685f64ec6'; // same app key the SPA uses
const PROTOCOL_VERSION = '7';

function wsUrl(): string {
  const host = Config.API_BASE_URL.replace(/^https?:\/\//, '').replace(/\/api\/?$/, '');
  const scheme = Config.API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
  return `${scheme}://${host}/reverb/app/${REVERB_KEY}?protocol=${PROTOCOL_VERSION}&client=js&version=8.4.0`;
}

export function ownerIdFor(user: User | null): number | null {
  if (!user) return null;
  return user.crm_role === 'agent' && user.crm_parent_id
    ? user.crm_parent_id
    : user.id;
}

class RealtimeClient {
  private ws: WebSocket | null = null;
  private socketId: string | null = null;
  private channel: string | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: any = null;
  private attempts = 0;
  private stopped = true;

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  start(user: User) {
    const ownerId = ownerIdFor(user);
    if (!ownerId) return;
    this.channel = `private-crm.${ownerId}`;
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try { this.ws?.close(); } catch {}
    this.ws = null;
    this.socketId = null;
  }

  /** Foreground-return nudge: if the socket died while suspended, reconnect
   *  now instead of waiting out the backoff timer; if it's alive this is a
   *  no-op. */
  kick() {
    if (this.stopped || !this.channel) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.attempts = 0;
    this.open();
  }

  private open() {
    if (this.stopped || !this.channel) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => { this.attempts = 0; };

    ws.onmessage = async (ev) => {
      let m: any;
      try { m = JSON.parse(ev.data as string); } catch { return; }

      if (m.event === 'pusher:connection_established') {
        try {
          const data = typeof m.data === 'string' ? JSON.parse(m.data) : m.data;
          this.socketId = data?.socket_id;
          await this.subscribe();
        } catch {}
        return;
      }
      if (m.event === 'pusher:ping') {
        try { ws.send(JSON.stringify({ event: 'pusher:pong' })); } catch {}
        return;
      }
      if (m.event === 'pusher_internal:subscription_succeeded') return;
      if (m.event === 'pusher:error' || m.event === 'pusher:subscription_error') {
        try { ws.close(); } catch {}
        return;
      }
      // crm.event — payload: {type, data}
      if (m.event === 'crm.event') {
        let payload: any;
        try { payload = typeof m.data === 'string' ? JSON.parse(m.data) : m.data; } catch { return; }
        const ev2: RealtimeEvent = { type: payload?.type, data: payload?.data };
        this.listeners.forEach((fn) => { try { fn(ev2); } catch {} });
      }
    };

    ws.onerror = () => {};
    ws.onclose = () => {
      this.ws = null;
      this.socketId = null;
      this.scheduleReconnect();
    };
  }

  private async subscribe() {
    if (!this.ws || !this.socketId || !this.channel) return;
    try {
      const res = await apiClient.post('/crm/broadcasting/auth', {
        socket_id: this.socketId,
        channel_name: this.channel,
      });
      const auth = res.data?.auth;
      if (!auth) return;
      this.ws.send(JSON.stringify({
        event: 'pusher:subscribe',
        data: { channel: this.channel, auth },
      }));
    } catch {}
  }

  private scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delay = Math.min(30000, 1500 * Math.pow(1.6, this.attempts++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, delay);
  }
}

export const realtime = new RealtimeClient();
