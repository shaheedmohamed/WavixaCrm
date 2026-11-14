import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { MessageText } from './MessageText';
import { AudioMessageBubble } from './AudioMessageBubble';
import { VideoMessageBubble } from './VideoMessageBubble';
import { useAuth } from '../context/AuthContext';
import { avatarSrc, docInfo, isAudioMessage, isDocMessage, isPlaceholderText, mediaSrc } from '../services/media';
import { Conversation, Message } from '../types/crm';
import { Colors } from '../constants/theme';

interface MessageBubbleProps {
  message: Message;
  isGroup?: boolean;
  conversation?: Pick<Conversation, 'id' | 'contact_jid' | 'contact_avatar'> | null;
  contactTitle?: string;
  quoted?: Message | null;
  onActions?: (msg: Message) => void;
  onViewMedia?: (msg: Message, kind: 'image' | 'video') => void;
}

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isGroup = false,
  conversation,
  contactTitle,
  quoted,
  onActions,
  onViewMedia,
}) => {
  const { token, user } = useAuth();
  const isOutgoing = message.direction === 'outgoing';
  const showGroupSender = isGroup && !isOutgoing;

  const SENDER_COLORS = ['#00A884', '#1F70C1', '#D63384', '#D97706', '#7C3AED', '#0D9488', '#EA580C'];
  const senderColor = SENDER_COLORS[
    Math.abs(
      (message.sender_name || message.from || '')
        .split('')
        .reduce((acc, c) => acc + c.charCodeAt(0), 0)
    ) % SENDER_COLORS.length
  ];

  const groupDigits = conversation?.contact_jid?.replace(/\D/g, '') || '';
  const senderDisplayName =
    message.sender_name ||
    (message.sender_phone ? `+${message.sender_phone}` : null) ||
    (message.from && !message.from.includes(groupDigits) && message.from.length <= 15
      ? `+${message.from}`
      : null);
  const senderInitials = (senderDisplayName || 'ع').slice(0, 1).toUpperCase();

  const mediaUri = mediaSrc(message, token);
  const contactAvatarUri = avatarSrc(conversation, token);

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
    if (status === 'failed') {
      return <Ionicons name="alert-circle" size={13} color="#EF4444" style={styles.tick} />;
    }
    if (status === 'pending') {
      return <Ionicons name="time-outline" size={13} color="#8696A0" style={styles.tick} />;
    }
    if (status === 'read') {
      return <Ionicons name="checkmark-done" size={13} color="#53BDEB" style={styles.tick} />;
    } else if (status === 'delivered') {
      return <Ionicons name="checkmark-done" size={13} color="#8696A0" style={styles.tick} />;
    }
    return <Ionicons name="checkmark" size={13} color="#8696A0" style={styles.tick} />;
  };

  const type = message.message_type;
  const isImage = type === 'image' || type === 'sticker';
  const isVideo = type === 'video';
  const isAudio = isAudioMessage(message);
  const isDoc = isDocMessage(message);
  const isSpecialPill = ['location', 'contact', 'call'].includes(type);
  const showText = !!message.message && !isSpecialPill && !isPlaceholderText(message);

  const openDoc = () => {
    if (mediaUri) Linking.openURL(mediaUri).catch(() => {});
  };

  const pillIcon = type === 'location' ? '📍' : type === 'contact' ? '👤' : type === 'call' ? (isOutgoing ? '📞' : '📲') : '💬';
  const pillLabel = type === 'location' ? (message.message || 'موقع')
    : type === 'contact' ? (message.message || 'جهة اتصال')
    : type === 'call' ? (message.message || 'مكالمة صوتية')
    : '';

  const doc = isDoc ? docInfo(message) : null;

  const quotedLabel = (m: Message): string => {
    const raw = (m.message || '').trim();
    if (raw && !/^\[.+\]$/.test(raw)) return m.message!;
    const labels: Record<string, string> = {
      image: '📷 صورة',
      video: '🎥 فيديو',
      audio: '🎤 تسجيل صوتي',
      voice: '🎤 تسجيل صوتي',
      document: '📄 ملف',
      sticker: 'ملصق',
      location: '📍 موقع',
      contact: '👤 جهة اتصال',
      call: '📞 مكالمة',
    };
    return labels[m.message_type] || m.message || 'رسالة';
  };

  const audioAvatarUri = isOutgoing ? null : contactAvatarUri;
  const audioAvatarFallback = isOutgoing
    ? (user?.name || 'U')
    : (contactTitle || message.sender_name || 'ع');

  return (
    <View
      style={[
        styles.container,
        isOutgoing ? styles.containerOutgoing : styles.containerIncoming,
      ]}
    >
      <View style={[styles.bubbleRow, isOutgoing ? styles.bubbleRowOutgoing : styles.bubbleRowIncoming]}>
        {showGroupSender && (
          <View style={styles.groupAvatarWrap}>
            <View style={[styles.groupAvatar, { backgroundColor: senderColor }]}>
              <Text style={styles.groupAvatarText}>{senderInitials}</Text>
            </View>
          </View>
        )}
        <TouchableOpacity
          style={[
            styles.bubble,
            isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
          ]}
          onLongPress={() => onActions && onActions(message)}
          activeOpacity={0.85}
          delayLongPress={250}
        >
          {/* Sender name for group chats */}
          {showGroupSender && senderDisplayName ? (
            <Text style={[styles.senderName, { color: senderColor }]}>{senderDisplayName}</Text>
          ) : null}

        {/* Forwarded label */}
        {message.is_forwarded ? (
          <View style={styles.forwardedRow}>
            <Ionicons name="arrow-redo" size={11} color="#8696A0" />
            <Text style={styles.forwardedText}>مُعاد توجيهها</Text>
          </View>
        ) : null}

        {/* Quoted reply preview */}
        {message.reply_to_id ? (
          <View style={styles.quoteBox}>
            {quoted ? (
              <>
                <Text style={styles.quoteSender} numberOfLines={1}>
                  {quoted.direction === 'outgoing' ? 'أنت' : quoted.sender_name || 'العميل'}
                </Text>
                <Text style={styles.quoteText} numberOfLines={1}>
                  {quotedLabel(quoted)}
                </Text>
              </>
            ) : (
              <Text style={styles.quoteText}>رد على رسالة</Text>
            )}
          </View>
        ) : null}

        {/* Revoked / Deleted message badge */}
        {message.revoked_at ? (
          <View style={styles.revokedBox}>
            <MaterialCommunityIcons name="cancel" size={14} color="#EF4444" />
            <Text style={styles.revokedText}>
              {isOutgoing ? 'حذفتَ هذه الرسالة لدى الجميع' : 'العميل حذف هذه الرسالة — المحتوى محفوظ'}
            </Text>
          </View>
        ) : null}

        {/* Media: Image / Sticker */}
        {isImage && mediaUri ? (
          <TouchableOpacity
            style={type === 'sticker' ? styles.stickerWrap : styles.imageWrap}
            onPress={() => onViewMedia && onViewMedia(message, 'image')}
            activeOpacity={0.9}
          >
            <Image
              source={{ uri: mediaUri }}
              style={styles.mediaImage}
              resizeMode={type === 'sticker' ? 'contain' : 'cover'}
            />
          </TouchableOpacity>
        ) : null}

        {/* Media: Video — first frame + play overlay, tap opens player */}
        {isVideo && mediaUri ? (
          <VideoMessageBubble uri={mediaUri} onPress={() => onViewMedia && onViewMedia(message, 'video')} />
        ) : null}

        {/* Media: Audio / Voice note */}
        {isAudio && mediaUri ? (
          <AudioMessageBubble
            message={message}
            uri={mediaUri}
            isOutgoing={isOutgoing}
            avatarUri={audioAvatarUri}
            avatarFallback={audioAvatarFallback}
          />
        ) : null}

        {/* Media: Document card */}
        {isDoc && doc ? (
          <TouchableOpacity
            style={styles.docCard}
            onPress={openDoc}
            disabled={!mediaUri}
            activeOpacity={0.8}
          >
            <View style={[styles.docIcon, { backgroundColor: doc.color }]}>
              <FontAwesome5 name="file-alt" size={20} color="#FFFFFF" />
              <Text style={styles.docExt} numberOfLines={1}>{doc.ext}</Text>
            </View>
            <View style={styles.docInfo}>
              <Text style={styles.docName} numberOfLines={1}>{doc.fileName}</Text>
              <Text style={styles.docSub}>{doc.sub}</Text>
            </View>
            {mediaUri ? (
              <Ionicons name="download-outline" size={18} color="#667781" />
            ) : null}
          </TouchableOpacity>
        ) : null}

        {/* Location / Contact / Call pills */}
        {isSpecialPill ? (
          <View style={styles.pillRow}>
            <Text style={styles.pillIcon}>{pillIcon}</Text>
            <Text style={styles.pillText} numberOfLines={2}>{pillLabel}</Text>
          </View>
        ) : null}

        {/* Message text (caption or plain text; hides [placeholder] labels) */}
        {showText ? (
          <MessageText text={message.message!} isOutgoing={isOutgoing} />
        ) : null}

        {/* Meta row: Time, Star, and Status Ticks */}
        <View style={styles.metaRow}>
          {renderTicks()}
          <Text style={styles.timeText}>{formatTime(message.timestamp)}</Text>
          {message.starred_at ? (
            <Ionicons name="star" size={11} color="#F59E0B" style={{ marginLeft: 3 }} />
          ) : null}
        </View>
        </TouchableOpacity>
      </View>

      {/* Reactions pills under the bubble */}
      {message.reactions && message.reactions.length > 0 ? (
        <View
          style={[
            styles.reactionsRow,
            isOutgoing ? styles.reactionsOutgoing : styles.reactionsIncoming,
          ]}
        >
          {message.reactions.map((r, i) => (
            <Text key={i} style={styles.reactionEmoji}>{r.emoji}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    marginVertical: 2.5,
  },
  containerOutgoing: {
    alignItems: 'flex-end',
  },
  containerIncoming: {
    alignItems: 'flex-start',
  },
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    maxWidth: '86%',
    gap: 6,
  },
  bubbleRowOutgoing: {
    justifyContent: 'flex-end',
  },
  bubbleRowIncoming: {
    justifyContent: 'flex-start',
  },
  groupAvatarWrap: {
    paddingBottom: 2,
  },
  groupAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  bubble: {
    maxWidth: '100%',
    minWidth: 90,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1,
  },
  bubbleOutgoing: {
    backgroundColor: '#D9FDD3',
    borderTopRightRadius: 2,
  },
  bubbleIncoming: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 2,
  },
  senderName: {
    fontSize: 11.5,
    fontWeight: '700',
    textAlign: 'right',
    marginBottom: 2,
  },
  forwardedRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  forwardedText: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#8696A0',
  },
  quoteBox: {
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRightWidth: 3,
    borderRightColor: '#00A884',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  quoteSender: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#00A884',
    textAlign: 'right',
  },
  quoteText: {
    fontSize: 11.5,
    color: '#54656F',
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
    backgroundColor: '#E9EDEF',
  },
  stickerWrap: {
    width: 140,
    height: 140,
    marginBottom: 4,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
    padding: 8,
    gap: 10,
    minWidth: 210,
    maxWidth: 280,
    marginBottom: 4,
  },
  docIcon: {
    width: 42,
    height: 46,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docExt: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 1,
  },
  docInfo: {
    flex: 1,
  },
  docName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111B21',
  },
  docSub: {
    fontSize: 10,
    color: '#667781',
    marginTop: 2,
  },
  pillRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    gap: 6,
    marginBottom: 4,
  },
  pillIcon: {
    fontSize: 14,
  },
  pillText: {
    fontSize: 12,
    color: '#111B21',
    flexShrink: 1,
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
  reactionsRow: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: -8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  reactionsOutgoing: {
    marginRight: 6,
  },
  reactionsIncoming: {
    marginLeft: 32,
  },
  reactionEmoji: {
    fontSize: 12,
  },
});

export const MessageBubble = React.memo(MessageBubbleComponent);
