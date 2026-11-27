import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ChatAvatar } from './ChatAvatar';
import { SlideToConfirm } from './SlideToConfirm';
import {
  SwipeableConversationRow,
  type ConvSwipeAction,
} from './SwipeableConversationRow';
import { chatService } from '../services/chatService';
import { Conversation } from '../types/crm';
import { Colors } from '../constants/theme';

interface MyChatsSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenConversation: (conv: Conversation) => void;
  onSnooze: (conv: Conversation) => void;
  /** Fired after any resolve (single or bulk) so the list/badges refresh. */
  onChanged: () => void;
  /** Bumped by the parent after a snooze succeeds — the row leaves the sheet. */
  snoozedConvId: number | null;
}

const convTitle = (c: Conversation) =>
  c.contact_name ||
  (c.contact_username ? `@${c.contact_username}` : null) ||
  (c.contact_phone ? `+${c.contact_phone}` : 'عميل واتساب');

export const MyChatsSheet: React.FC<MyChatsSheetProps> = ({
  visible,
  onClose,
  onOpenConversation,
  onSnooze,
  onChanged,
  snoozedConvId,
}) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [resolvingIds, setResolvingIds] = useState<Set<number>>(new Set());
  const [resolvingAll, setResolvingAll] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setLoading(true);
      setLoadError('');
      setResolvingIds(new Set());
      chatService
        .getConversations({ scope: 'mine', per_page: 100 })
        .then((res) => {
          if (alive && res.success && res.conversations) {
            setItems(res.conversations.filter((c) => !c.archived_at));
          } else if (alive) {
            setLoadError('تعذر تحميل محادثاتك');
          }
        })
        .catch(() => {
          if (alive) setLoadError('تعذر تحميل محادثاتك');
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  // A chat snoozed from inside the sheet leaves "محادثاتي" — drop its row.
  useEffect(() => {
    if (snoozedConvId != null) {
      Promise.resolve().then(() =>
        setItems((prev) => prev.filter((c) => c.id !== snoozedConvId))
      );
    }
  }, [snoozedConvId]);

  const handleResolveOne = useCallback(
    async (conv: Conversation) => {
      if (resolvingIds.has(conv.id) || resolvingAll) return;
      setResolvingIds((s) => new Set(s).add(conv.id));
      try {
        const res = await chatService.resolveConversation(conv.id);
        if (res.success) {
          setItems((prev) => prev.filter((c) => c.id !== conv.id));
          onChanged();
        } else {
          Alert.alert('تنبيه', res.message || 'فشل إنهاء المحادثة');
        }
      } catch (err: any) {
        Alert.alert(
          'تنبيه',
          err?.response?.data?.message || 'حدث خطأ أثناء إنهاء المحادثة'
        );
      } finally {
        setResolvingIds((s) => {
          const n = new Set(s);
          n.delete(conv.id);
          return n;
        });
      }
    },
    [resolvingIds, resolvingAll, onChanged]
  );

  const handleResolveAll = useCallback(async () => {
    const targets = items.filter((c) => !c.is_group);
    if (targets.length === 0 || resolvingAll) return;
    setResolvingAll(true);
    const results = await Promise.allSettled(
      targets.map((c) => chatService.resolveConversation(c.id))
    );
    const failedIds = new Set<number>();
    results.forEach((r, i) => {
      const ok = r.status === 'fulfilled' && r.value?.success;
      if (!ok) failedIds.add(targets[i].id);
    });
    setItems((prev) => prev.filter((c) => failedIds.has(c.id)));
    setResolvingAll(false);
    onChanged();
    if (failedIds.size === 0) {
      onClose();
    } else {
      Alert.alert(
        'تنبيه',
        `اتنهت ${targets.length - failedIds.size} من ${targets.length} محادثة — الباقي محتاج مراجعة`
      );
    }
  }, [items, resolvingAll, onChanged, onClose]);

  const resolvableCount = items.filter((c) => !c.is_group).length;

  const renderRow = useCallback(
    ({ item }: { item: Conversation }) => {
      const isGroup = Boolean(item.is_group);
      const resolving = resolvingIds.has(item.id);

      const leftActions: ConvSwipeAction[] = [
        {
          key: 'snooze',
          label: 'تذكير',
          icon: 'alarm-snooze',
          iconSet: 'mci',
          color: '#FFFFFF',
          bg: '#D97706',
          onPress: () => onSnooze(item),
        },
      ];
      const rightActions: ConvSwipeAction[] = isGroup
        ? []
        : [
            {
              key: 'resolve',
              label: 'إنهاء',
              icon: 'checkmark-done',
              iconSet: 'ion',
              color: '#FFFFFF',
              bg: '#00A884',
              onPress: () => handleResolveOne(item),
            },
          ];

      return (
        <SwipeableConversationRow
          leftActions={leftActions}
          rightActions={rightActions}
        >
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.75}
            onPress={() => onOpenConversation(item)}
          >
            <ChatAvatar conversation={item} title={convTitle(item)} size={38} />
            <View style={styles.rowText}>
              <Text style={styles.rowName} numberOfLines={1}>
                {convTitle(item)}
              </Text>
              <Text style={styles.rowMsg} numberOfLines={1}>
                {item.last_message || 'لا توجد رسائل'}
              </Text>
            </View>
            {(item.unread_count || 0) > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {item.unread_count > 99 ? '99+' : item.unread_count}
                </Text>
              </View>
            )}
            {!isGroup && (
              <TouchableOpacity
                style={styles.resolveBtn}
                onPress={() => handleResolveOne(item)}
                disabled={resolving || resolvingAll}
                hitSlop={6}
                activeOpacity={0.75}
              >
                {resolving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="checkmark-done" size={14} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </SwipeableConversationRow>
      );
    },
    [resolvingIds, resolvingAll, onSnooze, onOpenConversation, handleResolveOne]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* Modals live in their own view hierarchy on Android — the swipe
          gestures inside need a local root view or they never fire. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.backdrop}>
          {/* Full-screen dismiss layer sits BEHIND the card as a sibling —
              taps on the card never reach it. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={[styles.card, { top: insets.top + 54 }]}>
            <View style={styles.cardTail} />

            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderRight}>
                <MaterialCommunityIcons
                  name="account-multiple-outline"
                  size={17}
                  color={Colors.primaryDark}
                />
                <Text style={styles.cardTitle}>محادثاتي</Text>
                <View style={styles.countChip}>
                  <Text style={styles.countChipText}>{items.length}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
                <Ionicons name="close" size={19} color="#8696A0" />
              </TouchableOpacity>
            </View>

            <Text style={styles.hintText}>
              اسحب شمال للإنهاء ويمين للتذكير — أو دوس على الشات تفتحه
            </Text>

            {loading ? (
              <View style={styles.stateBox}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : loadError ? (
              <View style={styles.stateBox}>
                <Text style={styles.stateText}>{loadError}</Text>
              </View>
            ) : items.length === 0 ? (
              <View style={styles.stateBox}>
                <MaterialCommunityIcons
                  name="check-all"
                  size={26}
                  color="#00A884"
                />
                <Text style={styles.stateText}>
                  مفيش محادثات مفتوحة معاك دلوقتي
                </Text>
              </View>
            ) : (
              <FlatList
                data={items}
                keyExtractor={(c) => String(c.id)}
                renderItem={renderRow}
                style={styles.list}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                showsVerticalScrollIndicator={false}
              />
            )}

            {resolvableCount > 0 && (
              <View style={styles.footer}>
                <SlideToConfirm
                  key={resolvableCount}
                  label={`اسحب لإنهاء الكل (${resolvableCount})`}
                  onConfirm={handleResolveAll}
                  disabled={resolvingAll}
                  loading={resolvingAll}
                  height={46}
                />
              </View>
            )}
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    maxHeight: '62%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  cardTail: {
    position: 'absolute',
    top: -7,
    left: 56,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
  },
  cardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#111B21',
  },
  countChip: {
    backgroundColor: '#00A884',
    borderRadius: 9,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countChipText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  hintText: {
    fontSize: 10.5,
    color: '#8696A0',
    textAlign: 'right',
    marginTop: 6,
    marginBottom: 4,
  },
  list: {
    flexGrow: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EDF1F3',
    marginHorizontal: 4,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 9,
    paddingHorizontal: 4,
    gap: 9,
  },
  rowText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  rowName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  rowMsg: {
    fontSize: 11,
    color: '#8696A0',
    textAlign: 'right',
    marginTop: 2,
  },
  unreadBadge: {
    backgroundColor: '#25D366',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  resolveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    gap: 8,
  },
  stateText: {
    fontSize: 12,
    color: '#8696A0',
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    marginTop: 10,
  },
});
