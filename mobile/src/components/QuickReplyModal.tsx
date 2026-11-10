import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { chatService } from '../services/chatService';
import { QuickReply } from '../types/crm';
import { Colors } from '../constants/theme';

interface QuickReplyModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectReply: (replyText: string) => void;
}

export const QuickReplyModal: React.FC<QuickReplyModalProps> = ({
  visible,
  onClose,
  onSelectReply,
}) => {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      setSearch('');
      setLoading(true);
      chatService
        .getQuickReplies()
        .then((res) => {
          if (res.success && res.quick_replies) {
            setReplies(res.quick_replies);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [visible]);

  const filtered = replies.filter(
    (r) =>
      r.shortcut.toLowerCase().includes(search.toLowerCase()) ||
      r.message.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#111B21" />
            </TouchableOpacity>
            <Text style={styles.title}>الردود السريعة</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Search bar */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#8696A0" style={{ marginLeft: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث في الردود أو الاختصارات..."
              placeholderTextColor="#8696A0"
              value={search}
              onChangeText={setSearch}
              textAlign="right"
            />
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.primary} size="small" />
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons name="flash-off" size={36} color="#8696A0" />
              <Text style={styles.emptyText}>لا توجد ردود سريعة مضافة</Text>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.itemCard}
                  onPress={() => {
                    onSelectReply(item.message);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.shortcutTag}>
                    <Text style={styles.shortcutText}>/{item.shortcut}</Text>
                  </View>
                  <Text style={styles.messageText} numberOfLines={2}>
                    {item.message}
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '75%',
    minHeight: 350,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  closeBtn: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#111B21',
    fontSize: 12.5,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#8696A0',
  },
  itemCard: {
    backgroundColor: '#F8FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E9EDEF',
    alignItems: 'flex-end',
  },
  shortcutTag: {
    backgroundColor: '#E8F8F5',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 4,
  },
  shortcutText: {
    color: Colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  messageText: {
    fontSize: 12.5,
    color: '#111B21',
    lineHeight: 18,
    textAlign: 'right',
  },
});
