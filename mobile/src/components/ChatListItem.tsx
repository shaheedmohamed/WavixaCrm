import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { ChatAvatar } from './ChatAvatar';
import { Conversation } from '../types/crm';

interface ChatListItemProps {
  conversation: Conversation;
  onPress: () => void;
  onLongPress?: () => void;
  currentUserId?: number;
}

const ChatListItemComponent: React.FC<ChatListItemProps> = ({
  conversation,
  onPress,
  onLongPress,
  currentUserId,
}) => {
  const title =
    conversation.contact_name ||
    (conversation.contact_username ? `@${conversation.contact_username}` : null) ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل واتساب');

  // Format timestamp (e.g., 9:38 م, or Date)
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
      } else {
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 1) return 'أمس';
        if (diffDays < 7) {
          const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
          return days[date.getDay()];
        }
        return `${date.getDate()}/${date.getMonth() + 1}`;
      }
    } catch {
      return '';
    }
  };

  const timeDisplay = formatTime(conversation.last_message_at);

  // Status ticks for outgoing messages
  const renderTicks = () => {
    if (conversation.last_message_direction !== 'outgoing') return null;

    const status = conversation.last_message_status;
    if (status === 'read') {
      return (
        <Ionicons
          name="checkmark-done"
          size={14}
          color="#53BDEB"
          style={styles.ticks}
        />
      );
    } else if (status === 'delivered') {
      return (
        <Ionicons
          name="checkmark-done"
          size={14}
          color="#8696A0"
          style={styles.ticks}
        />
      );
    } else {
      return (
        <Ionicons
          name="checkmark"
          size={14}
          color="#8696A0"
          style={styles.ticks}
        />
      );
    }
  };

  // Preview message text
  const previewText = () => {
    if (conversation.last_message_type === 'image') return '📷 صورة';
    if (conversation.last_message_type === 'video') return '🎥 فيديو';
    if (['audio', 'voice'].includes(conversation.last_message_type || '')) return '� تسجيل صوتي';
    if (conversation.last_message_type === 'document') return '📄 ملف';
    if (conversation.last_message_type === 'sticker') return 'ملصق';
    if (conversation.last_message_type === 'location') return '📍 موقع';
    if (conversation.last_message_type === 'contact') return '👤 جهة اتصال';
    if (conversation.last_message_type === 'call') return '📞 مكالمة';
    return conversation.last_message || 'بدء المحادثة';
  };

  const isAssignedToMe = conversation.assigned_agent_id === currentUserId;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      {/* Right side: Avatar with platform/online indicator */}
      <View style={styles.avatarContainer}>
        <ChatAvatar conversation={conversation} title={title} size={48} badge />
      </View>

      {/* Middle: Name & Last Message */}
      <View style={styles.centerInfo}>
        <View style={styles.topRow}>
          <Text style={styles.contactName} numberOfLines={1}>
            {title}
          </Text>
          <FontAwesome name="whatsapp" size={12} color="#25D366" style={styles.platformIcon} />
        </View>

        <View style={styles.bottomRow}>
          {renderTicks()}
          <Text
            style={[
              styles.lastMessage,
              conversation.unread_count > 0 && styles.lastMessageUnread,
            ]}
            numberOfLines={1}
          >
            {previewText()}
          </Text>
        </View>

        {/* Optional Tag: Device or assigned agent */}
        {(conversation.session?.device_name || conversation.assigned_agent) && (
          <View style={styles.tagRow}>
            {conversation.session?.device_name && (
              <View style={styles.deviceTag}>
                <Text style={styles.deviceTagText} numberOfLines={1}>
                  {conversation.session.device_name}
                </Text>
              </View>
            )}
            {conversation.assigned_agent && (
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
            )}
          </View>
        )}
      </View>

      {/* Left side: Time & Badges */}
      <View style={styles.leftMeta}>
        <Text
          style={[
            styles.timeText,
            conversation.unread_count > 0 && styles.timeTextUnread,
          ]}
        >
          {timeDisplay}
        </Text>

        <View style={styles.badgeRow}>
          {conversation.is_pinned && (
            <MaterialCommunityIcons
              name="pin"
              size={14}
              color="#8696A0"
              style={styles.pinIcon}
            />
          )}

          {conversation.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>
                {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F5',
  },
  avatarContainer: {
    position: 'relative',
    marginLeft: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E9EDEF',
  },
  centerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  contactName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111B21',
    flexShrink: 1,
    textAlign: 'right',
  },
  platformIcon: {
    marginLeft: 2,
  },
  bottomRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
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
    gap: 5,
    marginTop: 4,
  },
  deviceTag: {
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  deviceTagText: {
    fontSize: 9.5,
    color: '#667781',
    fontWeight: '600',
  },
  agentTag: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
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
  leftMeta: {
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    minWidth: 55,
    height: 42,
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
    borderRadius: 11,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadCount: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
});

export const ChatListItem = React.memo(ChatListItemComponent);
