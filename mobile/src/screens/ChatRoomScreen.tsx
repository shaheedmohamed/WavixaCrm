import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { MessageBubble } from '../components/MessageBubble';
import { QuickReplyModal } from '../components/QuickReplyModal';
import { TransferModal } from '../components/TransferModal';
import { ResolveModal } from '../components/ResolveModal';
import { PinDurationModal } from '../components/PinDurationModal';
import { chatService } from '../services/chatService';
import { playIncomingMessage } from '../services/notifySound';
import { useAuth } from '../context/AuthContext';
import { Conversation, Message, PinnedPreview } from '../types/crm';
import { Colors } from '../constants/theme';

interface ChatRoomScreenProps {
  conversation: Conversation;
  onBack: () => void;
}

export const ChatRoomScreen: React.FC<ChatRoomScreenProps> = ({
  conversation: initialConv,
  onBack,
}) => {
  const { user, isAgent } = useAuth();
  const insets = useSafeAreaInsets();

  const [conversation, setConversation] = useState<Conversation>(initialConv);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMsg, setPinnedMsg] = useState<PinnedPreview | null>(null);
  const [inputText, setInputText] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);

  // Modals
  const [quickRepliesVisible, setQuickRepliesVisible] = useState(false);
  const [transferVisible, setTransferVisible] = useState(false);
  const [resolveVisible, setResolveVisible] = useState(false);
  const [pinDurationVisible, setPinDurationVisible] = useState(false);
  const [selectedMsgForPin, setSelectedMsgForPin] = useState<Message | null>(null);

  const [isDeadConversation, setIsDeadConversation] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const msgLoadSeq = useRef(0);
  const knownIncomingIds = useRef<Set<string | number>>(new Set());
  const initialLoadDone = useRef(false);

  const isGroup = conversation.contact_jid?.includes('@g.us');

  // Load messages (supports silent background polling)
  const loadMessages = useCallback(async (isInitial = false) => {
    if (isDeadConversation || !conversation?.id) return;

    const seq = ++msgLoadSeq.current;
    if (isInitial && messages.length === 0) {
      setInitialLoading(true);
    }

    try {
      const res = await chatService.getMessages(conversation.id, { limit: 50 });
      if (seq === msgLoadSeq.current && res.success && res.messages) {
        // Ding on genuinely-new incoming messages (skip first load).
        if (initialLoadDone.current) {
          const freshIncoming = res.messages.filter(
            (m) =>
              m.direction === 'incoming' &&
              !knownIncomingIds.current.has(m.id ?? m.message_id)
          );
          if (freshIncoming.length) playIncomingMessage();
        }
        for (const m of res.messages) {
          if (m.direction === 'incoming') {
            knownIncomingIds.current.add(m.id ?? m.message_id);
          }
        }
        initialLoadDone.current = true;

        setMessages(res.messages);
        setPinnedMsg(res.pinned || null);
        if (res.conversation) {
          setConversation(res.conversation);
        }
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setIsDeadConversation(true);
        Alert.alert(
          'تنبيه',
          'هذه المحادثة غير متوفرة حالياً أو تم دمجها برقم آخر',
          [{ text: 'العودة للمحادثات', onPress: onBack }]
        );
        return;
      }
      // Only log unexpected non-404 errors
      if (isInitial) {
        console.warn('Could not load chat messages:', err?.message || err);
      }
    } finally {
      if (seq === msgLoadSeq.current) {
        setInitialLoading(false);
      }
    }
  }, [conversation?.id, isDeadConversation, messages.length, onBack]);

  useEffect(() => {
    loadMessages(true);
  }, [conversation?.id]);

  // Periodic SILENT background polling for incoming messages in this chat
  useEffect(() => {
    if (isDeadConversation) return;

    const timer = setInterval(() => {
      loadMessages(false);
    }, 5000);
    return () => clearInterval(timer);
  }, [loadMessages, isDeadConversation]);

  // Auto claim chat if open by an agent and unclaimed
  useEffect(() => {
    if (isAgent && !conversation.assigned_agent_id && !conversation.resolved_at && !isGroup) {
      chatService.claimConversation(conversation.id).catch(() => {});
    }
  }, [conversation.id, isAgent, isGroup]);

  // Send message
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');
    const targetReply = replyTarget;
    setReplyTarget(null);

    // Optimistic message
    const tempId = Date.now();
    const optimisticMsg: Message = {
      id: tempId,
      message_id: `temp_${tempId}`,
      conversation_id: conversation.id,
      direction: 'outgoing',
      sender_name: user?.name,
      message: text,
      message_type: 'text',
      timestamp: new Date().toISOString(),
      status: 'pending',
      reply_to_id: targetReply?.message_id,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);

    try {
      const res = await chatService.sendMessage(
        conversation.id,
        text,
        targetReply?.message_id,
        conversation.session_id
      );

      if (res && res.success === false) {
        Alert.alert('فشل الإرسال', res.message || 'تعذر إرسال الرسالة للعميل');
        loadMessages(false);
      } else {
        loadMessages(false);
      }
    } catch (err: any) {
      Alert.alert('فشل الإرسال', err.response?.data?.message || 'حدث خطأ أثناء الاتصال بالخادم');
      loadMessages(false);
    } finally {
      setSending(false);
    }
  };

  // Send photo
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        setSending(true);
        const res = await chatService.sendMedia(
          conversation.id,
          asset.uri,
          asset.mimeType || 'image/jpeg'
        );
        if (res && res.success === false) {
          Alert.alert('فشل الإرسال', res.message || 'تعذر إرسال الصورة');
        } else {
          loadMessages(false);
        }
        setSending(false);
      }
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'تعذر اختيار الصورة');
      setSending(false);
    }
  };

  // Pin / Unpin handlers
  const handlePinPrompt = (msg: Message) => {
    setSelectedMsgForPin(msg);
    setPinDurationVisible(true);
  };

  const handleSelectPinDuration = async (duration: number) => {
    if (!selectedMsgForPin) return;
    try {
      const res = await chatService.pinMessage(selectedMsgForPin.id, duration);
      if (res.success && res.pinned) {
        setPinnedMsg(res.pinned);
      } else {
        Alert.alert('خطأ', res.message || 'فشل تثبيت الرسالة');
      }
    } catch (err: any) {
      Alert.alert('خطأ', err.response?.data?.message || 'فشل تثبيت الرسالة');
    }
  };

  const handleUnpin = async () => {
    try {
      await chatService.unpinMessage(conversation.id);
      setPinnedMsg(null);
    } catch {}
  };

  const handleToggleStar = async (msg: Message) => {
    try {
      await chatService.toggleStar(msg.id);
      loadMessages(false);
    } catch {}
  };

  const handleDeleteMsg = async (msg: Message) => {
    Alert.alert(
      'حذف الرسالة',
      'هل تريد حذف هذه الرسالة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف عندي فقط',
          onPress: async () => {
            await chatService.deleteMessage(msg.message_id || msg.id, conversation.id, false);
            loadMessages(false);
          },
        },
        {
          text: 'حذف لدى الجميع في واتساب',
          style: 'destructive',
          onPress: async () => {
            await chatService.deleteMessage(msg.message_id || msg.id, conversation.id, true);
            loadMessages(false);
          },
        },
      ]
    );
  };

  const contactTitle =
    conversation.contact_name ||
    (conversation.contact_username ? `@${conversation.contact_username}` : null) ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل واتساب');

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* WhatsApp Header with Safe Inset */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        {/* Right side: Back button & Contact info */}
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.avatarWrap}>
            {conversation.contact_avatar ? (
              <Image source={{ uri: conversation.contact_avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>
                  {contactTitle.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.platformDot}>
              <FontAwesome name="whatsapp" size={8} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.contactDetails}>
            <Text style={styles.contactName} numberOfLines={1}>
              {contactTitle}
            </Text>
            <Text style={styles.contactSub} numberOfLines={1}>
              {conversation.contact_phone ? `+${conversation.contact_phone}` : ''}
              {conversation.session?.device_name ? ` • عبر: ${conversation.session.device_name}` : ''}
            </Text>
          </View>
        </View>

        {/* Left side actions: Transfer, Resolve */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setTransferVisible(true)}
            style={styles.actionIconBtn}
          >
            <MaterialCommunityIcons name="account-arrow-right-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setResolveVisible(true)}
            style={styles.actionIconBtn}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pinned Message Banner */}
      {pinnedMsg && (
        <View style={styles.pinnedBanner}>
          <TouchableOpacity
            style={styles.pinnedContent}
            onPress={() => {}}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="pin"
              size={16}
              color={Colors.primary}
              style={{ transform: [{ rotate: '45deg' }] }}
            />
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.pinnedTitle}>رسالة مثبتة</Text>
              <Text style={styles.pinnedText} numberOfLines={1}>
                {pinnedMsg.message || '📷 صورة'}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleUnpin} style={styles.unpinBtn}>
            <Ionicons name="close" size={16} color="#8696A0" />
          </TouchableOpacity>
        </View>
      )}

      {/* Transfer Alert / Status Banner */}
      {conversation.transferred_by ? (
        <View style={styles.transferBanner}>
          <Ionicons name="information-circle" size={15} color="#008069" />
          <Text style={styles.transferBannerText}>تم تحويل هذه المحادثة إليك</Text>
        </View>
      ) : null}

      {/* Messages area with Doodle pattern */}
      <View style={styles.chatBackground}>
        <Image
          source={require('../../assets/whatsapp-doodle.png')}
          style={styles.doodleOverlay}
          resizeMode="repeat"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {initialLoading && messages.length === 0 ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>جاري تحميل الرسائل...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={(item) => String(item.id || item.message_id)}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item }) => (
                <MessageBubble
                  message={item}
                  isGroup={isGroup}
                  onReply={(m) => setReplyTarget(m)}
                  onPin={handlePinPrompt}
                  onStar={handleToggleStar}
                  onDelete={handleDeleteMsg}
                />
              )}
            />
          )}

          {/* Quoted Reply Preview Bar */}
          {replyTarget && (
            <View style={styles.replyPreviewBar}>
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replySenderName}>
                  {replyTarget.direction === 'outgoing' ? 'أنت' : replyTarget.sender_name || contactTitle}
                </Text>
                <Text style={styles.replyMessageText} numberOfLines={1}>
                  {replyTarget.message || '📷 صورة'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTarget(null)} style={styles.closeReplyBtn}>
                <Ionicons name="close-circle" size={18} color="#8696A0" />
              </TouchableOpacity>
            </View>
          )}

          {/* Input Bar with Bottom Notch / Nav Inset */}
          <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {/* Quick replies shortcut */}
            <TouchableOpacity
              onPress={() => setQuickRepliesVisible(true)}
              style={styles.inputIconBtn}
            >
              <MaterialCommunityIcons name="flash-outline" size={22} color="#008069" />
            </TouchableOpacity>

            {/* Attach image button */}
            <TouchableOpacity
              onPress={handlePickImage}
              style={styles.inputIconBtn}
            >
              <Ionicons name="camera-outline" size={22} color="#54656F" />
            </TouchableOpacity>

            {/* Input field */}
            <TextInput
              style={styles.textInput}
              placeholder="اكتب رسالة..."
              placeholderTextColor="#8696A0"
              value={inputText}
              onChangeText={setInputText}
              multiline
              textAlign="right"
            />

            {/* Send button (WhatsApp iconic green circle) */}
            <TouchableOpacity
              style={[
                styles.sendButton,
                (!inputText.trim() || sending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={17} color="#FFFFFF" style={{ marginRight: -1 }} />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>

      {/* Quick Replies Sheet */}
      <QuickReplyModal
        visible={quickRepliesVisible}
        onClose={() => setQuickRepliesVisible(false)}
        onSelectReply={(text) => setInputText((prev) => (prev ? `${prev} ${text}` : text))}
      />

      {/* Transfer Chat Modal */}
      <TransferModal
        visible={transferVisible}
        conversationId={conversation.id}
        currentAgentId={user?.id}
        onClose={() => setTransferVisible(false)}
        onTransferred={() => {
          Alert.alert('نجاح', 'تم تحويل المحادثة للزميل بنجاح');
          onBack();
        }}
      />

      {/* Resolve Chat Modal */}
      <ResolveModal
        visible={resolveVisible}
        conversationId={conversation.id}
        onClose={() => setResolveVisible(false)}
        onResolved={() => {
          Alert.alert('نجاح', 'تم إنهاء المحادثة وتوثيقها بنجاح');
          loadMessages(false);
        }}
      />

      {/* Pin Duration Modal */}
      <PinDurationModal
        visible={pinDurationVisible}
        onClose={() => setPinDurationVisible(false)}
        onSelectDuration={handleSelectPinDuration}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.headerBg,
  },
  header: {
    backgroundColor: Colors.headerBg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  headerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    padding: 6,
    marginLeft: 4,
  },
  avatarWrap: {
    position: 'relative',
    marginLeft: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E9EDEF',
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#008069',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  platformDot: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#25D366',
    borderWidth: 1.5,
    borderColor: Colors.headerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactDetails: {
    flex: 1,
    alignItems: 'flex-end',
  },
  contactName: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  contactSub: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'right',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionIconBtn: {
    padding: 6,
  },
  pinnedBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRightWidth: 3.5,
    borderRightColor: Colors.primary,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  pinnedContent: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  pinnedTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: Colors.primaryDark,
    textAlign: 'right',
  },
  pinnedText: {
    fontSize: 11.5,
    color: '#54656F',
    textAlign: 'right',
  },
  unpinBtn: {
    padding: 4,
  },
  transferBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  transferBannerText: {
    fontSize: 11,
    color: '#008069',
    fontWeight: '700',
  },
  chatBackground: {
    flex: 1,
    backgroundColor: '#EFEAE2',
    position: 'relative',
  },
  doodleOverlay: {
    ...StyleSheet.absoluteFill,
    opacity: 0.05,
    width: '100%',
    height: '100%',
  },
  messagesList: {
    paddingVertical: 10,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#667781',
  },
  replyPreviewBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 4,
    borderRightColor: Colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 8,
  },
  replyPreviewContent: {
    flex: 1,
  },
  replySenderName: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryDark,
    textAlign: 'right',
  },
  replyMessageText: {
    fontSize: 11.5,
    color: '#667781',
    textAlign: 'right',
  },
  closeReplyBtn: {
    padding: 4,
    marginRight: 6,
  },
  inputContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 6,
  },
  inputIconBtn: {
    padding: 6,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
    color: '#111B21',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#A0AEC0',
    opacity: 0.7,
  },
});
