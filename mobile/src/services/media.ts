import { Config } from '../constants/config';
import { Conversation, Message } from '../types/crm';

// Turn a backend-relative path (/storage/..., /api/...) into an absolute URL.
export const resolveUrl = (url?: string | null): string | null => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${Config.CRM_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

// Resolve a message's playable/displayable media URL — same rule as the web
// chat: live rows carry a ready media_url; history-synced media is decrypted
// lazily through the token-authed /crm/media/{id} resolver.
export const mediaSrc = (m: Message | null | undefined, token?: string | null): string | null => {
  if (!m) return null;
  if (m.local_uri) return m.local_uri;
  if (m.media_url) return resolveUrl(m.media_url);
  if (m.media_meta?.mediaKey) {
    return Config.getMediaUrl(m.id, token || '');
  }
  return null;
};

// Contact avatar — always ride the backend resolver so signed WhatsApp CDN
// links never 403 on the device: it serves the locally stored copy first and
// only redirects to the remote URL when nothing is cached.
export const avatarSrc = (
  conv: Pick<Conversation, 'id' | 'contact_avatar'> | null | undefined,
  token?: string | null,
  download = false
): string | null => {
  if (!conv?.id || !token || !conv.contact_avatar) return null;
  return Config.getAvatarUrl(conv.id, token, download);
};

// Documents picked under a loose button used to be stored as 'audio' with a
// non-audio mime — same guard the web bubble uses.
export const isDocMessage = (m: Message): boolean =>
  m.message_type === 'document' ||
  (m.message_type === 'audio' && !!m.media_mime_type && !m.media_mime_type.startsWith('audio/'));

export const isAudioMessage = (m: Message): boolean =>
  (m.message_type === 'audio' || m.message_type === 'voice') &&
  (!m.media_mime_type || m.media_mime_type.startsWith('audio/'));

// Media rows store a "[type]" body when they carry no caption — hide it.
export const isPlaceholderText = (m: Message): boolean =>
  ['image', 'video', 'audio', 'voice', 'document', 'sticker'].includes(m.message_type) &&
  /^\[.+\]$/.test((m.message || '').trim());

export const formatBytes = (bytes?: number | null): string => {
  const n = Number(bytes);
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatAudioSeconds = (sec?: number | null): string => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return `${m}:${s % 60 < 10 ? '0' : ''}${s % 60}`;
};

const DOC_COLORS: Record<string, string> = {
  pdf: '#e53935', doc: '#2196f3', docx: '#2196f3', txt: '#607d8b',
  xls: '#43a047', xlsx: '#43a047', csv: '#43a047',
  ppt: '#fb8c00', pptx: '#fb8c00', zip: '#8e24aa', rar: '#8e24aa', '7z': '#8e24aa',
};

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/zip': 'ZIP',
  'text/plain': 'TXT',
  'text/csv': 'CSV',
};

export const docInfo = (
  m: Pick<Message, 'media_meta' | 'media_url' | 'media_mime_type' | 'media_size' | 'message'>
): { fileName: string; ext: string; color: string; sub: string } => {
  let fileName = m.media_meta?.fileName;
  if (!fileName && m.media_url) {
    try {
      fileName = decodeURIComponent(m.media_url.split('/').pop()?.split('?')[0] || '');
    } catch {}
  }
  if (!fileName || fileName === m.message) fileName = 'مستند';
  const extFromName = fileName.includes('.') ? fileName.split('.')!.pop()!.toUpperCase() : '';
  const ext = extFromName || MIME_EXT[m.media_mime_type || ''] || 'FILE';
  const size = m.media_size ? formatBytes(m.media_size) : '';
  return {
    fileName,
    ext,
    color: DOC_COLORS[ext.toLowerCase()] || '#00a884',
    sub: size ? `${ext} • ${size}` : ext,
  };
};

// Deterministic pseudo-waveform heights for voice notes (web uses the same
// 28-bar trick so identical messages render identical waves).
export const waveformBars = (seed: string | number, count = 28): number[] => {
  let h = 0;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    bars.push(4 + ((h >> 8) % 17)); // 4..20 px
  }
  return bars;
};
