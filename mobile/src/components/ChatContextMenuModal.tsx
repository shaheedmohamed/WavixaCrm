import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from './ChatAvatar';
import { useNow } from '../hooks/useNow';
import { Conversation } from '../types/crm';
import { Colors } from '../constants/theme';

interface ChatContextMenuModalProps {
  conversation: Conversation | null;
  isMuted: boolean;
  isFavorite: boolean;
  isMarkedUnread: boolean;
  canArchive: boolean;
  currentUserId?: number;
  isAgent?: boolean;
  onClose: () => void;
  onTogglePin: (conv: Conversation) => void;
  onToggleArchive: (conv: Conversation) => void;
  onMute: (conv: Conversation, duration: number | 'forever' | null) => void;
  onToggleFavorite: (conv: Conversation) => void;
  onToggleUnread: (conv: Conversation) => void;
  onOpenAddToList: (conv: Conversation) => void;
  onEnterSelectMode: (conv: Conversation) => void;
  onClaim?: (conv: Conversation) => void;
  onTransfer?: (conv: Conversation) => void;
  onResolve?: (conv: Conversation) => void;
  onSnooze?: (conv: Conversation) => void;
  onOpenNotes?: (conv: Conversation) => void;
}

export const ChatContextMenuModal: React.FC<ChatContextMenuModalProps> = ({
  conversation,
  isMuted,
  isFavorite,
  isMarkedUnread,
  canArchive,
  onClose,
  onTogglePin,
  onToggleArchive,
  onMute,
  onToggleFavorite,
  onToggleUnread,
  onOpenAddToList,
  onEnterSelectMode,
  onClaim,
  onTransfer,
  onResolve,
  onSnooze,
  onOpenNotes,
  currentUserId,
  isAgent,
}) => {
  const insets = useSafeAreaInsets();
  const [showMuteStep, setShowMuteStep] = useState(false);
  const now = useNow(30_000, !!conversation);

  useEffect(() => {
    if (!conversation) {
      Promise.resolve().then(() => setShowMuteStep(false));
    }
  }, [conversation]);

  if (!conversation) return null;

  const title =
    conversation.contact_name ||
    (conversation.contact_username ? `@${conversation.contact_username}` : null) ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل واتساب');

  const isArchived = Boolean(conversation.archived_at);
  const isPinned = Boolean(conversation.is_pinned);
  const hasUnread = (conversation.unread_count || 0) > 0 || isMarkedUnread;
  const isSnoozed =
    !!conversation.snoozed_until &&
    new Date(conversation.snoozed_until).getTime() > now;

  // Distribution actions — same rules as the web desk: groups are never
  // exclusively held; agents claim unassigned work and can only act on the
  // chats they hold, while owners can manage anything.
  const isGroup = Boolean(conversation.is_group);
  const heldByMe = Boolean(currentUserId && conversation.assigned_agent_id === currentUserId);
  const canClaim = Boolean(isAgent && !conversation.assigned_agent_id && !isGroup && onClaim);
  const canTransfer = Boolean(!isGroup && onTransfer && (!isAgent || heldByMe));
  const canResolve = Boolean(!isGroup && onResolve && (!isAgent || heldByMe));

  const muteDurations: { label: string; sub: string; value: number | 'forever' }[] = [
    { label: '٨ ساعات', sub: 'كتم الإشعارات مؤقتاً خلال الدوام', value: 8 * 3600 * 1000 },
    { label: 'أسبوع واحد', sub: 'إيقاف التنبيهات لمدة ٧ أيام', value: 7 * 24 * 3600 * 1000 },
    { label: 'دائماً', sub: 'كتم مستمر حتى تقوم بإلغائه', value: 'forever' },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.convHeader}>
            <ChatAvatar conversation={conversation} title={title} size={46} badge />
            <View style={styles.convInfo}>
              <Text style={styles.convTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.convSub} numberOfLines={1}>
                {conversation.contact_phone ? `+${conversation.contact_phone}` : 'محادثة واتساب'}
                {conversation.session?.device_name ? ` • ${conversation.session.device_name}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color="#667781" />
            </TouchableOpacity>
          </View>

          {showMuteStep ? (
            <View style={styles.muteSubWrap}>
              <View style={styles.muteHeaderRow}>
                <TouchableOpacity
                  onPress={() => setShowMuteStep(false)}
                  style={styles.backSubBtn}
                  hitSlop={8}
                >
                  <Ionicons name="arrow-forward" size={20} color="#111B21" />
                </TouchableOpacity>
                <Text style={styles.muteTitle}>كتم إشعارات هذه المحادثة لمدة...</Text>
              </View>

              {muteDurations.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={styles.muteOption}
                  onPress={() => {
                    onMute(conversation, opt.value);
                    setShowMuteStep(false);
                    onClose();
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.muteOptIcon}>
                    <MaterialCommunityIcons name="bell-off-outline" size={20} color={Colors.primary} />
                  </View>
                  <View style={styles.muteOptTextWrap}>
                    <Text style={styles.muteOptLabel}>{opt.label}</Text>
                    <Text style={styles.muteOptSub}>{opt.sub}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.actionsList}>
              {canClaim && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onClaim?.(conversation);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#E8F8F5' }]}>
                    <MaterialCommunityIcons
                      name="hand-back-right-outline"
                      size={20}
                      color={Colors.primaryDark}
                    />
                  </View>
                  <Text style={styles.actionLabel}>استلام المحادثة</Text>
                </TouchableOpacity>
              )}

              {canTransfer && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onTransfer?.(conversation);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#EEF2FF' }]}>
                    <MaterialCommunityIcons
                      name="account-switch-outline"
                      size={20}
                      color="#4F46E5"
                    />
                  </View>
                  <Text style={styles.actionLabel}>تحويل لموظف</Text>
                </TouchableOpacity>
              )}

              {canResolve && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onResolve?.(conversation);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={20}
                      color="#059669"
                    />
                  </View>
                  <Text style={styles.actionLabel}>إنهاء المحادثة (مكتمل)</Text>
                </TouchableOpacity>
              )}

              {(canClaim || canTransfer || canResolve) && <View style={styles.divider} />}

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onTogglePin(conversation);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, { backgroundColor: '#E8F8F5' }]}>
                  <MaterialCommunityIcons
                    name={isPinned ? 'pin-off-outline' : 'pin-outline'}
                    size={20}
                    color={Colors.primaryDark}
                  />
                </View>
                <Text style={styles.actionLabel}>
                  {isPinned ? 'إلغاء تثبيت المحادثة' : 'تثبيت المحادثة'}
                </Text>
              </TouchableOpacity>

              {canArchive && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onToggleArchive(conversation);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialCommunityIcons
                      name={isArchived ? 'archive-arrow-up-outline' : 'archive-arrow-down-outline'}
                      size={20}
                      color="#2563EB"
                    />
                  </View>
                  <Text style={styles.actionLabel}>
                    {isArchived ? 'إلغاء الأرشفة' : 'أرشفة المحادثة'}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  if (isMuted) {
                    onClose();
                    onMute(conversation, null);
                  } else {
                    setShowMuteStep(true);
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons
                    name={isMuted ? 'bell-ring-outline' : 'bell-off-outline'}
                    size={20}
                    color="#D97706"
                  />
                </View>
                <Text style={styles.actionLabel}>
                  {isMuted ? 'إلغاء كتم الإشعارات' : 'كتم الإشعارات'}
                </Text>
                {!isMuted && (
                  <Ionicons name="chevron-back" size={18} color="#8696A0" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onToggleFavorite(conversation);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, { backgroundColor: '#FFE4E6' }]}>
                  <Ionicons
                    name={isFavorite ? 'heart-dislike-outline' : 'heart-outline'}
                    size={20}
                    color="#E11D48"
                  />
                </View>
                <Text style={styles.actionLabel}>
                  {isFavorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                </Text>
              </TouchableOpacity>

              {onSnooze && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onSnooze(conversation);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#EEF2FF' }]}>
                    <MaterialCommunityIcons
                      name={isSnoozed ? 'alarm-off' : 'alarm-snooze'}
                      size={20}
                      color="#6366F1"
                    />
                  </View>
                  <Text style={styles.actionLabel}>
                    {isSnoozed ? 'إدارة التأجيل / إلغاؤه' : 'ذكّرني لاحقاً (تأجيل)'}
                  </Text>
                  <Ionicons name="chevron-back" size={18} color="#8696A0" />
                </TouchableOpacity>
              )}

              {onOpenNotes && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onOpenNotes(conversation);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#FFFBEA' }]}>
                    <MaterialCommunityIcons
                      name="note-text-outline"
                      size={20}
                      color="#92700C"
                    />
                  </View>
                  <Text style={styles.actionLabel}>ملاحظات داخلية</Text>
                  <Ionicons name="chevron-back" size={18} color="#8696A0" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onOpenAddToList(conversation);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, { backgroundColor: '#F3E8FF' }]}>
                  <MaterialCommunityIcons
                    name="playlist-plus"
                    size={22}
                    color="#7C3AED"
                  />
                </View>
                <Text style={styles.actionLabel}>إضافة إلى قائمة أو فلتر</Text>
                <Ionicons name="chevron-back" size={18} color="#8696A0" />
              </TouchableOpacity>

              {(conversation.unread_count || 0) === 0 && (
                <TouchableOpacity
                  style={styles.actionRow}
                  onPress={() => {
                    onClose();
                    onToggleUnread(conversation);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconBox, { backgroundColor: '#F0F2F5' }]}>
                    <MaterialCommunityIcons
                      name={hasUnread ? 'email-open-outline' : 'email-mark-as-unread'}
                      size={20}
                      color="#54656F"
                    />
                  </View>
                  <Text style={styles.actionLabel}>
                    {hasUnread ? 'تمييز كمقروءة' : 'تمييز كغير مقروءة'}
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => {
                  onClose();
                  onEnterSelectMode(conversation);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconBox, { backgroundColor: '#F0F2F5' }]}>
                  <MaterialCommunityIcons
                    name="checkbox-multiple-marked-outline"
                    size={20}
                    color="#111B21"
                  />
                </View>
                <Text style={styles.actionLabel}>تحديد عدة محادثات</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 20, 26, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D7DB',
    alignSelf: 'center',
    marginBottom: 10,
  },
  convHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9EDEF',
    marginBottom: 6,
    gap: 10,
  },
  convInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  convTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
  },
  convSub: {
    fontSize: 11.5,
    color: '#667781',
    marginTop: 2,
    textAlign: 'right',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsList: {
    paddingVertical: 2,
  },
  actionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 12,
    gap: 12,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111B21',
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E9EDEF',
    marginVertical: 4,
  },
  muteSubWrap: {
    paddingVertical: 6,
  },
  muteHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  backSubBtn: {
    padding: 4,
  },
  muteTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
  },
  muteOption: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFB',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E9EDEF',
    gap: 12,
  },
  muteOptIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F8F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteOptTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  muteOptLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111B21',
  },
  muteOptSub: {
    fontSize: 11,
    color: '#667781',
    marginTop: 1,
  },
});
