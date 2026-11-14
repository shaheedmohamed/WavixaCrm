import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Text,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Header } from '../components/Header';
import { SearchBar } from '../components/SearchBar';
import { FilterBar } from '../components/FilterBar';
import { ChatListItem } from '../components/ChatListItem';
import { BottomNav, BottomTabType } from '../components/BottomNav';
import { ThreeDotMenu } from '../components/ThreeDotMenu';
import { NewChatModal } from '../components/NewChatModal';
import { QuickReplyModal } from '../components/QuickReplyModal';
import { chatService } from '../services/chatService';
import { playIncomingMessage } from '../services/notifySound';
import { initNotifications, notifyNewMessage } from '../services/notifications';
import { useAuth } from '../context/AuthContext';
import { Conversation, FilterScope } from '../types/crm';
import { Colors } from '../constants/theme';

interface ChatListScreenProps {
  onOpenConversation: (conversation: Conversation) => void;
  onOpenProfile: () => void;
  onOpenStats: () => void;
}

export const ChatListScreen: React.FC<ChatListScreenProps> = ({
  onOpenConversation,
  onOpenProfile,
  onOpenStats,
}) => {
  const { user } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedScope, setSelectedScope] = useState<FilterScope>('chats');
  const [activeTab, setActiveTab] = useState<BottomTabType>('chats');

  // Modals state
  const [menuVisible, setMenuVisible] = useState(false);
  const [newChatVisible, setNewChatVisible] = useState(false);
  const [quickRepliesVisible, setQuickRepliesVisible] = useState(false);

  // Prevent race conditions between requests
  const reqSeq = useRef(0);
  // Tracks last incoming message timestamp per conversation to detect new ones.
  const lastSeenIncoming = useRef<Map<number, string>>(new Map());
  const firstSyncDone = useRef(false);
  const notifReady = useRef(false);

  const fetchConversations = useCallback(
    async (mode: 'initial' | 'pull' | 'silent' = 'silent') => {
      const curSeq = ++reqSeq.current;

      if (mode === 'pull') {
        setRefreshing(true);
      } else if (mode === 'initial' && conversations.length === 0) {
        setInitialLoading(true);
      }

      try {
        const params: any = {
          scope: selectedScope,
          search: searchQuery.trim() || undefined,
          per_page: 50,
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
        }

        const res = await chatService.getConversations(params);
        if (curSeq === reqSeq.current && res.success && res.conversations) {
          // Detect chats whose last incoming message got newer → ding + notify.
          if (firstSyncDone.current) {
            for (const c of res.conversations) {
              if (c.last_message_direction !== 'incoming' || !c.last_message_at) continue;
              const prev = lastSeenIncoming.current.get(c.id);
              if (prev !== c.last_message_at) {
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
          for (const c of res.conversations) {
            if (c.last_message_direction === 'incoming' && c.last_message_at) {
              lastSeenIncoming.current.set(c.id, c.last_message_at);
            }
          }
          firstSyncDone.current = true;

          setConversations((prev) => {
            if (prev.length !== res.conversations.length) return res.conversations;
            for (let i = 0; i < res.conversations.length; i++) {
              const a = prev[i];
              const b = res.conversations[i];
              if (
                a?.id !== b?.id ||
                a?.unread_count !== b?.unread_count ||
                a?.last_message_at !== b?.last_message_at ||
                a?.is_pinned !== b?.is_pinned
              ) {
                return res.conversations;
              }
            }
            return prev;
          });
        }
      } catch (err) {
        console.error('Error fetching conversations:', err);
      } finally {
        if (curSeq === reqSeq.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [selectedScope, searchQuery, conversations.length]
  );

  // Notification permission + custom-sound channel on first mount.
  useEffect(() => {
    initNotifications().then((ok) => {
      notifReady.current = ok;
    });
  }, []);

  // Initial and reactive load on scope or search query change
  useEffect(() => {
    fetchConversations('initial');
  }, [selectedScope, searchQuery]);

  // Periodic SILENT background sync (no loaders, no screen flickering)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchConversations('silent');
    }, 8000);
    return () => clearInterval(timer);
  }, [fetchConversations]);

  // Compute unread count
  const unreadCount = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unread_count > 0 ? 1 : 0), 0);
  }, [conversations]);

  const totalUnreadMessages = useMemo(() => {
    return conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  }, [conversations]);

  const handleBottomTabPress = (tab: BottomTabType) => {
    setActiveTab(tab);
    if (tab === 'filters') {
      setSelectedScope(selectedScope === 'unread' ? 'chats' : 'unread');
    } else if (tab === 'stats') {
      onOpenStats();
    } else if (tab === 'settings') {
      onOpenProfile();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* WhatsApp Compact Header with Notch/Status-bar Inset */}
      <Header
        onOpenMenu={() => setMenuVisible(true)}
        onOpenProfile={onOpenProfile}
      />

      {/* Search Input Bar */}
      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        onClear={() => setSearchQuery('')}
      />

      {/* Pill Filter Bar */}
      <FilterBar
        selectedScope={selectedScope}
        onSelectScope={setSelectedScope}
        unreadCount={unreadCount}
        isAgent={user?.crm_role === 'agent'}
      />

      {/* Conversation List */}
      <View style={styles.listContainer}>
        {initialLoading && conversations.length === 0 ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>جاري تحميل المحادثات...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="chat-outline" size={54} color="#8696A0" />
            <Text style={styles.emptyTitle}>لا توجد محادثات مطابقة</Text>
            <Text style={styles.emptySub}>
              {searchQuery
                ? 'لم نجد أي محادثة تطابق بحثك الحالي'
                : 'ستظهر المحادثات هنا فور استلامها أو بدئها'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => String(item.id)}
            removeClippedSubviews={Platform.OS === 'android'}
            maxToRenderPerBatch={10}
            windowSize={7}
            initialNumToRender={15}
            getItemLayout={(_, index) => ({ length: 72, offset: 72 * index, index })}
            renderItem={({ item }) => (
              <ChatListItem
                conversation={item}
                currentUserId={user?.id}
                onPress={() => onOpenConversation(item)}
              />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchConversations('pull')}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
              />
            }
          />
        )}
      </View>

      {/* Bottom Navigation with Floating Center Button and Safe Inset */}
      <BottomNav
        activeTab={activeTab}
        onTabPress={handleBottomTabPress}
        onNewChatPress={() => setNewChatVisible(true)}
        totalUnread={totalUnreadMessages}
      />

      {/* Three-Dot Menu */}
      <ThreeDotMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onOpenNewChat={() => setNewChatVisible(true)}
        onOpenQuickReplies={() => setQuickRepliesVisible(true)}
        onOpenArchived={() => setSelectedScope('archived')}
        onOpenProfile={onOpenProfile}
      />

      {/* New Chat Modal */}
      <NewChatModal
        visible={newChatVisible}
        onClose={() => setNewChatVisible(false)}
        onChatStarted={(conv) => {
          fetchConversations('pull');
          if (conv) onOpenConversation(conv);
        }}
      />

      {/* Quick Replies Sheet */}
      <QuickReplyModal
        visible={quickRepliesVisible}
        onClose={() => setQuickRepliesVisible(false)}
        onSelectReply={() => {}}
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
  },
  emptySub: {
    fontSize: 12,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 18,
  },
});
