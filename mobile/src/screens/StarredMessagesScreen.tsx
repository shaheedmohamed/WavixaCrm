import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { chatService } from '../services/chatService';
import { Conversation, StarredMessageItem } from '../types/crm';
import { ChatAvatar } from '../components/ChatAvatar';
import { Colors } from '../constants/theme';

interface StarredMessagesScreenProps {
  onBack: () => void;
  onOpenMessage: (conversation: Conversation, messageId: number | string) => void;
}

const chatTitleOf = (conv?: Conversation | null): string => {
  if (!conv) return 'محادثة';
  return (
    conv.contact_name ||
    (conv.contact_username ? `@${conv.contact_username}` : null) ||
    (conv.contact_phone ? `+${conv.contact_phone}` : 'عميل')
  );
};

const formatDayTime = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    const hm = `${hours}:${minutes} ${ampm}`;
    if (isToday) return hm;
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 1) return `أمس ${hm}`;
    const y = date.getFullYear();
    const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${d}/${mo}/${y} ${hm}`;
  } catch {
    return '';
  }
};

type IconName = keyof typeof Ionicons.glyphMap;

const typeIcon = (type?: string): { icon: IconName | ''; label: string } => {
  switch (type) {
    case 'image':
      return { icon: 'image-outline', label: 'صورة' };
    case 'video':
      return { icon: 'videocam-outline', label: 'فيديو' };
    case 'audio':
    case 'voice':
    case 'ptt':
      return { icon: 'mic-outline', label: 'رسالة صوتية' };
    case 'document':
      return { icon: 'document-outline', label: 'مستند' };
    case 'sticker':
      return { icon: 'happy-outline', label: 'ملصق' };
    case 'location':
      return { icon: 'location-outline', label: 'موقع' };
    case 'contact':
      return { icon: 'person-outline', label: 'جهة اتصال' };
    default:
      return { icon: '', label: '' };
  }
};

const previewText = (item: StarredMessageItem): { icon: IconName | ''; text: string } => {
  const t = typeIcon(item.message_type);
  const body = (item.message || '').trim();
  const caption = (item.media_caption || '').trim();
  if (t.icon) {
    return { icon: t.icon, text: caption || t.label };
  }
  return { icon: '', text: body || 'رسالة' };
};

export const StarredMessagesScreen: React.FC<StarredMessagesScreenProps> = ({
  onBack,
  onOpenMessage,
}) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<StarredMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const res = await chatService.getStarredMessages();
      if (res?.success && Array.isArray(res.messages)) {
        setItems(res.messages);
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => load('initial'));
  }, [load]);

  const renderItem = useCallback(
    ({ item }: { item: StarredMessageItem }) => {
      const conv = item.conversation;
      const title = chatTitleOf(conv);
      const preview = previewText(item);
      const senderLabel =
        item.direction === 'outgoing'
          ? 'أنت'
          : item.sender_name ||
            (conv?.is_group ? title : null) ||
            title;

      return (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.65}
          onPress={() => conv && onOpenMessage(conv, item.id)}
        >
          <View style={styles.rowInner}>
            <ChatAvatar
              conversation={{
                id: conv?.id ?? 0,
                contact_jid: conv?.contact_jid ?? '',
                contact_avatar: conv?.contact_avatar ?? null,
              }}
              title={title}
              size={46}
            />

            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.chatTitle} numberOfLines={1}>
                  {title}
                  {conv?.is_group ? '  (مجموعة)' : ''}
                </Text>
                <Text style={styles.timeText}>{formatDayTime(item.timestamp)}</Text>
              </View>

              <View style={styles.previewRow}>
                {preview.icon ? (
                  <Ionicons
                    name={preview.icon}
                    size={15}
                    color="#667781"
                    style={styles.previewIcon}
                  />
                ) : null}
                <Text style={styles.previewText} numberOfLines={2}>
                  {senderLabel}: {preview.text}
                </Text>
              </View>

              <View style={styles.starMetaRow}>
                <Ionicons name="star" size={11} color="#F59E0B" />
                <Text style={styles.starMetaText} numberOfLines={1}>
                  {item.starred_by?.name ? `ميّزها ${item.starred_by.name}` : 'رسالة مميزة'}
                  {item.starred_at ? ` • ${formatDayTime(item.starred_at)}` : ''}
                </Text>
              </View>
            </View>

            <Ionicons name="chevron-back" size={17} color="#C2C9CE" />
          </View>
        </TouchableOpacity>
      );
    },
    [onOpenMessage]
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>الرسائل المميزة</Text>
          <Text style={styles.headerSub}>
            {items.length > 0 ? `${items.length} رسالة` : 'كل الرسائل المميزة بنجمة في النظام'}
          </Text>
        </View>
        <Ionicons name="star" size={22} color="#FBBF24" style={styles.headerStar} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>جاري تحميل الرسائل المميزة...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerBox}>
          <View style={styles.emptyStarWrap}>
            <Ionicons name="star-outline" size={44} color="#C2C9CE" />
          </View>
          <Text style={styles.emptyTitle}>لا توجد رسائل مميزة</Text>
          <Text style={styles.emptySub}>
            اضغط مطولًا على أي رسالة داخل المحادثة ثم اختر «تمييز بنجمة» لتظهر هنا
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
          initialNumToRender={18}
          windowSize={9}
          removeClippedSubviews
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.headerBg,
    paddingBottom: 12,
    paddingHorizontal: 10,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11.5,
    marginTop: 2,
  },
  headerStar: {
    marginLeft: 2,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  centerText: {
    fontSize: 13,
    color: '#667781',
  },
  emptyStarWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111B21',
  },
  emptySub: {
    fontSize: 13,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingVertical: 8,
  },
  row: {
    backgroundColor: '#FFFFFF',
  },
  rowInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chatTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
  },
  timeText: {
    fontSize: 11,
    color: '#8696A0',
  },
  previewRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 5,
  },
  previewIcon: {
    marginTop: 1.5,
  },
  previewText: {
    flex: 1,
    fontSize: 13,
    color: '#54656F',
    textAlign: 'right',
    lineHeight: 18,
  },
  starMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  starMetaText: {
    flex: 1,
    fontSize: 11,
    color: '#8696A0',
    textAlign: 'right',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E9EDEF',
    marginRight: 72,
  },
});
