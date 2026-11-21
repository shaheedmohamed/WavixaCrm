import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from './ChatAvatar';
import { chatService } from '../services/chatService';
import { Conversation, Message } from '../types/crm';
import { Colors } from '../constants/theme';

interface ForwardModalProps {
  visible: boolean;
  message: Message | null;
  /** Multi-select forward — when set, overrides `message`. */
  messages?: Message[];
  currentConversationId?: number;
  onClose: () => void;
}

/** Pick a target chat and forward the selected message — same pipeline the
 *  web chat uses (/crm/messages/forward). Search runs server-side so every
 *  stored chat is reachable by name or phone, and a typed phone number can
 *  be forwarded to even when no conversation exists yet. */
export const ForwardModal: React.FC<ForwardModalProps> = ({
  visible,
  message,
  messages,
  currentConversationId,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const fetchSeq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const seq = ++fetchSeq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const q = search.trim();
        const res = await chatService.getConversations(
          q ? { search: q, per_page: 50 } : { per_page: 50 }
        );
        if (fetchSeq.current === seq && res.success && res.conversations) {
          setConversations(
            res.conversations.filter((c: Conversation) => c.id !== currentConversationId)
          );
        }
      } catch {
      } finally {
        if (fetchSeq.current === seq) setLoading(false);
      }
    }, search.trim() ? 350 : 0);
    return () => clearTimeout(timer);
  }, [visible, search, currentConversationId]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setSearch(''), 0);
    return () => clearTimeout(t);
  }, [visible]);

  // A query that is (almost) only digits and phone punctuation is treated as
  // a phone number the user may want to forward to directly.
  const phoneQuery = useMemo(() => {
    const raw = search.trim();
    if (!raw || !/^[\d+\s()-]+$/.test(raw)) return null;
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 6 ? digits : null;
  }, [search]);

  const title = (c: Conversation) =>
    c.contact_name ||
    (c.contact_username ? `@${c.contact_username}` : null) ||
    (c.contact_phone ? `+${c.contact_phone}` : 'عميل واتساب');

  const forward = async (conv: Conversation) => {
    const list = messages && messages.length > 0 ? messages : message ? [message] : [];
    if (list.length === 0 || sending) return;
    setSending(true);
    let lastErr = '';
    try {
      let ok = 0;
      for (const m of list) {
        try {
          const res = await chatService.forwardMessage(m.message_id || m.id, [conv.id]);
          if (res.success) {
            ok += 1;
          } else {
            lastErr =
              (res.results || []).find((r: any) => !r.success)?.error ||
              res.message ||
              lastErr;
          }
        } catch (e: any) {
          lastErr = e.response?.data?.message || lastErr;
        }
      }
      if (ok > 0) {
        Alert.alert('تم', list.length > 1 ? `تمت إعادة توجيه ${ok} رسالة` : 'تمت إعادة توجيه الرسالة');
        onClose();
      } else {
        Alert.alert('فشل', lastErr || 'تعذر إعادة التوجيه');
      }
    } finally {
      setSending(false);
    }
  };

  // Forward to a typed phone number — resolve it to a conversation first
  // (startConversation returns the existing chat or creates a new one).
  const forwardToPhone = async () => {
    if (!phoneQuery || sending || starting) return;
    setStarting(true);
    try {
      const res = await chatService.startConversation(phoneQuery);
      if (res?.success && res.conversation?.id) {
        await forward(res.conversation as Conversation);
      } else {
        Alert.alert('فشل', res?.message || 'تعذر بدء المحادثة مع هذا الرقم');
      }
    } catch (e: any) {
      Alert.alert('فشل', e.response?.data?.message || 'تعذر بدء المحادثة مع هذا الرقم');
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color="#111B21" />
          </TouchableOpacity>
          <Text style={styles.title}>إعادة توجيه إلى...</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#8696A0" />
          <TextInput
            style={styles.search}
            placeholder="ابحث في المحادثات..."
            placeholderTextColor="#8696A0"
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>

        {loading && conversations.length === 0 ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 10) }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              phoneQuery ? (
                <TouchableOpacity
                  style={styles.row}
                  onPress={forwardToPhone}
                  disabled={sending || starting}
                  activeOpacity={0.7}
                >
                  <View style={styles.phoneIcon}>
                    <Ionicons name="person-add" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.rowTitle} numberOfLines={1}>إرسال إلى رقم جديد</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>+{phoneQuery}</Text>
                  </View>
                  {starting ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Ionicons name="arrow-undo" size={18} color={Colors.primary} />
                  )}
                </TouchableOpacity>
              ) : undefined
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons name="chat-outline" size={44} color="#8696A0" />
                <Text style={styles.emptyText}>
                  {search.trim() ? 'لا توجد نتائج' : 'لا توجد محادثات'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => forward(item)}
                disabled={sending || starting}
                activeOpacity={0.7}
              >
                <ChatAvatar conversation={item} title={title(item)} size={44} />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{title(item)}</Text>
                  {item.contact_phone ? (
                    <Text style={styles.rowSub} numberOfLines={1}>+{item.contact_phone}</Text>
                  ) : null}
                </View>
                {sending ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <Ionicons name="arrow-undo" size={18} color="#8696A0" />
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
  },
  searchWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRadius: 10,
    margin: 10,
    paddingHorizontal: 10,
    gap: 6,
  },
  search: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111B21',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F5',
  },
  phoneIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E7F6EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  rowSub: {
    fontSize: 11.5,
    color: '#667781',
    textAlign: 'right',
    marginTop: 1,
  },
  empty: {
    alignItems: 'center',
    marginTop: 60,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#667781',
  },
});
