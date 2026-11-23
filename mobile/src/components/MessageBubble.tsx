import React, { useRef, useState } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { MessageText } from './MessageText';
import { AudioMessageBubble } from './AudioMessageBubble';
import { VideoMessageBubble } from './VideoMessageBubble';
import { useAuth } from '../context/AuthContext';
import {
  avatarSrc,
  docInfo,
  formatBytes,
  isAudioMessage,
  isDocMessage,
  isPlaceholderText,
  mediaSrc,
  senderAvatarSrc,
  videoThumbSrc,
} from '../services/media';
import { Conversation, Message } from '../types/crm';
import { Colors } from '../constants/theme';

interface MessageBubbleProps {
  message: Message;
  isGroup?: boolean;
  // First message of a consecutive same-sender run in a group — controls the
  // avatar + name header (WhatsApp only shows it there, others just indent).
  isFirstInRun?: boolean;
  conversation?: Pick<Conversation, 'id' | 'contact_jid' | 'contact_avatar' | 'session_id'> | null;
  contactTitle?: string;
  quoted?: Message | null;
  onActions?: (msg: Message) => void;
  onViewMedia?: (msg: Message, kind: 'image' | 'video') => void;
  onPressQuoted?: (replyToId: string) => void;
  onRetry?: (msg: Message) => void;
  // Tap on a call-log bubble redials the contact — WhatsApp's "call back".
  onCallBack?: () => void;
  onDismissFailed?: (msg: Message) => void;
  onDoubleTapLike?: (msg: Message) => void;
  onPressReactions?: (msg: Message) => void;
  // Group sender header tap — opens the member card (message / call / …).
  onPressSender?: (sender: {
    phone: string | null;
    name: string | null;
    avatarUri?: string | null;
    color?: string;
  }) => void;
  // WhatsApp-style multi-select: while a selection is active every tap
  // toggles the message instead of opening media/like actions.
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (msg: Message) => void;
}

const SENDER_COLORS = [
  '#00A884',
  '#1F70C1',
  '#D63384',
  '#D97706',
  '#7C3AED',
  '#0D9488',
  '#EA580C',
];

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

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isGroup = false,
  isFirstInRun = false,
  conversation,
  contactTitle,
  quoted,
  onActions,
  onViewMedia,
  onPressQuoted,
  onRetry,
  onDismissFailed,
  onCallBack,
  onDoubleTapLike,
  onPressReactions,
  onPressSender,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const { token, user, isAgent } = useAuth();
  const lastTapRef = useRef(0);
  const [likePulse] = useState(() => new Animated.Value(1));

  // Instant tactile feedback so the like feels immediate.
  const pulseLike = () => {
    likePulse.stopAnimation();
    likePulse.setValue(1);
    Animated.sequence([
      Animated.spring(likePulse, {
        toValue: 1.07,
        useNativeDriver: true,
        speed: 40,
        bounciness: 10,
      }),
      Animated.spring(likePulse, {
        toValue: 1,
        useNativeDriver: true,
        speed: 40,
        bounciness: 10,
      }),
    ]).start();
  };

  // WhatsApp-style double tap → like. A single tap stays a no-op.
  const handleBubblePress = () => {
    if (selectionMode) {
      onToggleSelect?.(message);
      return;
    }
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (onDoubleTapLike) {
        pulseLike();
        onDoubleTapLike(message);
      }
    } else {
      lastTapRef.current = now;
    }
  };
  const isOutgoing = message.direction === 'outgoing';
  // Sender attribution — owners/admins see which employee replied, or that
  // the message went out from the WhatsApp app itself. Agents don't get the
  // extra chrome (they only work their own queue anyway).
  const sentByLabel =
    isOutgoing && !isAgent && message.status !== 'failed'
      ? message.sent_by?.name || 'من الواتساب'
      : null;
  // WhatsApp shows the sender's avatar + name only on the first message of
  // a consecutive run; later ones just get the avatar-width indent.
  const isGroupIncoming = isGroup && !isOutgoing;
  const showGroupSender = isGroupIncoming && isFirstInRun;

  const senderColor =
    SENDER_COLORS[
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
  // Plain-phone labels break inside RTL text (+20 10… renders as …10 20+)
  // — bidi isolates keep the digits LTR no matter what surrounds them.
  const senderLabel =
    senderDisplayName && /^[\d+\s()-]+$/.test(senderDisplayName)
      ? `\u2066${senderDisplayName}\u2069`
      : senderDisplayName;
  // Number used to open the member's 1:1 chat when the name is tapped.
  const senderPhone = (() => {
    const p = (message.sender_phone || '').replace(/\D/g, '');
    if (p.length >= 6) return p;
    const f = (message.from || '').replace(/\D/g, '');
    return f.length >= 6 && f.length <= 15 && f !== groupDigits ? f : null;
  })();
  const senderInitials = (senderDisplayName || 'ع').slice(0, 1).toUpperCase();
  const [senderAvatarFailed, setSenderAvatarFailed] = useState(false);
  const senderAvatarUri = isGroupIncoming
    ? senderAvatarSrc(message, conversation?.session_id, token, groupDigits)
    : null;
  const videoPosterUri = videoThumbSrc(message, token);

  const mediaUri = mediaSrc(message, token);
  const contactAvatarUri = avatarSrc(conversation, token);

  const isUploading =
    message.status === 'pending' && typeof message.upload_progress === 'number';
  const progressPct = Math.max(0, Math.min(100, Math.round(message.upload_progress ?? 0)));
  const isFailed = message.status === 'failed';

  const renderTicks = () => {
    if (!isOutgoing) return null;
    const status = message.status;
    if (status === 'failed') {
      return <Ionicons name="alert-circle" size={14} color="#EF4444" style={styles.tick} />;
    }
    if (status === 'pending') {
      return <Ionicons name="time-outline" size={13} color="#8696A0" style={styles.tick} />;
    }
    if (status === 'read') {
      return <Ionicons name="checkmark-done" size={14} color="#53BDEB" style={styles.tick} />;
    }
    if (status === 'delivered') {
      return <Ionicons name="checkmark-done" size={14} color="#8696A0" style={styles.tick} />;
    }
    return <Ionicons name="checkmark" size={14} color="#8696A0" style={styles.tick} />;
  };

  const type = message.message_type;
  const isImage = type === 'image' || type === 'sticker';
  const isVideo = type === 'video';
  const isAudio = isAudioMessage(message);
  const isDoc = isDocMessage(message);
  const isSpecialPill = ['location', 'contact', 'call'].includes(type);
  const displayCaption = message.media_caption || message.message;
  const showText = Boolean(displayCaption) && !isSpecialPill && !isPlaceholderText(message);

  const openDoc = () => {
    if (!isUploading && mediaUri) Linking.openURL(mediaUri).catch(() => {});
  };

  // Missed/declined calls get WhatsApp's red handset; connected ones stay green.
  const isMissedCall = type === 'call' && /فائتة|لم يتم الرد/.test(message.message || '');
  const pillIcon =
    type === 'location'
      ? '📍'
      : type === 'contact'
        ? '👤'
        : type === 'call'
          ? isMissedCall
            ? '📵'
            : isOutgoing
              ? '📞'
              : '📲'
          : '💬';
  const pillLabel =
    type === 'location'
      ? message.message || 'موقع'
      : type === 'contact'
        ? message.message || 'جهة اتصال'
        : type === 'call'
          ? message.message || 'مكالمة صوتية'
          : '';

  const doc = isDoc ? docInfo(message) : null;

  const audioAvatarUri = isOutgoing ? null : contactAvatarUri;
  const audioAvatarFallback = isOutgoing
    ? user?.name || 'U'
    : contactTitle || message.sender_name || 'ع';

  const renderMediaUploadOverlay = () => {
    if (!isUploading && !isFailed) return null;
    return (
      <View style={styles.uploadOverlay}>
        {isUploading ? (
          <View style={styles.uploadCard}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.uploadPctText}>
              {progressPct >= 99 ? 'جاري المعالجة والإرسال...' : `جاري الرفع ${progressPct}%`}
            </Text>
            <View style={styles.uploadTrack}>
              <View style={[styles.uploadFill, { width: `${Math.max(6, progressPct)}%` }]} />
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.failedOverlayBtn}
            onPress={() => onRetry?.(message)}
            activeOpacity={0.85}
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
            <Text style={styles.failedOverlayText}>إعادة الرفع</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        isOutgoing ? styles.containerOutgoing : styles.containerIncoming,
      ]}
    >
      <View
        style={[
          styles.bubbleRow,
          isOutgoing ? styles.bubbleRowOutgoing : styles.bubbleRowIncoming,
        ]}
      >
        {isGroupIncoming && (
          <View style={styles.groupAvatarWrap}>
            {showGroupSender ? (
              <TouchableOpacity
                style={[styles.groupAvatar, { backgroundColor: senderColor }]}
                onPress={() =>
                  onPressSender?.({
                    phone: senderPhone,
                    name: message.sender_name || null,
                    avatarUri: senderAvatarUri,
                    color: senderColor,
                  })
                }
                disabled={!onPressSender}
                activeOpacity={0.8}
              >
                <Text style={styles.groupAvatarText}>{senderInitials}</Text>
                {senderAvatarUri && !senderAvatarFailed ? (
                  <Image
                    source={{ uri: senderAvatarUri }}
                    style={StyleSheet.absoluteFill}
                    onError={() => setSenderAvatarFailed(true)}
                  />
                ) : null}
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <Animated.View style={{ transform: [{ scale: likePulse }] }}>
        <TouchableOpacity
          style={[
            styles.bubble,
            isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
            isFailed && styles.bubbleFailed,
          ]}
          onLongPress={() => {
            if (message.client_temp_id) return;
            if (selectionMode) onToggleSelect?.(message);
            else onActions?.(message);
          }}
          onPress={handleBubblePress}
          activeOpacity={0.9}
          delayLongPress={240}
        >
          {isSelected ? (
            <View style={styles.selectedOverlay}>
              <Ionicons
                name="checkmark-circle"
                size={22}
                color={Colors.primary}
                style={styles.selectedCheck}
              />
            </View>
          ) : null}
          {showGroupSender && senderDisplayName ? (
            <TouchableOpacity
              onPress={() =>
                onPressSender?.({
                  phone: senderPhone,
                  name: message.sender_name || null,
                  avatarUri: senderAvatarUri,
                  color: senderColor,
                })
              }
              disabled={!onPressSender}
              activeOpacity={0.7}
            >
              <Text style={[styles.senderName, { color: senderColor }]}>{senderLabel}</Text>
            </TouchableOpacity>
          ) : null}

          {message.is_forwarded ? (
            <View style={styles.forwardedRow}>
              <Ionicons name="arrow-redo" size={11} color="#8696A0" />
              <Text style={styles.forwardedText}>مُعاد توجيهها</Text>
            </View>
          ) : null}

          {message.reply_to_id ? (
            <TouchableOpacity
              style={styles.quoteBox}
              onPress={() =>
                message.reply_to_id && onPressQuoted?.(String(message.reply_to_id))
              }
              activeOpacity={0.75}
            >
              {quoted ? (
                <>
                  <Text style={styles.quoteSender} numberOfLines={1}>
                    {quoted.direction === 'outgoing'
                      ? 'أنت'
                      : quoted.sender_name || contactTitle || 'العميل'}
                  </Text>
                  <Text style={styles.quoteText} numberOfLines={1}>
                    {quotedLabel(quoted)}
                  </Text>
                </>
              ) : (
                <Text style={styles.quoteText}>رد على رسالة</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {message.revoked_at ? (
            <View style={styles.revokedBox}>
              <MaterialCommunityIcons name="cancel" size={14} color="#EF4444" />
              <Text style={styles.revokedText}>
                {isOutgoing
                  ? 'حذفتَ هذه الرسالة لدى الجميع'
                  : 'العميل حذف هذه الرسالة — المحتوى محفوظ'}
              </Text>
            </View>
          ) : null}

          {isImage && mediaUri ? (
            <TouchableOpacity
              style={type === 'sticker' ? styles.stickerWrap : styles.imageWrap}
              onPress={() =>
                selectionMode
                  ? onToggleSelect?.(message)
                  : !isUploading && onViewMedia?.(message, 'image')
              }
              onLongPress={() =>
                !message.client_temp_id &&
                (selectionMode ? onToggleSelect?.(message) : onActions?.(message))
              }
              delayLongPress={240}
              activeOpacity={0.9}
            >
              <Image
                source={{
                  uri: mediaUri,
                }}
                style={[
                  styles.mediaImage,
                  message.local_uri && message.edit_spec?.rotation
                    ? { transform: [{ rotate: `${message.edit_spec.rotation}deg` }] }
                    : null,
                ]}
                resizeMode={type === 'sticker' ? 'contain' : 'cover'}
              />
              {renderMediaUploadOverlay()}
            </TouchableOpacity>
          ) : null}

          {isVideo && mediaUri ? (
            <View style={styles.videoWrapOuter}>
              <VideoMessageBubble
                uri={mediaUri}
                durationSeconds={message.media_meta?.seconds}
                fileName={message.media_meta?.fileName}
                posterUri={videoPosterUri}
                disabled={isUploading}
                onPress={() =>
                  selectionMode
                    ? onToggleSelect?.(message)
                    : !isUploading && onViewMedia?.(message, 'video')
                }
                onLongPress={() =>
                  !message.client_temp_id &&
                  (selectionMode ? onToggleSelect?.(message) : onActions?.(message))
                }
              />
              {renderMediaUploadOverlay()}
            </View>
          ) : null}

          {isAudio && mediaUri ? (
            <View>
              <AudioMessageBubble
                message={message}
                uri={mediaUri}
                isOutgoing={isOutgoing}
                avatarUri={audioAvatarUri}
                avatarFallback={audioAvatarFallback}
                footer={
                  <>
                    <Text style={styles.timeText}>
                      {message.status === 'pending' && !isUploading
                        ? 'جاري الإرسال...'
                        : formatTime(message.timestamp)}
                    </Text>
                    {renderTicks()}
                    {message.starred_at ? (
                      <Ionicons name="star" size={11} color="#F59E0B" style={{ marginLeft: 3 }} />
                    ) : null}
                    {sentByLabel ? (
                      <Text style={styles.sentByText} numberOfLines={1}>
                        · {sentByLabel}
                      </Text>
                    ) : null}
                  </>
                }
              />
              {isUploading && (
                <View style={styles.inlineUploadBarWrap}>
                  <View style={styles.inlineUploadTrack}>
                    <View
                      style={[styles.inlineUploadFill, { width: `${Math.max(6, progressPct)}%` }]}
                    />
                  </View>
                  <Text style={styles.inlineUploadLabel}>
                    {progressPct >= 99 ? 'جاري الإرسال...' : `${progressPct}%`}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {isDoc && doc ? (
            <View>
              <TouchableOpacity
                style={styles.docCard}
                onPress={() =>
                  selectionMode ? onToggleSelect?.(message) : openDoc()
                }
                onLongPress={() =>
                  !message.client_temp_id &&
                  (selectionMode ? onToggleSelect?.(message) : onActions?.(message))
                }
                delayLongPress={240}
                disabled={!mediaUri || isUploading}
                activeOpacity={0.8}
              >
                <View style={[styles.docIcon, { backgroundColor: doc.color }]}>
                  <FontAwesome5 name="file-alt" size={20} color="#FFFFFF" />
                  <Text style={styles.docExt} numberOfLines={1}>
                    {doc.ext}
                  </Text>
                </View>
                <View style={styles.docInfo}>
                  <Text style={styles.docName} numberOfLines={1}>
                    {doc.fileName}
                  </Text>
                  <Text style={styles.docSub}>
                    {isUploading
                      ? `جاري الرفع ${progressPct}%${message.media_size ? ` • ${formatBytes(message.media_size)}` : ''}`
                      : doc.sub}
                  </Text>
                </View>
                {isUploading ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : mediaUri ? (
                  <Ionicons name="download-outline" size={18} color="#667781" />
                ) : null}
              </TouchableOpacity>
              {isUploading && (
                <View style={styles.inlineUploadTrack}>
                  <View
                    style={[styles.inlineUploadFill, { width: `${Math.max(6, progressPct)}%` }]}
                  />
                </View>
              )}
            </View>
          ) : null}

          {isSpecialPill ? (
            type === 'call' && onCallBack ? (
              <TouchableOpacity
                style={styles.pillRow}
                onPress={onCallBack}
                activeOpacity={0.7}
                disabled={selectionMode}
              >
                <Text style={styles.pillIcon}>{pillIcon}</Text>
                <Text style={styles.pillText} numberOfLines={2}>
                  {pillLabel}
                </Text>
                <Ionicons
                  name="call"
                  size={15}
                  color={isMissedCall ? '#EA0038' : Colors.primary}
                  style={styles.pillCallIcon}
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.pillRow}>
                <Text style={styles.pillIcon}>{pillIcon}</Text>
                <Text style={styles.pillText} numberOfLines={2}>
                  {pillLabel}
                </Text>
              </View>
            )
          ) : null}

          {showText ? <MessageText text={displayCaption!} isOutgoing={isOutgoing} /> : null}

          {isAudio && mediaUri ? null : (
            <View style={styles.metaRow}>
              {renderTicks()}
              <Text style={styles.timeText}>
                {message.status === 'pending' && !isUploading
                  ? 'جاري الإرسال...'
                  : formatTime(message.timestamp)}
              </Text>
              {message.starred_at ? (
                <Ionicons name="star" size={11} color="#F59E0B" style={{ marginLeft: 3 }} />
              ) : null}
              {sentByLabel ? (
                <Text style={styles.sentByText} numberOfLines={1}>
                  · {sentByLabel}
                </Text>
              ) : null}
            </View>
          )}
        </TouchableOpacity>
        </Animated.View>
      </View>

      {isFailed && (
        <View style={styles.failedActionRow}>
          <TouchableOpacity
            style={styles.retryChip}
            onPress={() => onRetry?.(message)}
            activeOpacity={0.75}
          >
            <Ionicons name="refresh" size={13} color="#FFFFFF" />
            <Text style={styles.retryChipText}>فشل الإرسال • إعادة المحاولة</Text>
          </TouchableOpacity>

          {onDismissFailed && (
            <TouchableOpacity
              style={styles.dismissFailedBtn}
              onPress={() => onDismissFailed(message)}
              hitSlop={6}
            >
              <Ionicons name="close" size={14} color="#EF4444" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {message.reactions && message.reactions.length > 0 ? (
        <TouchableOpacity
          style={[
            styles.reactionsRow,
            isOutgoing ? styles.reactionsOutgoing : styles.reactionsIncoming,
          ]}
          activeOpacity={0.75}
          onPress={() => onPressReactions?.(message)}
        >
          {message.reactions.map((r, i) => (
            <Text key={i} style={styles.reactionEmoji}>
              {r.emoji}
            </Text>
          ))}
          {message.reactions.length > 1 ? (
            <Text style={styles.reactionCount}>{message.reactions.length}</Text>
          ) : null}
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
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
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,168,132,0.14)',
    borderRadius: 10,
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  selectedCheck: {
    margin: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
  },
  groupAvatarWrap: {
    paddingBottom: 2,
    width: 26,
  },
  groupAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  groupAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  bubble: {
    maxWidth: '100%',
    minWidth: 92,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1.5,
    elevation: 1,
  },
  bubbleOutgoing: {
    backgroundColor: '#D9FDD3',
    borderTopRightRadius: 3,
  },
  bubbleIncoming: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 3,
  },
  bubbleFailed: {
    borderWidth: 1,
    borderColor: '#FCA5A5',
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
    backgroundColor: 'rgba(0,0,0,0.045)',
    borderRightWidth: 3.5,
    borderRightColor: '#00A884',
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    marginBottom: 4,
  },
  quoteSender: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00A884',
    textAlign: 'right',
  },
  quoteText: {
    fontSize: 11.5,
    color: '#54656F',
    textAlign: 'right',
    marginTop: 1,
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
  sentByText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8696A0',
    maxWidth: 110,
  },
  tick: {
    marginRight: 1,
  },
  imageWrap: {
    width: 226,
    height: 186,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 4,
    backgroundColor: '#E9EDEF',
    position: 'relative',
  },
  videoWrapOuter: {
    position: 'relative',
  },
  stickerWrap: {
    width: 140,
    height: 140,
    marginBottom: 4,
    position: 'relative',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 20, 26, 0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  uploadCard: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17, 27, 33, 0.78)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  uploadPctText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  uploadTrack: {
    width: '100%',
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  uploadFill: {
    height: '100%',
    backgroundColor: '#25D366',
    borderRadius: 3,
  },
  failedOverlayBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  failedOverlayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineUploadBarWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 2,
  },
  inlineUploadTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.1)',
    overflow: 'hidden',
    marginBottom: 4,
  },
  inlineUploadFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  inlineUploadLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  failedActionRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  retryChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EF4444',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  retryChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  dismissFailedBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.045)',
    borderRadius: 10,
    padding: 8,
    gap: 10,
    minWidth: 215,
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
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 1,
  },
  docInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  docName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  docSub: {
    fontSize: 10,
    color: '#667781',
    marginTop: 2,
    textAlign: 'right',
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
    textAlign: 'right',
  },
  pillCallIcon: {
    marginStart: 4,
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
  reactionCount: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#00A884',
    alignSelf: 'center',
    marginHorizontal: 2,
  },
});

export const MessageBubble = React.memo(MessageBubbleComponent);
