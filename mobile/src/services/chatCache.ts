import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatList, Conversation, Message, PinnedPreview } from '../types/crm';

const CONVS_STORAGE_KEY = 'wavixa_cache_convs_v1';
const MSGS_STORAGE_KEY = 'wavixa_cache_msgs_v1';
const LISTS_STORAGE_KEY = 'wavixa_cache_lists_v1';

interface CachedThread {
  messages: Message[];
  pinned: PinnedPreview | null;
  hasMore: boolean;
  updatedAt: number;
}

const convsMemory = new Map<string, Conversation[]>();
const msgsMemory = new Map<number, CachedThread>();
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
        .slice(0, 35);
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
};
