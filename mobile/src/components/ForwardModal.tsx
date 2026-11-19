import React, { useEffect, useState } from 'react';
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
 *  web chat uses (/crm/messages/forward). */
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

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    Promise.resolve().then(async () => {
      if (!alive) return;
      setSearch('');
      setLoading(true);
      try {
        const res = await chatService.getConversations({ per_page: 50 });
        if (alive && res.success && res.conversations) {
          setConversations(
            res.conversations.filter((c: Conversation) => c.id !== currentConversationId)
          );
        }
      } catch {
      } finally {
        if (alive) setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [visible, currentConversationId]);

  const filtered = search.trim()
    ? conversations.filter((c) => {
        const q = search.trim().toLowerCase();
        return (
          (c.contact_name || '').toLowerCase().includes(q) ||
          (c.contact_phone || '').includes(q) ||
          (c.contact_username || '').toLowerCase().includes(q)
        );
      })
    : conversations;

  const title = (c: Conversation) =>
    c.contact_name ||
    (c.contact_username ? `@${c.contact_username}` : null) ||
    (c.contact_phone ? `+${c.contact_phone}` : 'عميل واتساب');

  const forward = async (conv: Conversation) => {
    const list = messages && messages.length > 0 ? messages : message ? [message] : [];
    if (list.length === 0 || sending) return;
    setSending(true);
    try {
      let ok = 0;
      for (const m of list) {
        try {
          const res = await chatService.forwardMessage(m.message_id || m.id, [conv.id]);
          if (res.success) ok += 1;
        } catch {}
      }
      if (ok > 0) {
        Alert.alert('تم', list.length > 1 ? `تمت إعادة توجيه ${ok} رسالة` : 'تمت إعادة توجيه الرسالة');
        onClose();
      } else {
        Alert.alert('فشل', 'تعذر إعادة التوجيه');
      }
    } catch (err: any) {
      Alert.alert('فشل', err.response?.data?.message || 'تعذر إعادة التوجيه');
    } finally {
      setSending(false);
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

        {loading ? (
          <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => String(c.id)}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 10) }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons name="chat-outline" size={44} color="#8696A0" />
                <Text style={styles.emptyText}>لا توجد محادثات</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => forward(item)}
                disabled={sending}
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
