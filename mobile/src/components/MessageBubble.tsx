import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { MessageText } from './MessageText';
import { Message } from '../types/crm';
import { Colors } from '../constants/theme';

interface MessageBubbleProps {
  message: Message;
  isGroup?: boolean;
  onReply?: (msg: Message) => void;
  onPin?: (msg: Message) => void;
  onStar?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isGroup = false,
  onReply,
  onPin,
  onStar,
  onDelete,
}) => {
  const isOutgoing = message.direction === 'outgoing';

  // Format time (e.g. 10:45 ص)
  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'م' : 'ص';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    } catch {
      return '';
    }
  };

  const renderTicks = () => {
    if (!isOutgoing) return null;
    const status = message.status;
    if (status === 'read') {
      return <Ionicons name="checkmark-done" size={13} color="#53BDEB" style={styles.tick} />;
    } else if (status === 'delivered') {
      return <Ionicons name="checkmark-done" size={13} color="#8696A0" style={styles.tick} />;
    }
    return <Ionicons name="checkmark" size={13} color="#8696A0" style={styles.tick} />;
  };

  const handleLongPress = () => {
    const options = [
      { text: 'رد على الرسالة', onPress: () => onReply && onReply(message) },
      { text: 'تثبيت الرسالة', onPress: () => onPin && onPin(message) },
      {
        text: message.starred_at ? 'إلغاء التمييز بنجمة' : 'تمييز بنجمة',
        onPress: () => onStar && onStar(message),
      },
      {
        text: 'نسخ النص',
        onPress: async () => {
          if (message.message) {
            await Clipboard.setStringAsync(message.message);
          }
        },
      },
      {
        text: 'حذف الرسالة',
        style: 'destructive' as const,
        onPress: () => onDelete && onDelete(message),
      },
      { text: 'إلغاء', style: 'cancel' as const },
    ];

    Alert.alert('خيارات الرسالة', undefined, options);
  };

  const isImage = message.message_type === 'image';
  const isAudio = ['audio', 'voice'].includes(message.message_type);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isOutgoing ? styles.containerOutgoing : styles.containerIncoming,
      ]}
      onLongPress={handleLongPress}
      activeOpacity={0.85}
      delayLongPress={250}
    >
      <View
        style={[
          styles.bubble,
          isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
        ]}
      >
        {/* Sender name for group chats */}
        {isGroup && !isOutgoing && message.sender_name && (
          <Text style={styles.senderName}>{message.sender_name}</Text>
        )}

        {/* Revoked / Deleted message badge */}
        {message.revoked_at ? (
          <View style={styles.revokedBox}>
            <MaterialCommunityIcons name="cancel" size={14} color="#EF4444" />
            <Text style={styles.revokedText}>تم حذف هذه الرسالة من واتساب</Text>
          </View>
        ) : null}

        {/* Media content */}
        {isImage && message.media_url ? (
          <View style={styles.imageWrap}>
            <Image
              source={{ uri: message.media_url }}
              style={styles.mediaImage}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {isAudio ? (
          <View style={styles.audioRow}>
            <View style={styles.playIconWrap}>
              <Ionicons name="play" size={16} color="#FFFFFF" />
            </View>
            <Text style={styles.audioText}>رسالة صوتية</Text>
          </View>
        ) : null}

        {/* Message text with tappable links + WA formatting */}
        {message.message ? (
          <MessageText text={message.message} isOutgoing={isOutgoing} />
        ) : null}

        {/* Meta row: Time, Star, and Status Ticks */}
        <View style={styles.metaRow}>
          {renderTicks()}
          <Text style={styles.timeText}>{formatTime(message.timestamp)}</Text>
          {message.starred_at ? (
            <Ionicons name="star" size={11} color="#F59E0B" style={{ marginLeft: 3 }} />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    marginVertical: 2.5,
    flexDirection: 'row',
  },
  containerOutgoing: {
    justifyContent: 'flex-start', // In RTL layout
  },
  containerIncoming: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '78%',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOutgoing: {
    backgroundColor: '#E7FCE8',
    borderTopLeftRadius: 3,
  },
  bubbleIncoming: {
    backgroundColor: '#FFFFFF',
    borderTopRightRadius: 3,
  },
  senderName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#008069',
    textAlign: 'right',
    marginBottom: 2,
  },
  messageText: {
    fontSize: 13,
    color: '#111B21',
    lineHeight: 18.5,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 2,
    gap: 3,
  },
  timeText: {
    fontSize: 10,
    color: '#667781',
  },
  tick: {
    marginRight: 1,
  },
  imageWrap: {
    width: 220,
    height: 180,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  audioRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  playIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioText: {
    fontSize: 12,
    color: '#54656F',
    fontWeight: '600',
  },
  revokedBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 4,
  },
  revokedText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
  },
});
