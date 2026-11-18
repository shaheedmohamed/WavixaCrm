import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { ChatAvatar } from './ChatAvatar';
import { Conversation } from '../types/crm';
import { Colors } from '../constants/theme';

export const CHAT_LIST_ITEM_HEIGHT = 78;

interface ChatListItemProps {
  conversation: Conversation;
  onPress: () => void;
  onPressIn?: () => void;
  onLongPress?: () => void;
  currentUserId?: number;
  isMuted?: boolean;
  isFavorite?: boolean;
  isMarkedUnread?: boolean;
  listNames?: string[];
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
  onLongPress,
  currentUserId,
  isMuted = false,
  isFavorite = false,
  isMarkedUnread = false,
  listNames = [],
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

      <View style={styles.avatarContainer}>
        <ChatAvatar conversation={conversation} title={title} size={50} badge />
      </View>

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
          {renderTicks()}
          <Text
            style={[
              styles.lastMessage,
              showUnreadHighlight && styles.lastMessageUnread,
            ]}
            numberOfLines={1}
          >
            {previewText()}
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

          {listNames.slice(0, 2).map((ln) => (
            <View key={ln} style={styles.listTag}>
              <Text style={styles.listTagText} numberOfLines={1}>
                {ln}
              </Text>
            </View>
          ))}
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
  listTag: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    maxWidth: 72,
  },
  listTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#7C3AED',
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
