import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFS_STORAGE_KEY = 'wavixa_chat_prefs_v1';
export const FAVORITES_LIST_NAME = 'المفضلة';

interface StoredPrefs {
  mutedUntil: Record<string, number>;
  markedUnread: number[];
  favoriteIds: number[];
  groupsInChats: boolean;
}

let state: StoredPrefs = {
  mutedUntil: {},
  markedUnread: [],
  favoriteIds: [],
  groupsInChats: false,
};

let loaded = false;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
};

const persist = () => {
  AsyncStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(state)).catch(() => {});
};

export const chatPrefs = {
  async init(): Promise<void> {
    if (loaded) return;
    try {
      const raw = await AsyncStorage.getItem(PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredPrefs>;
        state = {
          mutedUntil: parsed.mutedUntil || {},
          markedUnread: Array.isArray(parsed.markedUnread) ? parsed.markedUnread : [],
          favoriteIds: Array.isArray(parsed.favoriteIds) ? parsed.favoriteIds : [],
          groupsInChats: parsed.groupsInChats === true,
        };
      }
    } catch {
    } finally {
      loaded = true;
      emit();
    }
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  isMuted(conversationId: number): boolean {
    const val = state.mutedUntil[String(conversationId)];
    if (!val) return false;
    if (val === -1) return true;
    if (val > Date.now()) return true;
    delete state.mutedUntil[String(conversationId)];
    persist();
    return false;
  },

  mute(conversationId: number, durationMs: number | 'forever') {
    state.mutedUntil = {
      ...state.mutedUntil,
      [String(conversationId)]: durationMs === 'forever' ? -1 : Date.now() + durationMs,
    };
    persist();
    emit();
  },

  unmute(conversationId: number) {
    if (!state.mutedUntil[String(conversationId)]) return;
    const next = { ...state.mutedUntil };
    delete next[String(conversationId)];
    state.mutedUntil = next;
    persist();
    emit();
  },

  isGroupsInChats(): boolean {
    return state.groupsInChats === true;
  },

  setGroupsInChats(enabled: boolean) {
    if (state.groupsInChats === enabled) return;
    state.groupsInChats = enabled;
    persist();
    emit();
  },

  isMarkedUnread(conversationId: number): boolean {
    return state.markedUnread.includes(conversationId);
  },

  setMarkedUnread(conversationId: number, unread: boolean) {
    const exists = state.markedUnread.includes(conversationId);
    if (unread && !exists) {
      state.markedUnread = [...state.markedUnread, conversationId];
      persist();
      emit();
    } else if (!unread && exists) {
      state.markedUnread = state.markedUnread.filter((id) => id !== conversationId);
      persist();
      emit();
    }
  },

  isFavorite(conversationId: number): boolean {
    return state.favoriteIds.includes(conversationId);
  },

  getFavoriteIds(): number[] {
    return state.favoriteIds;
  },

  syncFavoritesFromServer(ids: number[]) {
    const merged = Array.from(new Set(ids));
    if (
      merged.length === state.favoriteIds.length &&
      merged.every((id, i) => state.favoriteIds[i] === id)
    ) {
      return;
    }
    state.favoriteIds = merged;
    persist();
    emit();
  },

  setFavoriteLocal(conversationId: number, fav: boolean) {
    const exists = state.favoriteIds.includes(conversationId);
    if (fav && !exists) {
      state.favoriteIds = [...state.favoriteIds, conversationId];
      persist();
      emit();
    } else if (!fav && exists) {
      state.favoriteIds = state.favoriteIds.filter((id) => id !== conversationId);
      persist();
      emit();
    }
  },
};
