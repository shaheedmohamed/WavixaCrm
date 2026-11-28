import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wavixa_drafts_v1';

// Per-conversation unsent text — the WhatsApp "مسودة" behaviour. Kept in an
// in-memory map hydrated once from AsyncStorage; writes are debounced per
// chat so keystrokes never hit the disk, and listeners let the chat list
// repaint the red "مسودة:" prefix the moment a draft appears/clears.
type Listener = () => void;

const cache = new Map<number, string>();
const listeners = new Set<Listener>();
let loaded = false;
const writeTimers = new Map<number, ReturnType<typeof setTimeout>>();

const persist = (id: number) => {
  const text = cache.get(id);
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      const map: Record<string, string> = raw ? JSON.parse(raw) : {};
      if (text && text.trim().length) map[String(id)] = text;
      else delete map[String(id)];
      return AsyncStorage.setItem(KEY, JSON.stringify(map));
    })
    .catch(() => undefined);
};

const notify = () => listeners.forEach((cb) => cb());

export const drafts = {
  ensureLoaded(): void {
    if (loaded) return;
    loaded = true;
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const map = JSON.parse(raw) as Record<string, string>;
        for (const [id, text] of Object.entries(map)) {
          if (text && text.trim().length) cache.set(Number(id), text);
        }
        notify();
      })
      .catch(() => undefined);
  },

  get(conversationId: number): string | undefined {
    return cache.get(conversationId);
  },

  set(conversationId: number, text: string): void {
    const prev = cache.get(conversationId);
    if (text && text.length) cache.set(conversationId, text);
    else cache.delete(conversationId);
    // Only repaint the list when the EMPTY↔DRAFT boundary flips — per
    // keystroke notifies would thrash every visible row.
    if ((prev == null) !== (cache.get(conversationId) == null)) notify();

    const t = writeTimers.get(conversationId);
    if (t) clearTimeout(t);
    writeTimers.set(
      conversationId,
      setTimeout(() => {
        writeTimers.delete(conversationId);
        persist(conversationId);
      }, 400),
    );
  },

  clear(conversationId: number): void {
    if (!cache.has(conversationId)) return;
    cache.delete(conversationId);
    notify();
    const t = writeTimers.get(conversationId);
    if (t) clearTimeout(t);
    writeTimers.delete(conversationId);
    persist(conversationId);
  },

  subscribe(cb: Listener): () => void {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
};

/** Reactive draft text for a conversation — repaints when set/clear crosses
 *  the empty boundary or the store finishes hydrating from disk. */
export function useDraft(conversationId?: number): string | undefined {
  return useSyncExternalStore(drafts.subscribe, () =>
    conversationId == null ? undefined : drafts.get(conversationId),
  );
}
