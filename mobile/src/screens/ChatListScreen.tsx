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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { FilterBar } from '../components/FilterBar';
import { ChatListItem, CHAT_LIST_ITEM_HEIGHT } from '../components/ChatListItem';
import { BottomNav, BottomTabType } from '../components/BottomNav';
import { ThreeDotMenu } from '../components/ThreeDotMenu';
import { NewChatModal } from '../components/NewChatModal';
import { QuickReplyModal } from '../components/QuickReplyModal';
import { ChatContextMenuModal } from '../components/ChatContextMenuModal';
import { AddToListModal } from '../components/AddToListModal';
import { chatService } from '../services/chatService';
import { chatCache } from '../services/chatCache';
import { chatPrefs, FAVORITES_LIST_NAME } from '../services/chatPrefs';
import { playIncomingMessage } from '../services/notifySound';
import { initNotifications, notifyNewMessage } from '../services/notifications';
import { useAuth } from '../context/AuthContext';
import { ChatList, Conversation, FilterScope } from '../types/crm';
import { Colors } from '../constants/theme';

interface ChatListScreenProps {
  activeConversationId?: number | null;
  onOpenConversation: (conversation: Conversation) => void;
  onOpenProfile: () => void;
  onOpenStats: () => void;
  onOpenStarred?: () => void;
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
}) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isAgent = user?.crm_role === 'agent';

  const [conversations, setConversations] = useState<Conversation[]>(
    () => chatCache.getConversations('chats') || []
  );
  const [chatLists, setChatLists] = useState<ChatList[]>(() => chatCache.getChatLists());
  const [initialLoading, setInitialLoading] = useState(() => !chatCache.getConversations('chats'));
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedScope, setSelectedScope] = useState<FilterScope>('chats');
  const [activeTab, setActiveTab] = useState<BottomTabType>('chats');
  const [prefsTick, setPrefsTick] = useState(0);

  const [menuVisible, setMenuVisible] = useState(false);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [quickRepliesVisible, setQuickRepliesVisible] = useState(false);
  const [contextConv, setContextConv] = useState<Conversation | null>(null);
  const [listModalState, setListModalState] = useState<{
    visible: boolean;
    convs: Conversation[];
    createOnly: boolean;
  }>({ visible: false, convs: [], createOnly: false });

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const reqSeq = useRef(0);
  const lastSeenIncoming = useRef<Map<number, string>>(new Map());
  const firstSyncDone = useRef(false);
  const notifReady = useRef(false);
  const activeConvIdRef = useRef<number | null>(activeConversationId ?? null);

  useEffect(() => {
    activeConvIdRef.current = activeConversationId ?? null;
  }, [activeConversationId]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 220);
    return () => clearTimeout(t);
  }, [searchQuery]);

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
      }
      const cachedLists = chatCache.getChatLists();
      if (cachedLists.length > 0) {
        setChatLists((prev) => (prev.length === 0 ? cachedLists : prev));
      }
      setPrefsTick((n) => n + 1);
    });
    const unsub = chatPrefs.subscribe(() => setPrefsTick((n) => n + 1));
    Promise.resolve().then(() => {
      loadChatLists();
    });
    initNotifications().then((ok) => {
      notifReady.current = ok;
    });
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

        const res = await chatService.getConversations(params);
        if (curSeq === reqSeq.current && res.success && res.conversations) {
          if (firstSyncDone.current) {
            for (const c of res.conversations) {
              if (c.last_message_direction !== 'incoming' || !c.last_message_at) continue;
              const prev = lastSeenIncoming.current.get(c.id);
              if (prev && prev !== c.last_message_at) {
                if (!chatPrefs.isMuted(c.id) && activeConvIdRef.current !== c.id) {
                  const name =
                    c.contact_name ||
                    (c.contact_phone ? `+${c.contact_phone}` : 'عميل');
                  playIncomingMessage();
                  if (notifReady.current) {
                    notifyNewMessage(name, c.last_message || 'رسالة جديدة');
                  }
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
                a?.assigned_agent_id !== b?.assigned_agent_id
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
    [selectedScope, debouncedSearch, buildScopeCacheKey]
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

  const listNamesByConvId = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const l of chatLists) {
      if (l.name === FAVORITES_LIST_NAME) continue;
      for (const cid of l.conversation_ids || []) {
        const arr = map.get(cid) || [];
        arr.push(l.name);
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
    async (name: string, convIds: number[]) => {
      try {
        const res = await chatService.saveChatList({
          name,
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

  const handleBottomTabPress = useCallback(
    (tab: BottomTabType) => {
      setActiveTab(tab);
      if (tab === 'filters') {
        setSelectedScope((prev) => (prev === 'unread' ? 'chats' : 'unread'));
      } else if (tab === 'stats') {
        onOpenStats();
      } else if (tab === 'settings') {
        onOpenProfile();
      }
    },
    [onOpenStats, onOpenProfile]
  );

  const renderItem = useCallback(
    ({ item }: { item: Conversation }) => {
      void prefsTick;
      return (
        <ChatListItem
          conversation={item}
          currentUserId={user?.id}
          isMuted={chatPrefs.isMuted(item.id)}
          isFavorite={chatPrefs.isFavorite(item.id)}
          isMarkedUnread={chatPrefs.isMarkedUnread(item.id)}
          listNames={listNamesByConvId.get(item.id) || []}
          selectionMode={selectionMode}
          isSelected={selectedIds.has(item.id)}
          onPress={() => handlePressItem(item)}
          onLongPress={() => handleLongPressItem(item)}
        />
      );
    },
    [
      user?.id,
      listNamesByConvId,
      selectionMode,
      selectedIds,
      handlePressItem,
      handleLongPressItem,
      prefsTick,
    ]
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Header
        onOpenMenu={() => setMenuVisible(true)}
        onOpenProfile={onOpenProfile}
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
      />

      <View style={styles.listContainer}>
        {initialLoading && displayedConversations.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل المحادثات...</Text>
          </View>
        ) : displayedConversations.length === 0 ? (
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
          onNewChatPress={() => setNewChatVisible(true)}
          totalUnread={totalUnreadMessages}
        />
      )}

      <ThreeDotMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onOpenNewChat={() => setNewChatVisible(true)}
        onOpenQuickReplies={() => setQuickRepliesVisible(true)}
        onOpenStarred={onOpenStarred}
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
        onDeleteList={handleDeleteList}
        onToggleFavorite={handleToggleFavorite}
        onClaimToMine={handleClaimToMine}
        onToggleArchive={handleToggleArchive}
      />
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
