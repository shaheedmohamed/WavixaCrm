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

const MAX_TARGETS = 20; // backend validation cap

/** WhatsApp-style forward picker: search any chat (groups included), tick
 *  as many targets as wanted — typed phone numbers work too — then send
 *  once via /crm/messages/forward. */
export const ForwardModal: React.FC<ForwardModalProps> = ({
  visible,
  message,
  messages,
  currentConversationId,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation[]>([]);
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
          q
            ? { search: q, per_page: 50, include_groups: true }
            : { per_page: 50, include_groups: true }
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
    const t = setTimeout(() => {
      setSearch('');
      setSelected([]);
    }, 0);
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

  const isSelected = (id: number) => selected.some((c) => c.id === id);

  const toggle = (c: Conversation) => {
    setSelected((prev) => {
      if (prev.some((x) => x.id === c.id)) return prev.filter((x) => x.id !== c.id);
      if (prev.length >= MAX_TARGETS) return prev;
      return [...prev, c];
    });
  };

  // Selected chats stay pinned on top even when the search moves on.
  const listData = useMemo(() => {
    const ids = new Set(conversations.map((c) => c.id));
    return [...selected.filter((c) => !ids.has(c.id)), ...conversations];
  }, [conversations, selected]);

  // Resolve a typed number into a conversation and tick it like any row —
  // the actual send still waits for the confirm button.
  const pickPhone = async () => {
    if (!phoneQuery || sending || starting) return;
    setStarting(true);
    try {
      const res = await chatService.startConversation(phoneQuery);
      const conv = res?.conversation as Conversation | undefined;
      if (res?.success && conv?.id) {
        setConversations((prev) =>
          prev.some((c) => c.id === conv.id) ? prev : [conv, ...prev]
        );
        setSelected((prev) =>
          prev.some((c) => c.id === conv.id) || prev.length >= MAX_TARGETS
            ? prev
            : [...prev, conv]
        );
      } else {
        Alert.alert('فشل', res?.message || 'تعذر بدء المحادثة مع هذا الرقم');
      }
    } catch (e: any) {
      Alert.alert('فشل', e.response?.data?.message || 'تعذر بدء المحادثة مع هذا الرقم');
    } finally {
      setStarting(false);
    }
  };

  const doForward = async () => {
    const list = messages && messages.length > 0 ? messages : message ? [message] : [];
    if (list.length === 0 || selected.length === 0 || sending) return;
    setSending(true);
    const ids = selected.map((c) => c.id);
    const okConvs = new Set<number>();
    const errors = new Map<number, string>();
    try {
      for (const m of list) {
        try {
          const res = await chatService.forwardMessage(m.message_id || m.id, ids);
          for (const r of res.results || []) {
            if (r.success) okConvs.add(r.conversation_id);
            else if (!errors.has(r.conversation_id)) {
              errors.set(r.conversation_id, r.error || 'خطأ غير معروف');
            }
          }
          if (!res.success && !(res.results || []).length) {
            for (const id of ids) errors.set(id, res.message || 'فشل التحويل');
          }
        } catch (e: any) {
          const msg = e.response?.data?.message || 'فشل التحويل';
          for (const id of ids) errors.set(id, msg);
        }
      }

      if (okConvs.size > 0) {
        const errLines = [...errors.entries()]
          .filter(([id]) => !okConvs.has(id))
          .map(([id, err]) => {
            const conv = selected.find((c) => c.id === id);
            return `• ${conv ? title(conv) : id}: ${err}`;
          });
        Alert.alert(
          'تم',
          `تمت إعادة التوجيه إلى ${okConvs.size} محادثة` +
            (errLines.length ? `\n\nفشل إلى:\n${errLines.join('\n')}` : '')
        );
        onClose();
      } else {
        Alert.alert('فشل', errors.values().next().value || 'تعذر إعادة التوجيه');
      }
    } finally {
      setSending(false);
    }
  };

  const renderCheck = (on: boolean) => (
    <View style={[styles.check, on && styles.checkOn]}>
      {on ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 10) }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
            <Ionicons name="close" size={22} color="#111B21" />
          </TouchableOpacity>
          <Text style={styles.title}>إعادة توجيه إلى...</Text>
          {selected.length > 0 ? (
            <Text style={styles.count}>{selected.length}</Text>
          ) : null}
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#8696A0" />
          <TextInput
            style={styles.search}
            placeholder="ابحث في المحادثات أو اكتب رقم..."
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
            data={listData}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 10) }}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              phoneQuery ? (
                <TouchableOpacity
                  style={styles.row}
                  onPress={pickPhone}
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
                    <Ionicons name="add" size={22} color={Colors.primary} />
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
            renderItem={({ item }) => {
              const on = isSelected(item.id);
              return (
                <TouchableOpacity
                  style={[styles.row, on && styles.rowOn]}
                  onPress={() => toggle(item)}
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
                  {renderCheck(on)}
                </TouchableOpacity>
              );
            }}
          />
        )}

        <TouchableOpacity
          style={[
            styles.sendBtn,
            { marginBottom: Math.max(insets.bottom, 12) },
            (selected.length === 0 || sending) && styles.sendBtnDisabled,
          ]}
          onPress={doForward}
          disabled={selected.length === 0 || sending}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.sendBtnText}>
              تحويل{selected.length ? ` (${selected.length})` : ''}
            </Text>
          )}
        </TouchableOpacity>
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
  count: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
    backgroundColor: '#E7F6EF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
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
  rowOn: {
    backgroundColor: '#E7F6EF',
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
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#C4CDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
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
  sendBtn: {
    backgroundColor: Colors.primary,
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
