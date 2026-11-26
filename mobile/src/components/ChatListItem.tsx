import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ChatAvatar } from './ChatAvatar';
import { useNow } from '../hooks/useNow';
import { Conversation } from '../types/crm';
import { Colors } from '../constants/theme';

export const CHAT_LIST_ITEM_HEIGHT = 78;

export interface ChatListTag {
  name: string;
  color?: string | null;
}

interface ChatListItemProps {
  conversation: Conversation;
  onPress: () => void;
  onPressIn?: () => void;
  onAvatarPress?: () => void;
  onLongPress?: () => void;
  currentUserId?: number;
  isMuted?: boolean;
  isFavorite?: boolean;
  isMarkedUnread?: boolean;
  listTags?: ChatListTag[];
  selectionMode?: boolean;
  isSelected?: boolean;
}

const formatTime = (isoString?: string | null) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'م' : 'ص';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    }
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 1) return 'أمس';
    if (diffDays >= 0 && diffDays < 7) {
      const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      return days[date.getDay()];
    }
    return `${date.getDate()}/${date.getMonth() + 1}`;
  } catch {
    return '';
  }
};

const ChatListItemComponent: React.FC<ChatListItemProps> = ({
  conversation,
  onPress,
  onPressIn,
  onAvatarPress,
  onLongPress,
  currentUserId,
  isMuted = false,
  isFavorite = false,
  isMarkedUnread = false,
  listTags = [],
  selectionMode = false,
  isSelected = false,
}) => {
  const title =
    conversation.contact_name ||
    (conversation.contact_username ? `@${conversation.contact_username}` : null) ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل واتساب');

  const timeDisplay = formatTime(conversation.last_message_at);
  const unreadTotal = conversation.unread_count || 0;
  const showUnreadHighlight = unreadTotal > 0 || isMarkedUnread;

  const renderTicks = () => {
    if (conversation.last_message_direction !== 'outgoing') return null;
    const status = conversation.last_message_status;
    if (status === 'pending') {
      return <Ionicons name="time-outline" size={13} color="#8696A0" style={styles.ticks} />;
    }
    if (status === 'read') {
      return <Ionicons name="checkmark-done" size={14} color="#53BDEB" style={styles.ticks} />;
    }
    if (status === 'delivered') {
      return <Ionicons name="checkmark-done" size={14} color="#8696A0" style={styles.ticks} />;
    }
    return <Ionicons name="checkmark" size={14} color="#8696A0" style={styles.ticks} />;
  };

  const isTyping = Boolean(conversation.typing);
  const typingLabel = conversation.typing?.by
    ? `${conversation.typing.by} يكتب الآن…`
    : 'يكتب الآن…';

  const previewText = () => {
    const t = conversation.last_message_type;
    if (t === 'image') return '📷 صورة';
    if (t === 'video') return '🎥 فيديو';
    if (t === 'audio' || t === 'voice') return '🎤 تسجيل صوتي';
    if (t === 'document') return '📄 مستند';
    if (t === 'sticker') return 'ملصق';
    if (t === 'location') return '📍 موقع';
    if (t === 'contact') return '👤 جهة اتصال';
    if (t === 'call') return '📞 مكالمة';
    return conversation.last_message || 'بدء المحادثة';
  };

  const isAssignedToMe = Boolean(currentUserId && conversation.assigned_agent_id === currentUserId);
  // The list payload exposes the transferer as `transferred_by_agent` (and
  // realtime broadcasts as `transferred_by_user`); accept either.
  const transferredFrom =
    conversation.transferred_by_agent?.name || conversation.transferred_by_user?.name || null;
  const lastSenderName =
    conversation.last_message_direction === 'outgoing' && conversation.last_outgoing_user
      ? conversation.last_outgoing_user.name
      : null;

  // SLA wait badge — the customer's last message is still unanswered.
  const now = useNow(30_000);
  const waitingMinutes =
    !conversation.resolved_at &&
    conversation.last_message_direction === 'incoming' &&
    conversation.last_message_at
      ? Math.max(
          0,
          Math.floor((now - new Date(conversation.last_message_at).getTime()) / 60000)
        )
      : 0;
  const isSnoozed =
    !!conversation.snoozed_until && new Date(conversation.snoozed_until).getTime() > now;
  const isOnline = conversation.presence === 'available';

  return (
    <TouchableOpacity
      style={[styles.card, isSelected && styles.cardSelected]}
      onPress={onPress}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      delayLongPress={260}
      activeOpacity={0.72}
    >
      {selectionMode && (
        <View style={[styles.selectCircle, isSelected && styles.selectCircleActive]}>
          {isSelected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        </View>
      )}

      <TouchableOpacity
        style={styles.avatarContainer}
        onPress={onAvatarPress}
        activeOpacity={0.8}
        disabled={!onAvatarPress}
      >
        <ChatAvatar conversation={conversation} title={title} size={50} badge />
        {isOnline && <View style={styles.onlineDot} />}
      </TouchableOpacity>

      <View style={styles.centerInfo}>
        <View style={styles.topRow}>
          <Text style={styles.contactName} numberOfLines={1}>
            {title}
          </Text>
          {isFavorite && (
            <Ionicons name="heart" size={12} color="#E11D48" />
          )}
        </View>

        <View style={styles.bottomRow}>
          {isTyping ? null : renderTicks()}
          <Text
            style={[
              styles.lastMessage,
              showUnreadHighlight && styles.lastMessageUnread,
              isTyping && styles.typingText,
            ]}
            numberOfLines={1}
          >
            {isTyping ? typingLabel : previewText()}
          </Text>
        </View>

        <View style={styles.tagRow}>
          {conversation.session?.device_name ? (
            <View style={styles.deviceTag}>
              <Text style={styles.deviceTagText} numberOfLines={1}>
                {conversation.session.device_name}
              </Text>
            </View>
          ) : null}

          {conversation.assigned_agent ? (
            <View
              style={[
                styles.agentTag,
                isAssignedToMe ? styles.agentTagMe : styles.agentTagOther,
              ]}
            >
              <Text
                style={[
                  styles.agentTagText,
                  isAssignedToMe ? styles.agentTagTextMe : styles.agentTagTextOther,
                ]}
                numberOfLines={1}
              >
                {isAssignedToMe ? 'معي' : conversation.assigned_agent.name}
              </Text>
            </View>
          ) : null}

          {transferredFrom && (
            <View style={styles.transferredTag}>
              <Text style={styles.transferredTagText} numberOfLines={1}>
                ↩ محولة من {transferredFrom}
              </Text>
            </View>
          )}

          {lastSenderName ? (
            <View style={styles.repliedTag}>
              <Text style={styles.repliedTagText} numberOfLines={1}>
                رد: {lastSenderName}
              </Text>
            </View>
          ) : null}

          {conversation.resolved_at ? (
            <View style={styles.resolvedTag}>
              <Text style={styles.resolvedTagText} numberOfLines={1}>
                ✓ مكتمل
              </Text>
            </View>
          ) : null}

          {isSnoozed && (
            <View style={styles.snoozedTag}>
              <MaterialCommunityIcons name="sleep" size={10} color="#6366F1" />
              <Text style={styles.snoozedTagText} numberOfLines={1}>
                مؤجلة
              </Text>
            </View>
          )}

          {waitingMinutes >= 1 && (
            <View style={styles.waitingTag}>
              <Ionicons name="time-outline" size={10} color="#DC2626" />
              <Text style={styles.waitingTagText} numberOfLines={1}>
                من {waitingMinutes >= 60
                  ? `${Math.floor(waitingMinutes / 60)}س${waitingMinutes % 60 ? ` ${waitingMinutes % 60}د` : ''}`
                  : `${waitingMinutes} د`}
              </Text>
            </View>
          )}

          {listTags.slice(0, 2).map((lt) => {
            const c = lt.color || '#7C3AED';
            return (
              <View
                key={lt.name}
                style={[styles.listTag, { backgroundColor: `${c}1F`, borderColor: c }]}
              >
                <Text style={[styles.listTagText, { color: c }]} numberOfLines={1}>
                  {lt.name}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.leftMeta}>
        <Text
          style={[
            styles.timeText,
            showUnreadHighlight && styles.timeTextUnread,
          ]}
        >
          {timeDisplay}
        </Text>

        <View style={styles.badgeRow}>
          {isMuted && (
            <MaterialCommunityIcons
              name="volume-off"
              size={15}
              color="#8696A0"
            />
          )}

          {conversation.is_pinned && (
            <MaterialCommunityIcons
              name="pin"
              size={14}
              color="#667781"
              style={styles.pinIcon}
            />
          )}

          {unreadTotal > 0 ? (
            <View style={[styles.unreadBadge, isMuted && styles.unreadBadgeMuted]}>
              <Text style={styles.unreadCount}>
                {unreadTotal > 99 ? '99+' : unreadTotal}
              </Text>
            </View>
          ) : isMarkedUnread ? (
            <View style={[styles.unreadDot, isMuted && styles.unreadBadgeMuted]} />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    height: CHAT_LIST_ITEM_HEIGHT,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F5',
  },
  cardSelected: {
    backgroundColor: '#E8F8F5',
  },
  selectCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
    backgroundColor: '#FFFFFF',
  },
  selectCircleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  avatarContainer: {
    position: 'relative',
    marginLeft: 12,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 1,
    left: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#25D366',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  centerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  contactName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#111B21',
    flexShrink: 1,
    textAlign: 'right',
  },
  bottomRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    minHeight: 18,
  },
  ticks: {
    marginLeft: 2,
  },
  lastMessage: {
    fontSize: 12.5,
    color: '#667781',
    flexShrink: 1,
    textAlign: 'right',
  },
  typingText: {
    color: '#00A884',
    fontWeight: '600',
  },
  lastMessageUnread: {
    color: '#111B21',
    fontWeight: '600',
  },
  tagRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    minHeight: 16,
  },
  deviceTag: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    maxWidth: 85,
  },
  deviceTagText: {
    fontSize: 9.5,
    color: '#667781',
    fontWeight: '600',
  },
  agentTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    maxWidth: 80,
  },
  agentTagMe: {
    backgroundColor: '#E8F8F5',
  },
  agentTagOther: {
    backgroundColor: '#FEF3C7',
  },
  agentTagText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  agentTagTextMe: {
    color: '#00A884',
  },
  agentTagTextOther: {
    color: '#D97706',
  },
  transferredTag: {
    backgroundColor: '#FFF7ED',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    maxWidth: 110,
  },
  transferredTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#EA580C',
  },
  repliedTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    maxWidth: 90,
  },
  repliedTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2563EB',
  },
  resolvedTag: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  resolvedTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#667781',
  },
  listTag: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    borderWidth: 1,
    maxWidth: 72,
  },
  listTagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  snoozedTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  snoozedTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6366F1',
  },
  waitingTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  waitingTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#DC2626',
  },
  leftMeta: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minWidth: 56,
    height: 46,
    marginRight: 6,
  },
  timeText: {
    fontSize: 11,
    color: '#8696A0',
  },
  timeTextUnread: {
    color: '#00A884',
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pinIcon: {
    transform: [{ rotate: '45deg' }],
  },
  unreadBadge: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeMuted: {
    backgroundColor: '#94A3B8',
  },
  unreadDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#25D366',
  },
  unreadCount: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
});

export const ChatListItem = React.memo(ChatListItemComponent);
