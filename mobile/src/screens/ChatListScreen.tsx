import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Text,
  Platform,
  TouchableOpacity,
  Vibration,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { FilterBar, buildFilterItems } from '../components/FilterBar';
import { ChatListItem, CHAT_LIST_ITEM_HEIGHT } from '../components/ChatListItem';
import {
  SwipeableConversationRow,
  ConvSwipeAction,
} from '../components/SwipeableConversationRow';
import { BottomNav, BottomTabType } from '../components/BottomNav';
import { ThreeDotMenu } from '../components/ThreeDotMenu';
import { NewChatModal } from '../components/NewChatModal';
import { QuickReplyModal } from '../components/QuickReplyModal';
import { ChatContextMenuModal } from '../components/ChatContextMenuModal';
import { AddToListModal } from '../components/AddToListModal';
import { SnoozeModal } from '../components/SnoozeModal';
import { ConversationNotesModal } from '../components/ConversationNotesModal';
import { prewarmMediaPermissions } from './ChatRoomScreen';
import { chatService } from '../services/chatService';
import { chatCache } from '../services/chatCache';
import { chatPrefs, FAVORITES_LIST_NAME } from '../services/chatPrefs';
import { playIncomingMessage } from '../services/notifySound';
import { initNotifications } from '../services/notifications';
import { realtime } from '../services/realtime';
import { appEvents } from '../services/appEvents';
import { useAuth } from '../context/AuthContext';
import { ChatAvatar } from '../components/ChatAvatar';
import { AvatarPeekModal } from '../components/AvatarPeekModal';
import { MediaViewerModal, GalleryMediaItem } from '../components/MediaViewerModal';
import { ContactInfoModal } from '../components/ContactInfoModal';
import { MyChatsSheet } from '../components/MyChatsSheet';
import { TransferModal } from '../components/TransferModal';
import { ResolveModal } from '../components/ResolveModal';
import { avatarSrc, mediaSrc } from '../services/media';
import { ChatList, Conversation, FilterScope, Message, StarredMessageItem } from '../types/crm';
import { Colors } from '../constants/theme';

interface ChatListScreenProps {
  activeConversationId?: number | null;
  onOpenConversation: (conversation: Conversation, focusMessageId?: number | string | null) => void;
  onOpenProfile: () => void;
  onOpenStats: () => void;
  onOpenStarred?: () => void;
  onOpenStatuses?: () => void;
  onOpenGestures?: () => void;
}

const sortConversations = (list: Conversation[]): Conversation[] =>
  list.slice().sort((a, b) => {
    const pinDiff = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
    if (pinDiff !== 0) return pinDiff;
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return tb - ta;
  });

export const ChatListScreen: React.FC<ChatListScreenProps> = ({
  activeConversationId,
  onOpenConversation,
  onOpenProfile,
  onOpenStats,
  onOpenStarred,
  onOpenStatuses,
  onOpenGestures,
}) => {
  const { user, token, refreshUser } = useAuth();
  const isStatusViewerAccount = (user?.email ?? '').trim().toLowerCase() === 'demo@crm.com';
  const insets = useSafeAreaInsets();
  const isAgent = user?.crm_role === 'agent';

  const [conversations, setConversations] = useState<Conversation[]>(
    () => chatCache.getConversations('chats') || []
  );
  const conversationsRef = useRef<Conversation[]>(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  const [chatLists, setChatLists] = useState<ChatList[]>(() => chatCache.getChatLists());
  const [initialLoading, setInitialLoading] = useState(() => !chatCache.getConversations('chats'));
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [msgResults, setMsgResults] = useState<StarredMessageItem[]>([]);
  const msgSearchSeq = useRef(0);
  const [selectedScope, setSelectedScope] = useState<FilterScope>('chats');
  const [activeTab, setActiveTab] = useState<BottomTabType>('chats');
  const [prefsTick, setPrefsTick] = useState(0);
  const [groupsInChats, setGroupsInChats] = useState(() => chatPrefs.isGroupsInChats());

  const [menuVisible, setMenuVisible] = useState(false);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [quickRepliesVisible, setQuickRepliesVisible] = useState(false);
  const [contextConv, setContextConv] = useState<Conversation | null>(null);
  const [snoozeConv, setSnoozeConv] = useState<Conversation | null>(null);
  const [notesConv, setNotesConv] = useState<Conversation | null>(null);
  const [transferConvId, setTransferConvId] = useState<number | null>(null);
  const [resolveConvId, setResolveConvId] = useState<number | null>(null);
  const [listModalState, setListModalState] = useState<{
    visible: boolean;
    convs: Conversation[];
    createOnly: boolean;
  }>({ visible: false, convs: [], createOnly: false });

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [peekConv, setPeekConv] = useState<Conversation | null>(null);
  const [infoConv, setInfoConv] = useState<Conversation | null>(null);
  const [avatarViewer, setAvatarViewer] = useState<{ items: GalleryMediaItem[]; index: number } | null>(null);
  const [myChatsVisible, setMyChatsVisible] = useState(false);
  // Bumped after a successful snooze so the "my chats" sheet drops that row.
  const [snoozedSheetConvId, setSnoozedSheetConvId] = useState<number | null>(null);

  const reqSeq = useRef(0);
  const lastSeenIncoming = useRef<Map<number, string>>(new Map());
  const firstSyncDone = useRef(false);
  const activeConvIdRef = useRef<number | null>(activeConversationId ?? null);

  // Onboarding hint over the shortcuts tab — floats on every app entry until
  // the guide has been opened once, then never shows again.
  const [guideHintVisible, setGuideHintVisible] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem('wavixa_guide_seen')
      .then((v) => {
        if (alive && v !== '1') setGuideHintVisible(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const markGuideSeen = useCallback(() => {
    setGuideHintVisible(false);
    AsyncStorage.setItem('wavixa_guide_seen', '1').catch(() => {});
  }, []);

  // Owned by this screen and handed to each conversation row: a row that has
  // claimed a horizontal swipe blocks the container's filter-tab switch.
  const rowSwipeLock = useSharedValue(0);
  const tabSwipeStartX = useSharedValue(0);
  const tabSwipeStartY = useSharedValue(0);

  useEffect(() => {
    activeConvIdRef.current = activeConversationId ?? null;
  }, [activeConversationId]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 220);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // WhatsApp-style global search: while the conversation filter runs on the
  // server via the `search` param, this parallel query finds matches inside
  // message bodies, media captions and file names.
  useEffect(() => {
    const q = debouncedSearch;
    // Bump the sequence on every change — an empty query simply never
    // renders msgResults, and stale async replies are discarded.
    const seq = ++msgSearchSeq.current;
    if (!q) return;
    let alive = true;
    chatService
      .searchMessages(q)
      .then((res) => {
        if (alive && seq === msgSearchSeq.current && res?.success) {
          setMsgResults(res.messages || []);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [debouncedSearch]);

  const loadChatLists = useCallback(async () => {
    try {
      const res = await chatService.getChatLists();
      if (res?.success && Array.isArray(res.lists)) {
        setChatLists(res.lists);
        chatCache.setChatLists(res.lists);
        const favList = res.lists.find((l) => l.name === FAVORITES_LIST_NAME);
        if (favList) {
          chatPrefs.syncFavoritesFromServer(favList.conversation_ids || []);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([chatCache.hydrate(), chatPrefs.init()]).then(() => {
      if (!alive) return;
      const cached = chatCache.getConversations('chats');
      if (cached && cached.length > 0) {
        setConversations((prev) => (prev.length === 0 ? cached : prev));
        setInitialLoading(false);
        chatCache.prefetchConversations(cached.slice(0, 10).map((c) => c.id));
      }
      const cachedLists = chatCache.getChatLists();
      if (cachedLists.length > 0) {
        setChatLists((prev) => (prev.length === 0 ? cachedLists : prev));
      }
      setPrefsTick((n) => n + 1);
    });
    const unsub = chatPrefs.subscribe(() => {
      setPrefsTick((n) => n + 1);
      setGroupsInChats(chatPrefs.isGroupsInChats());
      // Groups-merged-into-chats hides the dedicated chip — drop back to the
      // chats tab if it was selected when the pref flipped on.
      setSelectedScope((prev) =>
        chatPrefs.isGroupsInChats() && prev === 'groups' ? 'chats' : prev
      );
    });
    Promise.resolve().then(() => {
      loadChatLists();
    });
    initNotifications().catch(() => {});
    prewarmMediaPermissions().catch(() => {});
    return () => {
      alive = false;
      unsub();
    };
  }, [loadChatLists]);

  const buildScopeCacheKey = useCallback(
    (scope: FilterScope, q: string) => `${scope}|${q}`,
    []
  );

  const fetchConversations = useCallback(
    async (mode: 'initial' | 'pull' | 'silent' = 'silent') => {
      const curSeq = ++reqSeq.current;
      const isCustomList = String(selectedScope).startsWith('list:');
      const isFavoritesScope = selectedScope === 'favorites';
      const backendScopeKey = isCustomList || isFavoritesScope ? 'all' : selectedScope;
      const cacheKey = buildScopeCacheKey(backendScopeKey as FilterScope, debouncedSearch);

      if (mode === 'pull') {
        setRefreshing(true);
      } else if (mode === 'initial') {
        const cached = chatCache.getConversations(cacheKey);
        if (cached && cached.length > 0) {
          setConversations(cached);
          setInitialLoading(false);
        } else {
          setInitialLoading(true);
        }
      }

      try {
        const params: any = {
          scope: backendScopeKey,
          search: debouncedSearch || undefined,
          per_page: isCustomList || isFavoritesScope ? 100 : 60,
        };

        if (selectedScope === 'unread') {
          params.unread_only = true;
          delete params.scope;
        } else if (selectedScope === 'groups') {
          params.groups_only = true;
          delete params.scope;
        } else if (selectedScope === 'archived') {
          params.archived = true;
          delete params.scope;
        } else if (isCustomList || isFavoritesScope) {
          delete params.scope;
        }

        if (selectedScope === 'chats' && groupsInChats) {
          params.include_groups = true;
        }

        const res = await chatService.getConversations(params);
        if (curSeq === reqSeq.current && res.success && res.conversations) {
          if (firstSyncDone.current) {
            for (const c of res.conversations) {
              if (c.last_message_direction !== 'incoming' || !c.last_message_at) continue;
              const prev = lastSeenIncoming.current.get(c.id);
              if (prev && prev !== c.last_message_at) {
                if (!chatPrefs.isMuted(c.id) && activeConvIdRef.current !== c.id) {
                  // Sound only — the tray/banner notification comes from
                  // FCM itself, so a local copy here would alert twice.
                  playIncomingMessage();
                }
              }
            }
          }
          for (const c of res.conversations) {
            if (c.last_message_direction === 'incoming' && c.last_message_at) {
              lastSeenIncoming.current.set(c.id, c.last_message_at);
            }
          }
          firstSyncDone.current = true;

          chatCache.setConversations(cacheKey, res.conversations);
          chatCache.prefetchConversations(res.conversations.slice(0, 15).map((c) => c.id));

          setConversations((prev) => {
            if (prev.length !== res.conversations.length) return res.conversations;
            for (let i = 0; i < res.conversations.length; i++) {
              const a = prev[i];
              const b = res.conversations[i];
              if (
                a?.id !== b?.id ||
                a?.unread_count !== b?.unread_count ||
                a?.last_message_at !== b?.last_message_at ||
                a?.last_message !== b?.last_message ||
                a?.last_message_status !== b?.last_message_status ||
                a?.is_pinned !== b?.is_pinned ||
                a?.archived_at !== b?.archived_at ||
                a?.contact_name !== b?.contact_name ||
                a?.assigned_agent_id !== b?.assigned_agent_id ||
                Boolean(a?.typing) !== Boolean(b?.typing) ||
                a?.typing?.by !== b?.typing?.by
              ) {
                return res.conversations;
              }
            }
            return prev;
          });
        }
      } catch (err) {
        if (mode !== 'silent') {
          console.warn('Error fetching conversations:', err);
        }
      } finally {
        if (curSeq === reqSeq.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedScope, debouncedSearch, buildScopeCacheKey, groupsInChats]
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchConversations('initial');
    });
  }, [fetchConversations]);

  useEffect(() => {
    const timer = setInterval(() => {
      fetchConversations('silent');
    }, 6500);
    return () => clearInterval(timer);
  }, [fetchConversations]);

  // Foreground return — the OS may have suspended socket+timers; pull a
  // fresh list immediately instead of resuming a stale view.
  useEffect(
    () =>
      appEvents.onForeground(() => {
        fetchConversations('silent');
        refreshUser();
      }),
    [fetchConversations, refreshUser]
  );

  // Live presence — the "متصل الآن" dot should flip the moment a stanza
  // lands, not on the next 6.5s poll.
  useEffect(() => {
    const off = realtime.on((ev) => {
      if (ev.type !== 'presence') return;
      const d = ev.data || {};
      if (!d.conversation_id) return;
      const patch = {
        presence: d.state,
        last_seen_at: d.last_seen_at ?? null,
      };
      setConversations((prev) =>
        prev.map((c) => (c.id === d.conversation_id ? { ...c, ...patch } : c))
      );
      chatCache.patchConversationEverywhere(d.conversation_id, patch);
    });
    return off;
  }, []);

  // Instant inbox updates — `message.new`/`message.status` land on the CRM
  // channel the moment they hit the backend, so rows update in place
  // instead of waiting for the silent poll. Structural events (transfer,
  // new/removed conversations) still go through one debounced refetch.
  useEffect(() => {
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefetch = () => {
      if (refetchTimer) clearTimeout(refetchTimer);
      refetchTimer = setTimeout(() => fetchConversations('silent'), 900);
    };

    const off = realtime.on((ev) => {
      const d = ev.data || {};
      if (ev.type === 'message.new') {
        if (!d.conversation_id) return;
        const patchConv = d.conversation;
        // The banner already alerted for this message — seeding the
        // conversation's last_message_at (same value/format the poll
        // compares) keeps the poll-diff below from dinging a second time.
        const m0 = d.message || {};
        if (m0.direction === 'incoming' && patchConv?.last_message_at) {
          lastSeenIncoming.current.set(d.conversation_id, patchConv.last_message_at);
        }
        const found = conversationsRef.current.some((c) => c.id === d.conversation_id);
        setConversations((prev) => {
          if (!found) return prev;
          return sortConversations(
            prev.map((c) => {
              if (c.id !== d.conversation_id) return c;
              if (!patchConv) {
                // No snapshot — bump the preview from the message itself.
                const m = d.message || {};
                return {
                  ...c,
                  last_message: m.message ?? c.last_message,
                  last_message_type: m.message_type ?? c.last_message_type,
                  last_message_direction: m.direction ?? c.last_message_direction,
                  last_message_at: m.timestamp ?? c.last_message_at,
                  unread_count:
                    m.direction === 'incoming' && c.id !== activeConversationId
                      ? (c.unread_count || 0) + 1
                      : c.unread_count,
                };
              }
              return {
                ...c,
                ...patchConv,
                // The open room reports its own read state — don't flash an
                // unread badge on the chat the agent is staring at.
                unread_count:
                  c.id === activeConversationId
                    ? 0
                    : (patchConv.unread_count ?? c.unread_count),
              };
            })
          );
        });
        if (patchConv) {
          chatCache.patchConversationEverywhere(d.conversation_id, patchConv);
        }
        // Unknown conversation (brand-new chat, or one outside the loaded
        // page) → pull the real list; debounce absorbs history-sync bursts.
        if (!found) scheduleRefetch();
        return;
      }
      if (ev.type === 'message.status') {
        const items: { conversation_id?: number; conversation_last_status?: any }[] =
          Array.isArray(d.items) ? d.items : [];
        const convPatches = new Map<number, any>();
        for (const i of items) {
          if (i.conversation_id != null && i.conversation_last_status) {
            convPatches.set(i.conversation_id, i.conversation_last_status);
          }
        }
        if (!convPatches.size) return;
        setConversations((prev) =>
          prev.map((c) =>
            convPatches.has(c.id)
              ? { ...c, last_message_status: convPatches.get(c.id) }
              : c
          )
        );
        return;
      }
      if (
        ev.type === 'conversation.update' ||
        ev.type === 'conversation.transferred' ||
        ev.type === 'message.revoked' ||
        ev.type === 'message.deleted'
      ) {
        scheduleRefetch();
      }
    });
    return () => {
      off();
      if (refetchTimer) clearTimeout(refetchTimer);
    };
  }, [fetchConversations, activeConversationId]);

  useEffect(() => {
    if (activeConversationId === null) {
      Promise.resolve().then(() => {
        fetchConversations('silent');
      });
    }
  }, [activeConversationId, fetchConversations]);

  const displayedConversations = useMemo(() => {
    void prefsTick;
    let list = conversations;

    if (selectedScope === 'favorites') {
      const favSet = new Set(chatPrefs.getFavoriteIds());
      list = list.filter((c) => favSet.has(c.id) && !c.archived_at);
    } else if (String(selectedScope).startsWith('list:')) {
      const listId = Number(String(selectedScope).slice(5));
      const targetList = chatLists.find((l) => l.id === listId);
      const idSet = new Set(targetList?.conversation_ids || []);
      list = list.filter((c) => idSet.has(c.id) && !c.archived_at);
    }

    const q = searchQuery.trim().toLowerCase();
    if (q && q !== debouncedSearch.toLowerCase()) {
      list = list.filter(
        (c) =>
          (c.contact_name || '').toLowerCase().includes(q) ||
          (c.contact_phone || '').includes(q) ||
          (c.contact_username || '').toLowerCase().includes(q) ||
          (c.last_message || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [conversations, selectedScope, chatLists, searchQuery, debouncedSearch, prefsTick]);

  const listTagsByConvId = useMemo(() => {
    const map = new Map<number, { name: string; color?: string | null }[]>();
    for (const l of chatLists) {
      if (l.name === FAVORITES_LIST_NAME) continue;
      for (const cid of l.conversation_ids || []) {
        const arr = map.get(cid) || [];
        arr.push({ name: l.name, color: l.color });
        map.set(cid, arr);
      }
    }
    return map;
  }, [chatLists]);

  const unreadCount = useMemo(() => {
    void prefsTick;
    return conversations.reduce(
      (acc, c) => acc + ((c.unread_count || 0) > 0 || chatPrefs.isMarkedUnread(c.id) ? 1 : 0),
      0
    );
  }, [conversations, prefsTick]);

  const totalUnreadMessages = useMemo(() => {
    void prefsTick;
    return conversations.reduce(
      (acc, c) => acc + (c.unread_count || (chatPrefs.isMarkedUnread(c.id) ? 1 : 0)),
      0
    );
  }, [conversations, prefsTick]);

  const favoritesCount = useMemo(() => {
    void prefsTick;
    return chatPrefs.getFavoriteIds().length;
  }, [prefsTick]);

  const handleTogglePin = useCallback(async (conv: Conversation) => {
    const nextPinned = !conv.is_pinned;
    setConversations((prev) =>
      sortConversations(
        prev.map((c) => (c.id === conv.id ? { ...c, is_pinned: nextPinned } : c))
      )
    );
    chatCache.patchConversationEverywhere(conv.id, { is_pinned: nextPinned });
    try {
      await chatService.pinConversation(conv.id, nextPinned);
    } catch {
      fetchConversations('silent');
    }
  }, [fetchConversations]);

  const handleToggleArchive = useCallback(async (conv: Conversation) => {
    const nextArchived = !conv.archived_at;
    const nextAt = nextArchived ? new Date().toISOString() : null;
    setConversations((prev) => {
      const inArchiveTab = selectedScope === 'archived';
      if ((nextArchived && !inArchiveTab) || (!nextArchived && inArchiveTab)) {
        return prev.filter((c) => c.id !== conv.id);
      }
      return prev.map((c) => (c.id === conv.id ? { ...c, archived_at: nextAt } : c));
    });
    chatCache.patchConversationEverywhere(conv.id, { archived_at: nextAt });
    try {
      await chatService.archiveConversation(conv.id, nextArchived);
    } catch {
      fetchConversations('silent');
    }
  }, [selectedScope, fetchConversations]);

  const handleMute = useCallback((conv: Conversation, duration: number | 'forever' | null) => {
    if (duration === null) {
      chatPrefs.unmute(conv.id);
    } else {
      chatPrefs.mute(conv.id, duration);
    }
  }, []);

  const handleToggleFavorite = useCallback(async (conv: Conversation) => {
    const nextFav = !chatPrefs.isFavorite(conv.id);
    chatPrefs.setFavoriteLocal(conv.id, nextFav);

    try {
      const favList = chatLists.find((l) => l.name === FAVORITES_LIST_NAME);
      if (nextFav) {
        const res = await chatService.saveChatList({
          id: favList?.id,
          name: FAVORITES_LIST_NAME,
          conversation_ids: [conv.id],
        });
        if (res?.success) {
          await loadChatLists();
        }
      } else if (favList) {
        await chatService.removeChatListMembers(favList.id, [conv.id]);
        await loadChatLists();
      }
    } catch {}
  }, [chatLists, loadChatLists]);

  const handleToggleUnread = useCallback((conv: Conversation) => {
    const cur = chatPrefs.isMarkedUnread(conv.id);
    chatPrefs.setMarkedUnread(conv.id, !cur);
  }, []);

  // Snooze — the server hides the chat from every normal scope until the
  // timer expires; mirror that locally instead of waiting for the poll.
  const handleSnooze = useCallback(
    async (conv: Conversation, minutes: number | null) => {
      try {
        if (minutes === null) {
          await chatService.unsnoozeConversation(conv.id);
          const patch = { snoozed_until: null, snoozed_by: null };
          setConversations((prev) =>
            prev.map((c) => (c.id === conv.id ? { ...c, ...patch } : c))
          );
          chatCache.patchConversationEverywhere(conv.id, patch);
        } else {
          const res = await chatService.snoozeConversation(conv.id, { minutes });
          const until =
            res?.snoozed_until || new Date(Date.now() + minutes * 60000).toISOString();
          chatCache.patchConversationEverywhere(conv.id, { snoozed_until: until });
          setConversations((prev) =>
            selectedScope === 'snoozed'
              ? prev.map((c) => (c.id === conv.id ? { ...c, snoozed_until: until } : c))
              : prev.filter((c) => c.id !== conv.id)
          );
          setSnoozedSheetConvId(conv.id);
        }
      } catch (err: any) {
        Alert.alert('تنبيه', err?.response?.data?.message || 'تعذر تأجيل المحادثة');
        fetchConversations('silent');
      }
    },
    [selectedScope, fetchConversations]
  );

  const handleClaimToMine = useCallback(async (conv: Conversation) => {
    try {
      const res = await chatService.claimConversation(conv.id);
      if (res?.success) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === conv.id
              ? {
                  ...c,
                  assigned_agent_id: user?.id,
                  assigned_agent: user ? { id: user.id, name: user.name } : c.assigned_agent,
                }
              : c
          )
        );
      }
    } catch (err: any) {
      Alert.alert('تنبيه', err?.response?.data?.message || 'تعذر استلام المحادثة');
    }
  }, [user]);

  const handleToggleListMember = useCallback(
    async (list: ChatList, convIds: number[], shouldBeMember: boolean) => {
      try {
        if (shouldBeMember) {
          await chatService.saveChatList({
            id: list.id,
            name: list.name,
            conversation_ids: convIds,
          });
        } else {
          await chatService.removeChatListMembers(list.id, convIds);
        }
        await loadChatLists();
      } catch {
        Alert.alert('خطأ', 'تعذر تحديث القائمة حالياً');
      }
    },
    [loadChatLists]
  );

  const handleCreateList = useCallback(
    async (name: string, convIds: number[], color?: string | null) => {
      try {
        const res = await chatService.saveChatList({
          name,
          color,
          conversation_ids: convIds,
        });
        if (res?.success && res.list) {
          await loadChatLists();
          setSelectionMode(false);
          setSelectedIds(new Set());
          if (convIds.length > 0) {
            setSelectedScope(`list:${res.list.id}`);
          }
        }
      } catch {
        Alert.alert('خطأ', 'تعذر إنشاء القائمة');
      }
    },
    [loadChatLists]
  );

  const handleSetListColor = useCallback(
    async (list: ChatList, color: string | null) => {
      try {
        await chatService.saveChatList({ id: list.id, name: list.name, color });
        await loadChatLists();
      } catch {
        Alert.alert('خطأ', 'تعذر تحديث لون القائمة');
      }
    },
    [loadChatLists]
  );

  const handleDeleteList = useCallback(
    async (list: ChatList) => {
      try {
        await chatService.deleteChatList(list.id);
        await loadChatLists();
        if (selectedScope === `list:${list.id}`) {
          setSelectedScope('chats');
        }
      } catch {
        Alert.alert('خطأ', 'تعذر حذف القائمة');
      }
    },
    [loadChatLists, selectedScope]
  );

  const handleLongPressItem = useCallback((conv: Conversation) => {
    try {
      Vibration.vibrate(14);
    } catch {}
    if (selectionMode) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(conv.id)) next.delete(conv.id);
        else next.add(conv.id);
        if (next.size === 0) setSelectionMode(false);
        return next;
      });
      return;
    }
    setContextConv(conv);
  }, [selectionMode]);

  const handlePressItem = useCallback(
    (conv: Conversation) => {
      if (selectionMode) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(conv.id)) next.delete(conv.id);
          else next.add(conv.id);
          if (next.size === 0) setSelectionMode(false);
          return next;
        });
        return;
      }
      if (chatPrefs.isMarkedUnread(conv.id)) {
        chatPrefs.setMarkedUnread(conv.id, false);
      }
      if (conv.unread_count > 0) {
        setConversations((prev) =>
          prev.map((c) => (c.id === conv.id ? { ...c, unread_count: 0 } : c))
        );
        chatCache.patchConversationEverywhere(conv.id, { unread_count: 0 });
      }
      onOpenConversation(conv);
    },
    [selectionMode, onOpenConversation]
  );

  const handleEnterSelectMode = useCallback((conv: Conversation) => {
    setSelectionMode(true);
    setSelectedIds(new Set([conv.id]));
  }, []);

  const selectedConversations = useMemo(
    () => conversations.filter((c) => selectedIds.has(c.id)),
    [conversations, selectedIds]
  );

  // Same chip order the FilterBar renders — needed to resolve which scope a
  // horizontal swipe lands on.
  const scopeOrder = useMemo(
    () =>
      buildFilterItems({
        unreadCount,
        favoritesCount,
        chatLists,
        isAgent,
        hideGroups: groupsInChats,
      }).map((f) => f.id),
    [unreadCount, favoritesCount, chatLists, isAgent, groupsInChats]
  );

  const stepScope = useCallback(
    (dir: 1 | -1) => {
      try {
        Vibration.vibrate(10);
      } catch {}
      setSelectedScope((prev) => {
        const idx = scopeOrder.indexOf(prev);
        if (idx === -1) return prev;
        return scopeOrder[idx + dir] ?? prev;
      });
    },
    [scopeOrder]
  );

  // Tab-switch swipe. Manually activated so it loses every conflict it should:
  // a claimed row swipe (rowSwipeLock) and any vertically-dominant scroll.
  const tabSwipeGesture = Gesture.Pan()
    .enabled(!selectionMode)
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      const t = e.allTouches[0];
      if (t) {
        tabSwipeStartX.value = t.absoluteX;
        tabSwipeStartY.value = t.absoluteY;
      }
    })
    .onTouchesMove((e, state) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.absoluteX - tabSwipeStartX.value;
      const dy = t.absoluteY - tabSwipeStartY.value;
      // Two fingers never hit a row swipe (rows are single-pointer), so the
      // tab switch activates immediately — it works even over a full list.
      if (e.numberOfTouches >= 2) {
        if (Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) {
          state.fail();
          return;
        }
        if (Math.abs(dx) > 40) state.activate();
        return;
      }
      if (rowSwipeLock.value) {
        state.fail();
        return;
      }
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.1) {
        state.fail();
        return;
      }
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        state.activate();
      }
    })
    .onEnd((e) => {
      'worklet';
      // Chips run right→left (row-reverse): swiping left advances the order.
      if (e.translationX < -24) runOnJS(stepScope)(1);
      else if (e.translationX > 24) runOnJS(stepScope)(-1);
    });

  // Row swipe shortcuts — the same rules the long-press context menu uses.
  const buildSwipeActions = useCallback(
    (item: Conversation): { leftActions: ConvSwipeAction[]; rightActions: ConvSwipeAction[] } => {
      const isGroup = Boolean(item.is_group);
      const heldByMe = Boolean(user?.id && item.assigned_agent_id === user.id);
      const canClaim = Boolean(isAgent && !item.assigned_agent_id && !isGroup);
      const canResolve = Boolean(!isGroup && (!isAgent || heldByMe));

      const rightActions: ConvSwipeAction[] = [];
      if (canResolve) {
        rightActions.push({
          key: 'resolve',
          label: 'إنهاء',
          icon: 'check-circle-outline',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#059669',
          onPress: () => setResolveConvId(item.id),
        });
      } else if (canClaim) {
        rightActions.push({
          key: 'claim',
          label: 'استلام',
          icon: 'hand-back-right-outline',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#00A884',
          onPress: () => handleClaimToMine(item),
        });
      } else if (!isAgent) {
        rightActions.push({
          key: 'archive',
          label: item.archived_at ? 'إلغاء الأرشفة' : 'أرشفة',
          icon: item.archived_at ? 'archive-arrow-up-outline' : 'archive-arrow-down-outline',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#2563EB',
          onPress: () => handleToggleArchive(item),
        });
      } else {
        rightActions.push({
          key: 'more',
          label: 'المزيد',
          icon: 'dots-horizontal',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#54656F',
          onPress: () => setContextConv(item),
        });
      }
      rightActions.push({
        key: 'snooze',
        label: 'تأجيل',
        icon: 'alarm-snooze',
        iconSet: 'mci',
        color: '#FFFFFF',
        bg: '#6366F1',
        onPress: () => setSnoozeConv(item),
      });

      const muted = chatPrefs.isMuted(item.id);
      const markedUnread = chatPrefs.isMarkedUnread(item.id);
      const leftActions: ConvSwipeAction[] = [
        {
          key: 'pin',
          label: item.is_pinned ? 'إلغاء تثبيت' : 'تثبيت',
          icon: item.is_pinned ? 'pin-off-outline' : 'pin-outline',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#0D9488',
          onPress: () => handleTogglePin(item),
        },
      ];
      if ((item.unread_count || 0) === 0) {
        leftActions.push({
          key: 'unread',
          label: markedUnread ? 'كمقروءة' : 'غير مقروءة',
          icon: markedUnread ? 'email-open-outline' : 'email-mark-as-unread',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#54656F',
          onPress: () => handleToggleUnread(item),
        });
      } else {
        leftActions.push({
          key: 'mute',
          label: muted ? 'إلغاء الكتم' : 'كتم',
          icon: muted ? 'bell-ring-outline' : 'bell-off-outline',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#D97706',
          onPress: () => handleMute(item, muted ? null : 'forever'),
        });
      }
      return { leftActions, rightActions };
    },
    [user, isAgent, handleClaimToMine, handleToggleArchive, handleTogglePin, handleToggleUnread, handleMute]
  );

  const handleBottomTabPress = useCallback(
    (tab: BottomTabType) => {
      setActiveTab(tab);
      if (tab === 'starred') {
        onOpenStarred?.();
      } else if (tab === 'statuses') {
        if (isStatusViewerAccount) onOpenStatuses?.();
      } else if (tab === 'shortcuts') {
        markGuideSeen();
        onOpenGestures?.();
      } else if (tab === 'settings') {
        onOpenProfile();
      }
    },
    [onOpenStarred, onOpenStatuses, onOpenProfile, onOpenGestures, isStatusViewerAccount, markGuideSeen]
  );

  const handleBottomTabLongPress = useCallback(
    (tab: BottomTabType) => {
      try {
        Vibration.vibrate(12);
      } catch {}
      if (tab === 'chats') {
        // Shortcut: jump straight into the first unread conversation in the
        // current scope — the most common "get me back to work" action.
        const firstUnread = displayedConversations.find(
          (c) => (c.unread_count || 0) > 0 || chatPrefs.isMarkedUnread(c.id)
        );
        if (firstUnread) handlePressItem(firstUnread);
      } else if (tab === 'starred') {
        onOpenStarred?.();
      } else if (tab === 'shortcuts') {
        markGuideSeen();
        onOpenGestures?.();
      }
    },
    [displayedConversations, handlePressItem, onOpenStarred, onOpenGestures, markGuideSeen]
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      void prefsTick;
      const { leftActions, rightActions } = buildSwipeActions(item);
      return (
        <SwipeableConversationRow
          leftActions={leftActions}
          rightActions={rightActions}
          disabled={selectionMode}
          swipeLock={rowSwipeLock}
        >
          <ChatListItem
            conversation={item}
            currentUserId={user?.id}
            isMuted={chatPrefs.isMuted(item.id)}
            isFavorite={chatPrefs.isFavorite(item.id)}
            isMarkedUnread={chatPrefs.isMarkedUnread(item.id)}
            listTags={listTagsByConvId.get(item.id) || []}
            selectionMode={selectionMode}
            isSelected={selectedIds.has(item.id)}
            onPress={() => handlePressItem(item)}
            onPressIn={() => chatCache.prefetchThread(item.id)}
            onLongPress={() => handleLongPressItem(item)}
            onAvatarPress={() => setPeekConv(item)}
          />
        </SwipeableConversationRow>
      );
    },
    [
      user?.id,
      listTagsByConvId,
      selectionMode,
      selectedIds,
      handlePressItem,
      handleLongPressItem,
      buildSwipeActions,
      rowSwipeLock,
      prefsTick,
    ]
  );

  const highlightQuery = useCallback((text: string, q: string): React.ReactNode => {
    const needle = q.toLowerCase();
    if (!needle) return text;
    const lower = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let i = 0;
    while (i < text.length) {
      const idx = lower.indexOf(needle, i);
      if (idx === -1) {
        parts.push(text.slice(i));
        break;
      }
      if (idx > i) parts.push(text.slice(i, idx));
      parts.push(
        <Text key={`h-${idx}`} style={styles.msgHit}>
          {text.slice(idx, idx + needle.length)}
        </Text>
      );
      i = idx + needle.length;
    }
    return parts;
  }, []);

  const msgResultTime = useCallback((iso?: string | null): string => {
    if (!iso) return '';
    try {
      const date = new Date(iso);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();
      if (isToday) {
        let hours = date.getHours();
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'م' : 'ص';
        hours = hours % 12 || 12;
        return `${hours}:${minutes} ${ampm}`;
      }
      const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
      if (diffDays === 1) return 'أمس';
      if (diffDays >= 0 && diffDays < 7) {
        const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        return days[date.getDay()];
      }
      return `${date.getDate()}/${date.getMonth() + 1}`;
    } catch {
      return '';
    }
  }, []);

  const renderMessageResult = useCallback(
    (item: StarredMessageItem) => {
      const conv = item.conversation;
      if (!conv) return null;
      const title =
        conv.contact_name ||
        (conv.contact_username ? `@${conv.contact_username}` : null) ||
        (conv.contact_phone ? `+${conv.contact_phone}` : 'عميل');
      const typeLabel =
        item.message_type === 'image'
          ? { icon: 'image-outline' as const, label: 'صورة' }
          : item.message_type === 'video'
            ? { icon: 'videocam-outline' as const, label: 'فيديو' }
            : item.message_type === 'audio' || item.message_type === 'voice'
              ? { icon: 'mic-outline' as const, label: 'رسالة صوتية' }
              : item.message_type === 'document'
                ? { icon: 'document-outline' as const, label: 'مستند' }
                : item.message_type === 'sticker'
                  ? { icon: 'happy-outline' as const, label: 'ملصق' }
                  : null;
      const body = (item.message || '').trim();
      const isPlaceholder = !!typeLabel && /^\[.+\]$/.test(body);
      const text = isPlaceholder
        ? (item.media_caption || '').trim() || typeLabel!.label
        : body || (item.media_caption || '').trim() || 'رسالة';

      return (
        <TouchableOpacity
          key={`msg-${item.id}`}
          style={styles.msgRow}
          activeOpacity={0.65}
          onPress={() => onOpenConversation(conv, item.id)}
        >
          <ChatAvatar conversation={conv} title={title} size={46} />
          <View style={styles.msgRowBody}>
            <View style={styles.msgRowTop}>
              <Text style={styles.msgRowTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.msgRowTime}>{msgResultTime(item.timestamp)}</Text>
            </View>
            <View style={styles.msgRowPreview}>
              {typeLabel ? (
                <Ionicons
                  name={typeLabel.icon}
                  size={14}
                  color="#8696A0"
                  style={{ marginLeft: 3 }}
                />
              ) : null}
              {item.direction === 'outgoing' ? (
                <Ionicons
                  name="checkmark-done"
                  size={14}
                  color="#8696A0"
                  style={{ marginLeft: 3 }}
                />
              ) : null}
              <Text style={styles.msgRowText} numberOfLines={2}>
                {highlightQuery(text, debouncedSearch)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [onOpenConversation, debouncedSearch, highlightQuery, msgResultTime]
  );

  const peekTitle = peekConv
    ? peekConv.contact_name ||
      (peekConv.contact_username ? `@${peekConv.contact_username}` : null) ||
      (peekConv.contact_phone ? `+${peekConv.contact_phone}` : 'عميل')
    : '';

  const handleExpandAvatar = useCallback(() => {
    if (!peekConv || !token) return;
    const uri = avatarSrc(peekConv, token);
    if (!uri) return;
    setAvatarViewer({
      items: [
        {
          id: `avatar-${peekConv.id}`,
          uri,
          downloadUri: avatarSrc(peekConv, token, true),
          kind: 'image',
          senderName: peekTitle,
        },
      ],
      index: 0,
    });
  }, [peekConv, token, peekTitle]);

  const handleInfoViewMedia = useCallback(
    (m: Message) => {
      const uri = mediaSrc(m, token);
      if (!uri) return;
      setAvatarViewer({
        items: [
          {
            id: m.id,
            uri,
            downloadUri: uri,
            kind: m.message_type === 'video' ? 'video' : 'image',
            caption: m.media_caption || m.message,
            senderName: m.direction === 'outgoing' ? 'أنت' : m.sender_name || null,
            timestamp: m.timestamp,
          },
        ],
        index: 0,
      });
    },
    [token]
  );

  const messageSection =
    debouncedSearch.length > 0 && msgResults.length > 0 ? (
      <View style={styles.msgSection}>
        <Text style={styles.msgSectionTitle}>الرسائل</Text>
        {msgResults.slice(0, 40).map(renderMessageResult)}
      </View>
    ) : null;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Header
        onOpenMenu={() => setMenuVisible(true)}
        onOpenProfile={onOpenProfile}
        onOpenMyChats={() => setMyChatsVisible(true)}
      />

      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      <FilterBar
        selectedScope={selectedScope}
        onSelectScope={setSelectedScope}
        unreadCount={unreadCount}
        favoritesCount={favoritesCount}
        chatLists={chatLists}
        isAgent={isAgent}
        hideGroups={groupsInChats}
        onPressCreateList={() =>
          setListModalState({ visible: true, convs: [], createOnly: true })
        }
        onLongPressCustomList={(list) => {
          Alert.alert(list.name, 'إدارة القائمة المخصصة', [
            { text: 'إلغاء', style: 'cancel' },
            {
              text: 'حذف القائمة',
              style: 'destructive',
              onPress: () => handleDeleteList(list),
            },
          ]);
        }}
        onLongPressScope={(scope) => {
          if (scope === 'mine') setMyChatsVisible(true);
        }}
      />

      <GestureDetector gesture={tabSwipeGesture}>
        <View style={styles.listContainer} collapsable={false}>
        {initialLoading && displayedConversations.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل المحادثات...</Text>
          </View>
        ) : displayedConversations.length === 0 && !messageSection ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name={selectedScope === 'favorites' ? 'heart-outline' : 'chat-outline'}
              size={54}
              color="#8696A0"
            />
            <Text style={styles.emptyTitle}>
              {selectedScope === 'favorites'
                ? 'لا توجد محادثات في المفضلة'
                : 'لا توجد محادثات مطابقة'}
            </Text>
            <Text style={styles.emptySub}>
              {selectedScope === 'favorites'
                ? 'اضغط ضغطة مطولة على أي محادثة لإضافتها إلى المفضلة للوصول السريع'
                : searchQuery
                  ? 'لم نجد أي محادثة تطابق بحثك الحالي'
                  : 'ستظهر المحادثات هنا فور استلامها أو بدئها'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={displayedConversations}
            extraData={prefsTick}
            keyExtractor={(item) => String(item.id)}
            removeClippedSubviews={Platform.OS === 'android'}
            maxToRenderPerBatch={14}
            windowSize={9}
            initialNumToRender={16}
            getItemLayout={(_, index) => ({
              length: CHAT_LIST_ITEM_HEIGHT,
              offset: CHAT_LIST_ITEM_HEIGHT * index,
              index,
            })}
            renderItem={renderItem}
            ListFooterComponent={messageSection ?? undefined}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  loadChatLists();
                  fetchConversations('pull');
                }}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
              />
            }
          />
        )}
        </View>
      </GestureDetector>

      {selectionMode && selectedIds.size > 0 ? (
        <View style={[styles.selectionBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.selectionCountWrap}>
            <TouchableOpacity
              onPress={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
              style={styles.cancelSelectBtn}
            >
              <Ionicons name="close" size={20} color="#54656F" />
            </TouchableOpacity>
            <Text style={styles.selectionCountText}>{selectedIds.size} محدد</Text>
          </View>

          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={styles.selectActionPrimary}
              onPress={() =>
                setListModalState({
                  visible: true,
                  convs: selectedConversations,
                  createOnly: false,
                })
              }
            >
              <MaterialCommunityIcons name="playlist-plus" size={18} color="#FFFFFF" />
              <Text style={styles.selectActionPrimaryText}>إضافة لقائمة</Text>
            </TouchableOpacity>

            {!isAgent && (
              <TouchableOpacity
                style={styles.selectActionSecondary}
                onPress={async () => {
                  const targets = selectedConversations;
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                  for (const c of targets) {
                    await handleToggleArchive(c);
                  }
                }}
              >
                <MaterialCommunityIcons name="archive-arrow-down-outline" size={18} color="#111B21" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <BottomNav
          activeTab={activeTab}
          onTabPress={handleBottomTabPress}
          onTabLongPress={handleBottomTabLongPress}
          onNewChatPress={() => setNewChatVisible(true)}
          totalUnread={totalUnreadMessages}
          showStatuses={isStatusViewerAccount}
          guideHintVisible={guideHintVisible}
        />
      )}

      <ThreeDotMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onOpenNewChat={() => setNewChatVisible(true)}
        onOpenQuickReplies={() => setQuickRepliesVisible(true)}
        onOpenStarred={onOpenStarred}
        onOpenStats={onOpenStats}
        onOpenArchived={!isAgent ? () => setSelectedScope('archived') : undefined}
        onOpenProfile={onOpenProfile}
      />

      <NewChatModal
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        onChatStarted={(conv) => {
          fetchConversations('pull');
          if (conv) onOpenConversation(conv);
        }}
      />

      <QuickReplyModal
        visible={quickRepliesVisible}
        onClose={() => setQuickRepliesVisible(false)}
        onSelectReply={() => {}}
      />

      <ChatContextMenuModal
        conversation={contextConv}
        isMuted={contextConv ? chatPrefs.isMuted(contextConv.id) : false}
        isFavorite={contextConv ? chatPrefs.isFavorite(contextConv.id) : false}
        isMarkedUnread={contextConv ? chatPrefs.isMarkedUnread(contextConv.id) : false}
        canArchive={!isAgent}
        currentUserId={user?.id}
        isAgent={isAgent}
        onClose={() => setContextConv(null)}
        onTogglePin={handleTogglePin}
        onToggleArchive={handleToggleArchive}
        onMute={handleMute}
        onToggleFavorite={handleToggleFavorite}
        onToggleUnread={handleToggleUnread}
        onOpenAddToList={(conv) =>
          setListModalState({ visible: true, convs: [conv], createOnly: false })
        }
        onEnterSelectMode={handleEnterSelectMode}
        onClaim={handleClaimToMine}
        onTransfer={(conv) => setTransferConvId(conv.id)}
        onResolve={(conv) => setResolveConvId(conv.id)}
        onSnooze={(conv) => setSnoozeConv(conv)}
        onOpenNotes={(conv) => setNotesConv(conv)}
      />

      {/* Rendered BEFORE the modals it can spawn — the snooze modal must
          stack on top of this sheet, not behind it. */}
      <MyChatsSheet
        visible={myChatsVisible}
        onClose={() => setMyChatsVisible(false)}
        onOpenConversation={(conv) => {
          setMyChatsVisible(false);
          handlePressItem(conv);
        }}
        // The sheet stays mounted under the SnoozeModal — on success the row
        // drops out via snoozedConvId, on cancel it simply stays put.
        onSnooze={(conv) => setSnoozeConv(conv)}
        snoozedConvId={snoozedSheetConvId}
        onChanged={() => {
          fetchConversations('silent');
          refreshUser().catch(() => {});
        }}
      />

      <SnoozeModal
        conversation={snoozeConv}
        onClose={() => setSnoozeConv(null)}
        onSnooze={handleSnooze}
      />

      <ConversationNotesModal
        conversation={notesConv}
        currentUserId={user?.id}
        isAgent={isAgent}
        onClose={() => setNotesConv(null)}
      />

      <TransferModal
        visible={transferConvId !== null}
        conversationId={transferConvId ?? 0}
        currentAgentId={user?.id}
        onClose={() => setTransferConvId(null)}
        onTransferred={() => {
          setTransferConvId(null);
          fetchConversations('silent');
        }}
      />

      <ResolveModal
        visible={resolveConvId !== null}
        conversationId={resolveConvId ?? 0}
        onClose={() => setResolveConvId(null)}
        onResolved={() => {
          setResolveConvId(null);
          fetchConversations('silent');
        }}
      />

      <AddToListModal
        visible={listModalState.visible}
        conversations={listModalState.convs}
        chatLists={chatLists}
        currentUserId={user?.id}
        isAgent={isAgent}
        isFavoriteCheck={(id) => chatPrefs.isFavorite(id)}
        initialCreateOnly={listModalState.createOnly}
        onClose={() => setListModalState({ visible: false, convs: [], createOnly: false })}
        onToggleListMember={handleToggleListMember}
        onCreateList={handleCreateList}
        onSetListColor={handleSetListColor}
        onDeleteList={handleDeleteList}
        onToggleFavorite={handleToggleFavorite}
        onClaimToMine={handleClaimToMine}
        onToggleArchive={handleToggleArchive}
      />

      <AvatarPeekModal
        conversation={peekConv}
        title={peekTitle}
        onClose={() => setPeekConv(null)}
        onExpand={handleExpandAvatar}
        onOpenChat={() => {
          const c = peekConv;
          setPeekConv(null);
          if (c) onOpenConversation(c);
        }}
        onOpenInfo={() => {
          setInfoConv(peekConv);
          setPeekConv(null);
        }}
      />

      <MediaViewerModal
        visible={!!avatarViewer}
        items={avatarViewer?.items || []}
        initialIndex={avatarViewer?.index || 0}
        onClose={() => setAvatarViewer(null)}
      />

      {infoConv ? (
        <ContactInfoModal
          visible={!!infoConv}
          conversation={infoConv}
          onClose={() => setInfoConv(null)}
          onViewMedia={handleInfoViewMedia}
          onContactRenamed={(newName) => {
            setInfoConv((prev) => (prev ? { ...prev, contact_name: newName } : prev));
            setConversations((prev) =>
              prev.map((c) => (c.id === infoConv.id ? { ...c, contact_name: newName } : c))
            );
            chatCache.patchConversationEverywhere(infoConv.id, { contact_name: newName });
          }}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  listContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#8696A0',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111B21',
    marginTop: 8,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 12,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 18,
  },
  msgSection: {
    borderTopWidth: 8,
    borderTopColor: '#F0F2F5',
    paddingTop: 6,
    paddingBottom: 12,
  },
  msgSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8696A0',
    paddingHorizontal: 16,
    paddingVertical: 6,
    textAlign: 'right',
  },
  msgRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 10,
  },
  msgRowBody: {
    flex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9EDEF',
    paddingBottom: 8,
  },
  msgRowTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  msgRowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  msgRowTime: {
    fontSize: 11.5,
    color: '#8696A0',
  },
  msgRowPreview: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    marginTop: 2,
  },
  msgRowText: {
    flex: 1,
    fontSize: 13,
    color: '#667781',
    textAlign: 'right',
    lineHeight: 18,
  },
  msgHit: {
    color: '#00A884',
    fontWeight: '800',
  },
  selectionBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingTop: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  selectionCountWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  cancelSelectBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionCountText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111B21',
  },
  selectionActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  selectActionPrimary: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 12,
    gap: 6,
  },
  selectActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  selectActionSecondary: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
