import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
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
import { Conversation, ScheduledMessageItem } from '../types/crm';
import { ChatAvatar } from '../components/ChatAvatar';
import { Colors } from '../constants/theme';

interface ScheduledMessagesScreenProps {
  onBack: () => void;
  onOpenConversation: (conversation: Conversation) => void;
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
    if (isToday) return `اليوم ${hm}`;
    const tomorrow = new Date(now.getTime() + 86400000);
    const isTomorrow =
      date.getDate() === tomorrow.getDate() &&
      date.getMonth() === tomorrow.getMonth() &&
      date.getFullYear() === tomorrow.getFullYear();
    if (isTomorrow) return `غداً ${hm}`;
    const y = date.getFullYear();
    const mo = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${d}/${mo}/${y} ${hm}`;
  } catch {
    return '';
  }
};

const RESCHEDULE_PRESETS: { label: string; at: () => Date }[] = [
  { label: 'بعد ساعة', at: () => new Date(Date.now() + 3600_000) },
  {
    label: 'غداً 9 صباحاً',
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'غداً 6 مساءً',
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(18, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'بعد 3 أيام 9 صباحاً',
    at: () => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

export const ScheduledMessagesScreen: React.FC<ScheduledMessagesScreenProps> = ({
  onBack,
  onOpenConversation,
}) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ScheduledMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rescheduling, setRescheduling] = useState<ScheduledMessageItem | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    try {
      const res = await chatService.listAllScheduledMessages();
      if (res?.success && Array.isArray(res.scheduled)) {
        setItems(res.scheduled);
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

  const cancelItem = useCallback((item: ScheduledMessageItem) => {
    Alert.alert('إلغاء الرسالة المجدولة', 'متأكد إنك عايز تلغي الرسالة دي؟', [
      { text: 'رجوع', style: 'cancel' },
      {
        text: 'إلغاء الرسالة',
        style: 'destructive',
        onPress: async () => {
          setItems((prev) => prev.filter((s) => s.id !== item.id));
          try {
            await chatService.cancelScheduledMessage(item.id);
          } catch {}
        },
      },
    ]);
  }, []);

  const applyReschedule = useCallback(
    async (sendAt: Date) => {
      const item = rescheduling;
      if (!item) return;
      setRescheduling(null);
      setBusyId(item.id);
      const iso = sendAt.toISOString();
      try {
        const res = await chatService.rescheduleScheduledMessage(item.id, iso);
        if (res?.success) {
          setItems((prev) =>
            prev
              .map((s) => (s.id === item.id ? { ...s, send_at: res.scheduled?.send_at || iso } : s))
              .sort((a, b) => a.send_at.localeCompare(b.send_at))
          );
        } else {
          Alert.alert('خطأ', res?.message || 'تعذر إعادة الجدولة');
        }
      } catch (err: any) {
        Alert.alert('خطأ', err?.response?.data?.message || 'تعذر إعادة الجدولة');
      } finally {
        setBusyId(null);
      }
    },
    [rescheduling]
  );

  const renderItem = useCallback(
    ({ item }: { item: ScheduledMessageItem }) => {
      const conv = item.conversation;
      const title = chatTitleOf(conv);
      return (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.65}
          onPress={() => conv && onOpenConversation(conv)}
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
                <View style={styles.timeChip}>
                  <Ionicons name="time-outline" size={12} color={Colors.primary} />
                  <Text style={styles.timeText}>{formatDayTime(item.send_at)}</Text>
                </View>
              </View>

              <Text style={styles.previewText} numberOfLines={2}>
                {item.body}
              </Text>

              <View style={styles.metaRow}>
                {item.by ? (
                  <Text style={styles.byText} numberOfLines={1}>
                    جدولها {item.by}
                  </Text>
                ) : null}
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => setRescheduling(item)}
                      hitSlop={6}
                    >
                      <Ionicons name="calendar-outline" size={15} color={Colors.primary} />
                      <Text style={styles.actionText}>إعادة جدولة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => cancelItem(item)}
                      hitSlop={6}
                    >
                      <Ionicons name="close-circle-outline" size={15} color="#EF4444" />
                      <Text style={[styles.actionText, { color: '#EF4444' }]}>إلغاء</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [busyId, cancelItem, onOpenConversation]
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>الرسائل المجدولة</Text>
          <Text style={styles.headerSub}>
            {items.length > 0 ? `${items.length} رسالة منتظرة` : 'كل الرسايل المجدولة في كل المحادثات'}
          </Text>
        </View>
        <Ionicons name="alarm-outline" size={22} color="#FBBF24" style={styles.headerIcon} />
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centerText}>جاري تحميل الرسائل المجدولة...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerBox}>
          <View style={styles.emptyWrap}>
            <Ionicons name="alarm-outline" size={44} color="#C2C9CE" />
          </View>
          <Text style={styles.emptyTitle}>لا توجد رسائل مجدولة</Text>
          <Text style={styles.emptySub}>
            اضغط مطولًا على زر الإرسال داخل أي محادثة لجدولة رسالة — هتلاقيها هنا
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

      <Modal
        visible={!!rescheduling}
        transparent
        animationType="fade"
        onRequestClose={() => setRescheduling(null)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setRescheduling(null)}>
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>إعادة جدولة الإرسال</Text>
            {RESCHEDULE_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={styles.sheetPreset}
                onPress={() => applyReschedule(p.at())}
              >
                <Ionicons name="time-outline" size={18} color="#00A884" />
                <Text style={styles.sheetPresetText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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
    paddingHorizontal: 10,
    paddingBottom: 12,
    elevation: 4,
  },
  backBtn: {
    padding: 6,
    marginLeft: 4,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  headerIcon: {
    marginHorizontal: 8,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  centerText: {
    marginTop: 14,
    fontSize: 14,
    color: '#667781',
  },
  emptyWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
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
    marginTop: 8,
    lineHeight: 20,
  },
  listContent: {
    paddingVertical: 6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  row: {
    backgroundColor: '#FFFFFF',
  },
  rowInner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowBody: {
    flex: 1,
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
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E7F6EF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  previewText: {
    fontSize: 13.5,
    color: '#3B4A54',
    marginTop: 5,
    textAlign: 'right',
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 24,
  },
  byText: {
    fontSize: 11.5,
    color: '#8696A0',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  actionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.primary,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'center',
    marginBottom: 12,
  },
  sheetPreset: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 8,
  },
  sheetPresetText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#111B21',
  },
});
