/**
 * Client-side link-preview cache on top of GET /crm/link-preview.
 * Server does the fetch+OG parse; this dedupes per-URL requests, keeps a
 * small in-memory map, and persists hits in AsyncStorage so re-opened
 * chats don't refetch.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

const CACHE_KEY = 'wavixa_linkpreviews_v1';
const MAX_PERSIST = 120;

const mem = new Map<string, LinkPreview | null>();
const inflight = new Map<string, Promise<LinkPreview | null>>();
let persisted: Record<string, LinkPreview | null> | null = null;

const loadPersisted = async () => {
  if (persisted) return;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    persisted = raw ? JSON.parse(raw) : {};
    Object.entries(persisted!).forEach(([k, v]) => mem.set(k, v));
  } catch {
    persisted = {};
  }
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const entries = [...mem.entries()].slice(-MAX_PERSIST);
      persisted = Object.fromEntries(entries);
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(persisted)).catch(() => {});
    } catch {}
  }, 800);
};

export const URL_RE = /(https?:\/\/[^\s<>"'()]+|www\.[^\s<>"'()]+)/i;

/** First URL in a message body, normalized to a fetchable href. */
export const firstUrl = (text: string | null | undefined): string | null => {
  if (!text) return null;
  const m = String(text).match(URL_RE);
  if (!m) return null;
  let u = m[1];
  // Trim trailing punctuation that sentence text glues onto the URL.
  u = u.replace(/[.,;:!?)\]}'"»]+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u;
};

export const fetchLinkPreview = async (url: string): Promise<LinkPreview | null> => {
  if (mem.has(url)) return mem.get(url) ?? null;
  const running = inflight.get(url);
  if (running) return running;

  const p = (async () => {
    try {
      await loadPersisted();
      if (mem.has(url)) return mem.get(url) ?? null;
      const res = await apiClient.get('/crm/link-preview', { params: { url } });
      const preview = (res.data?.preview ?? null) as LinkPreview | null;
      mem.set(url, preview);
      scheduleSave();
      return preview;
    } catch {
      // Don't persist failures — a dead server shouldn't poison the cache.
      return null;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
};
