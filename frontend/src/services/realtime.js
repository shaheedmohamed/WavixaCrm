/**
 * CRM realtime — Laravel Echo over Reverb (Pusher protocol).
 * Nginx proxies wss://<host>/reverb/app → Reverb on 127.0.0.1:8090.
 * The channel is private-crm.{ownerId}: agents share their owner's feed.
 */
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import crm from './crm.js';

window.Pusher = Pusher;

let echo = null;

export function getEcho() {
  if (echo) return echo;
  const token = crm.getToken();
  if (!token) return null;

  echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY,
    wsHost: window.location.hostname,
    wsPort: window.location.port || (location.protocol === 'https:' ? 443 : 80),
    wssPort: 443,
    wsPath: '/reverb/app',
    forceTLS: location.protocol === 'https:',
    enabledTransports: ['ws', 'wss'],
    disableStats: true,
    authEndpoint: `${import.meta.env.VITE_API_BASE_URL || '/api'}/crm/broadcasting/auth`,
    auth: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
  return echo;
}

/** Channel name the user is authorized for (agents share the owner's feed). */
export function crmChannelName() {
  const user = crm.getUser();
  if (!user) return null;
  const ownerId = user.crm_role === 'agent' && user.crm_parent_id ? user.crm_parent_id : user.id;
  return `crm.${ownerId}`;
}

export function disconnectEcho() {
  if (echo) {
    echo.disconnect();
    echo = null;
  }
}
