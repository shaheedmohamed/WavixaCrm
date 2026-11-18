import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatList, Conversation, Message, PinnedPreview } from '../types/crm';
import { chatService } from './chatService';

const CONVS_STORAGE_KEY = 'wavixa_cache_convs_v1';
const MSGS_STORAGE_KEY = 'wavixa_cache_msgs_v1';
const LISTS_STORAGE_KEY = 'wavixa_cache_lists_v1';

export interface CachedThread {
  messages: Message[];
  pinned: PinnedPreview | null;
  hasMore: boolean;
  updatedAt: number;
}

const convsMemory = new Map<string, Conversation[]>();
const msgsMemory = new Map<number, CachedThread>();
const inFlightPrefetches = new Map<number, Promise<CachedThread | null>>();
let prefetchQueue: number[] = [];
let isQueueRunning = false;
let listsMemory: ChatList[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let saveConvsTimer: ReturnType<typeof setTimeout> | null = null;
let saveMsgsTimer: ReturnType<typeof setTimeout> | null = null;

export const chatCache = {
  async hydrate(): Promise<void> {
    if (hydrated) return;
    if (hydratePromise) return hydratePromise;
    hydratePromise = (async () => {
      try {
        const [rawConvs, rawMsgs, rawLists] = await Promise.all([
          AsyncStorage.getItem(CONVS_STORAGE_KEY),
          AsyncStorage.getItem(MSGS_STORAGE_KEY),
          AsyncStorage.getItem(LISTS_STORAGE_KEY),
        ]);
        if (rawConvs) {
          const parsed = JSON.parse(rawConvs) as Record<string, Conversation[]>;
          for (const [k, v] of Object.entries(parsed)) {
            if (Array.isArray(v) && !convsMemory.has(k)) {
              convsMemory.set(k, v);
            }
          }
        }
        if (rawMsgs) {
          const parsed = JSON.parse(rawMsgs) as Record<string, CachedThread>;
          for (const [k, v] of Object.entries(parsed)) {
            const id = Number(k);
            if (id && v && Array.isArray(v.messages) && !msgsMemory.has(id)) {
              msgsMemory.set(id, v);
            }
          }
        }
        if (rawLists) {
          const parsed = JSON.parse(rawLists);
          if (Array.isArray(parsed) && listsMemory.length === 0) {
            listsMemory = parsed;
          }
        }
      } catch {
      } finally {
        hydrated = true;
      }
    })();
    return hydratePromise;
  },

  getConversations(scopeKey: string): Conversation[] | null {
    return convsMemory.get(scopeKey) || null;
  },

  setConversations(scopeKey: string, list: Conversation[]) {
    convsMemory.set(scopeKey, list);
    if (saveConvsTimer) clearTimeout(saveConvsTimer);
    saveConvsTimer = setTimeout(() => {
      const obj: Record<string, Conversation[]> = {};
      for (const [k, v] of convsMemory.entries()) {
        obj[k] = v.slice(0, 60);
      }
      AsyncStorage.setItem(CONVS_STORAGE_KEY, JSON.stringify(obj)).catch(() => {});
    }, 600);
  },

  patchConversationEverywhere(convId: number, patch: Partial<Conversation>) {
    for (const [k, list] of convsMemory.entries()) {
      const idx = list.findIndex((c) => c.id === convId);
      if (idx !== -1) {
        const next = list.slice();
        next[idx] = { ...next[idx], ...patch };
        convsMemory.set(k, next);
      }
    }
  },

  getThread(conversationId: number): CachedThread | null {
    return msgsMemory.get(conversationId) || null;
  },

  setThread(conversationId: number, data: { messages: Message[]; pinned?: PinnedPreview | null; hasMore?: boolean }) {
    const existing = msgsMemory.get(conversationId);
    const persistedMessages = data.messages.filter((m) => !m.client_temp_id).slice(-80);
    msgsMemory.set(conversationId, {
      messages: data.messages,
      pinned: data.pinned !== undefined ? data.pinned : existing?.pinned ?? null,
      hasMore: data.hasMore !== undefined ? data.hasMore : existing?.hasMore ?? false,
      updatedAt: Date.now(),
    });

    if (saveMsgsTimer) clearTimeout(saveMsgsTimer);
    saveMsgsTimer = setTimeout(() => {
      const entries = Array.from(msgsMemory.entries())
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, 50);
      const serializable: Record<string, CachedThread> = {};
      for (const [id, thread] of entries) {
        serializable[String(id)] = {
          ...thread,
          messages: thread.messages.filter((m) => !m.client_temp_id).slice(-60),
        };
      }
      AsyncStorage.setItem(MSGS_STORAGE_KEY, JSON.stringify(serializable)).catch(() => {});
    }, 800);
    return persistedMessages;
  },

  getChatLists(): ChatList[] {
    return listsMemory;
  },

  setChatLists(lists: ChatList[]) {
    listsMemory = lists;
    AsyncStorage.setItem(LISTS_STORAGE_KEY, JSON.stringify(lists)).catch(() => {});
  },

  async prefetchThread(
    conversationId: number,
    options?: { force?: boolean }
  ): Promise<CachedThread | null> {
    if (!conversationId) return null;
    const existing = msgsMemory.get(conversationId);
    const now = Date.now();
    // Return cached thread if fresh (within 90s) unless forced
    if (!options?.force && existing && existing.messages.length > 0 && now - existing.updatedAt < 90000) {
      return existing;
    }
    // Deduplicate in-flight requests
    const inFlight = inFlightPrefetches.get(conversationId);
    if (inFlight) return inFlight;

    const promise = (async () => {
      try {
        const res = await chatService.getMessages(conversationId, { limit: 30 });
        if (res?.success && Array.isArray(res.messages)) {
          chatCache.setThread(conversationId, {
            messages: res.messages,
            pinned: res.pinned ?? null,
            hasMore: Boolean(res.has_more),
          });
          return msgsMemory.get(conversationId) || null;
        }
      } catch {
        // Silently catch background prefetch errors
      } finally {
        inFlightPrefetches.delete(conversationId);
      }
      return msgsMemory.get(conversationId) || null;
    })();

    inFlightPrefetches.set(conversationId, promise);
    return promise;
  },

  prefetchConversations(conversationIds: number[]) {
    const now = Date.now();
    const needed = conversationIds
      .filter((id) => {
        if (!id) return false;
        const cached = msgsMemory.get(id);
        if (!cached || cached.messages.length === 0) return true;
        return now - cached.updatedAt > 120000;
      })
      .slice(0, 20);

    if (needed.length === 0) return;

    for (const id of needed) {
      if (!prefetchQueue.includes(id)) {
        prefetchQueue.push(id);
      }
    }

    if (!isQueueRunning) {
      this._runPrefetchQueue();
    }
  },

  async _runPrefetchQueue() {
    if (isQueueRunning) return;
    isQueueRunning = true;
    try {
      while (prefetchQueue.length > 0) {
        const batch = prefetchQueue.splice(0, 2);
        await Promise.all(batch.map((id) => this.prefetchThread(id)));
        // Brief yield to avoid holding the JS thread
        await new Promise((r) => setTimeout(r, 80));
      }
    } finally {
      isQueueRunning = false;
    }
  },
};
