import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { MessageBubble } from '../components/MessageBubble';
import { ChatAvatar } from '../components/ChatAvatar';
import { AttachmentSheet, AttachmentKind } from '../components/AttachmentSheet';
import { MediaComposerModal, PendingMedia } from '../components/MediaComposerModal';
import { MediaViewerModal, GalleryMediaItem } from '../components/MediaViewerModal';
import { MessageActionsSheet } from '../components/MessageActionsSheet';
import { ContactInfoModal } from '../components/ContactInfoModal';
import { ForwardModal } from '../components/ForwardModal';
import { QuickReplyModal } from '../components/QuickReplyModal';
import { TransferModal } from '../components/TransferModal';
import { ResolveModal } from '../components/ResolveModal';
import { PinDurationModal } from '../components/PinDurationModal';
import { chatService } from '../services/chatService';
import { mediaSrc, isPlaceholderText } from '../services/media';
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
  const { user, token, isAgent } = useAuth();
  const insets = useSafeAreaInsets();

  const [conversation, setConversation] = useState<Conversation>(initialConv);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pinnedMsg, setPinnedMsg] = useState<PinnedPreview | null>(null);
  const [inputText, setInputText] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [customWallpaperUri, setCustomWallpaperUri] = useState<string | null>(null);
  const [contactInfoVisible, setContactInfoVisible] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  // On-screen Y of the chat area — the exact keyboardVerticalOffset KAV
  // needs, since it computes overlap from its own parent-relative frame.
  const [chatTopOffset, setChatTopOffset] = useState(0);

  // Media state
  const [attachVisible, setAttachVisible] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [mediaSending, setMediaSending] = useState(false);
  const [viewerState, setViewerState] = useState<{ items: GalleryMediaItem[]; index: number } | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);

  // Voice recording
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);

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

  const isGroup = Boolean(conversation.contact_jid?.includes('@g.us'));

  // Listen to keyboard show/hide to avoid covering input
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Load wallpaper from AsyncStorage
  const loadWallpaper = useCallback(async () => {
    try {
      const convWp = await AsyncStorage.getItem(`chat_wallpaper_${conversation.id}`);
      if (convWp) {
        setCustomWallpaperUri(convWp);
        return;
      }
      const globalWp = await AsyncStorage.getItem('default_chat_wallpaper');
      setCustomWallpaperUri(globalWp || null);
    } catch {}
  }, [conversation.id]);

  useEffect(() => {
    loadWallpaper();
  }, [loadWallpaper]);

  // Load messages (supports silent background polling)
  const loadMessages = useCallback(async (isInitial = false) => {
    if (isDeadConversation || !conversation?.id) return;

    const seq = ++msgLoadSeq.current;
    if (isInitial && messages.length === 0) {
      setInitialLoading(true);
    }

    try {
      const res = await chatService.getMessages(conversation.id, { limit: 60 });
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

        // Only trigger re-render if messages list or status actually changed
        setMessages((prev) => {
          if (prev.length !== res.messages.length) return res.messages;
          for (let i = 0; i < res.messages.length; i++) {
            if (prev[i]?.id !== res.messages[i]?.id || prev[i]?.status !== res.messages[i]?.status) {
              return res.messages;
            }
          }
          return prev;
        });

        if (isInitial) {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 60);
        }

        setPinnedMsg(res.pinned || null);
        if (res.conversation) {
          setConversation(res.conversation);
        }
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 409 || status === 423) {
        setIsDeadConversation(true);
        Alert.alert(
          'تنبيه',
          err?.response?.data?.message || 'هذه المحادثة غير متاحة حالياً',
          [{ text: 'العودة للمحادثات', onPress: onBack }]
        );
        return;
      }
      if (isInitial) {
        console.warn('Could not load chat messages:', err?.message || err);
      }
    } finally {
      if (seq === msgLoadSeq.current) {
        setInitialLoading(false);
      }
    }
  }, [conversation.id, isDeadConversation, messages.length, onBack]);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) loadMessages(true);
    });
    return () => {
      alive = false;
    };
  }, [loadMessages]);

  // Periodic silent background polling for incoming messages in this chat
  useEffect(() => {
    if (isDeadConversation) return;

    const timer = setInterval(() => {
      loadMessages(false);
    }, 4500);
    return () => clearInterval(timer);
  }, [loadMessages, isDeadConversation]);

  // Send message
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    const replyId = replyTarget?.message_id || null;
    const optimisticMessage: Message = {
      id: Date.now(),
      message_id: `temp_${Date.now()}`,
      conversation_id: conversation.id,
      direction: 'outgoing',
      message_type: 'text',
      message: text,
      timestamp: new Date().toISOString(),
      status: 'pending',
      reply_to_id: replyId,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 40);
    setInputText('');
    setReplyTarget(null);
    setSending(true);

    try {
      const res = await chatService.sendMessage(
        conversation.id,
        text,
        replyId,
        conversation.session_id
      );
      if (res && res.success === false) {
        Alert.alert('فشل الإرسال', res.message || 'تعذر إرسال الرسالة للعميل');
        loadMessages(false);
      } else {
        loadMessages(false);
      }
    } catch (err: any) {
      Alert.alert('فشل الإرسال', err.response?.data?.message || 'تعذر إرسال الرسالة للعميل');
      loadMessages(false);
    } finally {
      setSending(false);
    }
  };

  // ----- Attachment picking -----

  const handleAttachSelect = async (kind: AttachmentKind) => {
    setAttachVisible(false);
    if (kind === 'document') {
      await pickDocument();
    } else if (kind === 'camera') {
      await pickMedia(true);
    } else {
      await pickMedia(false);
    }
  };

  const pickMedia = async (useCamera = false) => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('الصلاحية مطلوبة', 'يرجى السماح بالوصول للكاميرا لالتقاط الصور والفيديوهات');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.85,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('الصلاحية مطلوبة', 'يرجى السماح بالوصول لمعرض الصور');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.85,
        });
      }

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const filename =
        asset.fileName ||
        asset.uri.split('/').pop() ||
        (isVideo ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`);
      const mime =
        asset.mimeType ||
        (isVideo ? 'video/mp4' : 'image/jpeg');

      setPendingMedia({
        uri: asset.uri,
        name: filename,
        mimeType: mime,
        type: isVideo ? 'video' : 'image',
      });
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'تعذر اختيار الملف');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setPendingMedia({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
        type: 'document',
      });
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'تعذر اختيار المستند');
    }
  };

  const handleSendMedia = async (caption: string) => {
    if (!pendingMedia) return;
    const media = pendingMedia;
    const targetReply = replyTarget;
    setReplyTarget(null);
    setMediaSending(true);

    try {
      const res = await chatService.sendMedia(
        conversation.id,
        { uri: media.uri, name: media.name, mimeType: media.mimeType },
        media.type,
        {
          caption: caption || undefined,
          sessionId: conversation.session_id,
          replyToId: targetReply?.message_id,
        }
      );
      if (res && res.success === false) {
        Alert.alert('فشل الإرسال', res.message || 'تعذر إرسال الملف');
      } else {
        loadMessages(false);
      }
      setPendingMedia(null);
    } catch (err: any) {
      Alert.alert('فشل الإرسال', err.response?.data?.message || 'حدث خطأ أثناء رفع الملف');
    } finally {
      setMediaSending(false);
    }
  };

  // ----- Voice recording -----

  const startRecording = async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الصلاحية مطلوبة', 'اسمح للتطبيق باستخدام الميكروفون لتسجيل الرسائل الصوتية');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setRecordSecs(0);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'تعذر بدء التسجيل');
    }
  };

  const cancelRecording = async () => {
    try {
      await recorder.stop();
    } catch {}
    setIsRecording(false);
    setRecordSecs(0);
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
  };

  const sendRecording = async () => {
    try {
      await recorder.stop();
    } catch {}
    setIsRecording(false);
    setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

    const uri = recorder.uri || recorderState.url;
    if (!uri) {
      Alert.alert('خطأ', 'لم يتم حفظ التسجيل');
      return;
    }
    if (recordSecs < 1) return;

    setMediaSending(true);
    try {
      const res = await chatService.sendMedia(
        conversation.id,
        { uri, name: `voice_${Date.now()}.m4a`, mimeType: 'audio/m4a' },
        'voice',
        { sessionId: conversation.session_id, replyToId: replyTarget?.message_id }
      );
      setReplyTarget(null);
      if (res && res.success === false) {
        Alert.alert('فشل الإرسال', res.message || 'تعذر إرسال التسجيل الصوتي');
      } else {
        loadMessages(false);
      }
    } catch (err: any) {
      Alert.alert('فشل الإرسال', err.response?.data?.message || 'تعذر إرسال التسجيل');
    } finally {
      setMediaSending(false);
    }
  };

  useEffect(() => {
    let t: any;
    if (isRecording) {
      t = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    }
    return () => clearInterval(t);
  }, [isRecording]);

  const formatRecTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ----- Message actions -----

  const handleActionReply = (m: Message) => {
    setReplyTarget(m);
  };

  const handleActionForward = (m: Message) => {
    setForwardTarget(m);
  };

  const handleActionPin = (m: Message) => {
    setSelectedMsgForPin(m);
    setPinDurationVisible(true);
  };

  const handleSelectPinDuration = async (durationSecs: number) => {
    setPinDurationVisible(false);
    if (!selectedMsgForPin) return;
    try {
      const res = await chatService.pinMessage(selectedMsgForPin.id, durationSecs);
      if (res && res.success && res.pinned) {
        setPinnedMsg(res.pinned);
      }
    } catch (err: any) {
      Alert.alert('خطأ', err.response?.data?.message || 'فشل تثبيت الرسالة');
    } finally {
      setSelectedMsgForPin(null);
    }
  };

  const handleActionStar = async (m: Message) => {
    try {
      await chatService.toggleStar(m.id);
      loadMessages(false);
    } catch {}
  };

  const handleActionDelete = async (m: Message) => {
    Alert.alert(
      'حذف الرسالة',
      'هل تريد حذف هذه الرسالة؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف لدي فقط',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.deleteMessage(m.id, conversation.id, false);
              setMessages((prev) => prev.filter((x) => x.id !== m.id));
            } catch {}
          },
        },
        ...(m.direction === 'outgoing'
          ? [
              {
                text: 'حذف لدى الجميع',
                style: 'destructive' as const,
                onPress: async () => {
                  try {
                    await chatService.deleteMessage(m.id, conversation.id, true);
                    loadMessages(false);
                  } catch (err: any) {
                    Alert.alert('خطأ', err.response?.data?.message || 'تعذر الحذف لدى الجميع');
                  }
                },
              },
            ]
          : []),
      ]
    );
  };

  const handleActionReaction = async (m: Message, emoji: string | null) => {
    try {
      await chatService.sendReaction(conversation.id, m.message_id || m.id, emoji);
      loadMessages(false);
    } catch {}
  };

  const handleUnpin = async () => {
    try {
      await chatService.unpinMessage(conversation.id);
      setPinnedMsg(null);
    } catch {}
  };

  const jumpToPinned = () => {
    if (!pinnedMsg) return;
    const idx = messages.findIndex(
      (m) => m.id === pinnedMsg.id || (pinnedMsg.message_id && m.message_id === pinnedMsg.message_id)
    );
    if (idx !== -1) {
      flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    }
  };

  // Gallery items for the full media viewer
  const galleryItems = useMemo(() => {
    const list: GalleryMediaItem[] = [];
    for (const m of messages) {
      if (['image', 'video', 'sticker'].includes(m.message_type)) {
        const uri = mediaSrc(m, token);
        if (uri) {
          list.push({
            id: m.id || m.message_id || Math.random(),
            uri,
            kind: m.message_type === 'video' ? 'video' : 'image',
            caption: m.media_caption || m.message,
            senderName: m.direction === 'outgoing' ? 'أنت' : m.sender_name || conversation.contact_name,
            timestamp: m.timestamp,
          });
        }
      }
    }
    return list;
  }, [messages, token, conversation.contact_name]);

  const handleViewMedia = (m: Message) => {
    const mUri = mediaSrc(m, token);
    if (!mUri) return;
    const idx = galleryItems.findIndex((it) => it.id === m.id || it.uri === mUri);
    setViewerState({
      items: galleryItems.length ? galleryItems : [{
        id: m.id,
        uri: mUri,
        kind: m.message_type === 'video' ? 'video' : 'image',
        caption: m.media_caption || m.message,
        senderName: m.direction === 'outgoing' ? 'أنت' : m.sender_name,
        timestamp: m.timestamp,
      }],
      index: idx >= 0 ? idx : 0,
    });
  };

  // Map reply_to_id
  const messagesByWamid = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) {
      if (m.message_id) map.set(m.message_id, m);
    }
    return map;
  }, [messages]);

  const contactTitle =
    conversation.contact_name ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل');

  const msgLabel = (m?: PinnedPreview | Message | null): string => {
    if (!m) return '';
    const raw = (m.message || '').trim();
    if (raw && !isPlaceholderText(m as any)) return m.message!;
    const labels: Record<string, string> = {
      image: '📷 صورة',
      video: '🎥 فيديو',
      audio: '🎤 تسجيل صوتي',
      voice: '🎤 تسجيل صوتي',
      document: '📄 مستند',
      sticker: 'ملصق',
      location: '📍 موقع',
      contact: '👤 جهة اتصال',
      call: '📞 مكالمة',
    };
    return labels[m.message_type] || m.message || 'رسالة';
  };

  // Day separator helper
  const dayKey = (t?: string | null) => {
    if (!t) return '';
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  };

  const dayLabel = (t?: string | null) => {
    if (!t) return '';
    try {
      const d = new Date(t);
      const today = new Date();
      const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
      if (diff === 0) return 'اليوم';
      if (diff === 1) return 'أمس';
      return d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return '';
    }
  };

  // Unread separator index
  const unreadStartIndex = useMemo(() => {
    if (!conversation.unread_count || conversation.unread_count <= 0) return -1;
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === 'incoming') {
        count++;
        if (count === conversation.unread_count) return i;
      }
    }
    return -1;
  }, [messages, conversation.unread_count]);

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />

      {/* WhatsApp Header with Safe Inset */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        {/* Right side: Back button & Contact info (Tappable to open ContactInfoModal) */}
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerContactTouch}
            onPress={() => setContactInfoVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.avatarWrap}>
              <ChatAvatar conversation={conversation} title={contactTitle} size={38} badge />
            </View>

            <View style={styles.contactDetails}>
              <Text style={styles.contactName} numberOfLines={1}>
                {contactTitle}
              </Text>
              <Text style={styles.contactSub} numberOfLines={1}>
                {conversation.contact_phone ? `+${conversation.contact_phone}` : ''}
                {conversation.session?.device_name ? ` • عبر: ${conversation.session.device_name}` : ''}
                {conversation.assigned_agent
                  ? ` • مع ${conversation.assigned_agent.id === user?.id ? 'أنا' : conversation.assigned_agent.name}`
                  : ''}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Left side actions: Transfer, Resolve */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setTransferVisible(true)}
            style={styles.actionIconBtn}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="account-arrow-right-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setResolveVisible(true)}
            style={styles.actionIconBtn}
            hitSlop={8}
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
            onPress={jumpToPinned}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="pin"
              size={16}
              color="#00A884"
              style={{ transform: [{ rotate: '45deg' }] }}
            />
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.pinnedTitle}>رسالة مثبتة</Text>
              <Text style={styles.pinnedText} numberOfLines={1}>
                {msgLabel(pinnedMsg)}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleUnpin} style={styles.unpinBtn} hitSlop={8}>
            <Ionicons name="close" size={18} color="#8696A0" />
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
      <View
        style={styles.chatBackground}
        onLayout={(e) => setChatTopOffset(e.nativeEvent.layout.y)}
      >
        <Image
          source={
            customWallpaperUri
              ? { uri: customWallpaperUri }
              : require('../../assets/whatsapp-doodle.png')
          }
          style={styles.doodleOverlay}
          resizeMode={customWallpaperUri ? 'cover' : 'repeat'}
        />

        {/*
          Edge-to-edge Android (API 35+) ignores adjustResize — the window
          never shrinks, so the keyboard would cover the input. 'padding'
          measures the overlap between this view's own frame and the
          keyboard, so it self-corrects: ~0 when the OS already resized,
          full keyboard height when it did not. The offset is this area's
          measured distance from the top of the screen (header + banners).
        */}
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1 }}
          keyboardVerticalOffset={chatTopOffset}
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
              removeClippedSubviews={Platform.OS === 'android'}
              maxToRenderPerBatch={10}
              windowSize={7}
              initialNumToRender={15}
              onScroll={(e) => {
                const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
                const dist = contentSize.height - (contentOffset.y + layoutMeasurement.height);
                setShowScrollBottom(dist > 180);
              }}
              scrollEventThrottle={100}
              renderItem={({ item, index }) => {
                const prev = index > 0 ? messages[index - 1] : null;
                const isNewDay = index === 0 || dayKey(item.timestamp) !== dayKey(prev?.timestamp);
                const isUnreadSeparator = index === unreadStartIndex;

                return (
                  <View>
                    {/* Day Separator Pill */}
                    {isNewDay && (
                      <View style={styles.daySeparatorWrap}>
                        <View style={styles.dayPill}>
                          <Text style={styles.dayPillText}>{dayLabel(item.timestamp)}</Text>
                        </View>
                      </View>
                    )}

                    {/* Unread Messages Separator */}
                    {isUnreadSeparator && (
                      <View style={styles.unreadSeparatorWrap}>
                        <View style={styles.unreadSeparatorLine} />
                        <View style={styles.unreadPill}>
                          <Text style={styles.unreadPillText}>رسائل غير مقروءة</Text>
                        </View>
                        <View style={styles.unreadSeparatorLine} />
                      </View>
                    )}

                    <MessageBubble
                      message={item}
                      isGroup={isGroup}
                      conversation={conversation}
                      contactTitle={contactTitle}
                      quoted={item.reply_to_id ? messagesByWamid.get(String(item.reply_to_id)) || null : null}
                      onActions={(m) => setActionsFor(m)}
                      onViewMedia={handleViewMedia}
                    />
                  </View>
                );
              }}
            />
          )}

          {/* Floating Scroll To Bottom Arrow */}
          {showScrollBottom && (
            <TouchableOpacity
              style={styles.scrollBottomBtn}
              onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
              activeOpacity={0.8}
            >
              <Ionicons name="chevron-down" size={22} color="#8696A0" />
            </TouchableOpacity>
          )}

          {/* Quoted Reply Preview Bar */}
          {replyTarget && (
            <View style={styles.replyPreviewBar}>
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replySenderName}>
                  {replyTarget.direction === 'outgoing' ? 'أنت' : replyTarget.sender_name || contactTitle}
                </Text>
                <Text style={styles.replyMessageText} numberOfLines={1}>
                  {msgLabel(replyTarget)}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTarget(null)} style={styles.closeReplyBtn}>
                <Ionicons name="close-circle" size={18} color="#8696A0" />
              </TouchableOpacity>
            </View>
          )}

          {/* Recording bar — replaces the input while a voice note is captured */}
          {isRecording ? (
            <View
              style={[
                styles.inputContainer,
                { paddingBottom: isKeyboardVisible ? 6 : Math.max(insets.bottom, 8) },
              ]}
            >
              <TouchableOpacity onPress={cancelRecording} style={styles.inputIconBtn}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
              </TouchableOpacity>

              <View style={styles.recordingCenter}>
                <View style={styles.recordingBlinkDot} />
                <Text style={styles.recordingTimer}>{formatRecTime(recordSecs)}</Text>
                <Text style={styles.recordingHint}>جاري التسجيل...</Text>
              </View>

              <TouchableOpacity
                style={styles.sendButton}
                onPress={sendRecording}
                disabled={mediaSending}
                activeOpacity={0.8}
              >
                {mediaSending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="send" size={17} color="#FFFFFF" style={{ marginRight: -1 }} />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* Input Bar with Bottom Notch / Nav Inset */
            <View
              style={[
                styles.inputContainer,
                { paddingBottom: isKeyboardVisible ? 6 : Math.max(insets.bottom, 8) },
              ]}
            >
              {/* Quick replies shortcut */}
              <TouchableOpacity
                onPress={() => setQuickRepliesVisible(true)}
                style={styles.inputIconBtn}
              >
                <MaterialCommunityIcons name="flash-outline" size={22} color="#008069" />
              </TouchableOpacity>

              {/* Attach media button */}
              <TouchableOpacity
                onPress={() => setAttachVisible(true)}
                style={styles.inputIconBtn}
              >
                <Ionicons name="attach" size={24} color="#8696A0" style={{ transform: [{ rotate: '-45deg' }] }} />
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

              {/* Send text OR record a voice note — WhatsApp style swap */}
              {inputText.trim() ? (
                <TouchableOpacity
                  style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                  onPress={handleSend}
                  disabled={sending}
                  activeOpacity={0.8}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="send" size={17} color="#FFFFFF" style={{ marginRight: -1 }} />
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={startRecording}
                  disabled={mediaSending}
                  activeOpacity={0.8}
                >
                  {mediaSending ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="mic" size={19} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
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
          Alert.alert('نجاح', 'تم إنهاء المحادثة (مكتمل) بنجاح');
          if (isAgent) {
            onBack();
          } else {
            loadMessages(false);
          }
        }}
      />

      {/* Pin Duration Modal */}
      <PinDurationModal
        visible={pinDurationVisible}
        onClose={() => setPinDurationVisible(false)}
        onSelectDuration={handleSelectPinDuration}
      />

      {/* Attach sheet — gallery / camera / document */}
      <AttachmentSheet
        visible={attachVisible}
        onClose={() => setAttachVisible(false)}
        onSelect={handleAttachSelect}
      />

      {/* Media composer — preview + optional caption before sending */}
      <MediaComposerModal
        media={pendingMedia}
        sending={mediaSending}
        onClose={() => setPendingMedia(null)}
        onSend={handleSendMedia}
      />

      {/* Fullscreen image / video viewer with bottom thumbnail filmstrip */}
      <MediaViewerModal
        visible={!!viewerState}
        items={viewerState?.items || []}
        initialIndex={viewerState?.index || 0}
        onClose={() => setViewerState(null)}
      />

      {/* Contact Info Sidebar / Modal (Image 2) */}
      <ContactInfoModal
        visible={contactInfoVisible}
        conversation={conversation}
        onClose={() => setContactInfoVisible(false)}
        onViewMedia={handleViewMedia}
        onWallpaperChanged={loadWallpaper}
        onContactRenamed={(newName) => {
          setConversation((prev) => ({ ...prev, contact_name: newName }));
        }}
      />

      {/* Long-press message actions (reactions + reply/forward/pin/star/copy/delete) */}
      <MessageActionsSheet
        message={actionsFor}
        onClose={() => setActionsFor(null)}
        onReact={(emoji) => actionsFor && handleActionReaction(actionsFor, emoji)}
        onReply={(m) => handleActionReply(m)}
        onForward={(m) => handleActionForward(m)}
        onPin={(m) => handleActionPin(m)}
        onStar={(m) => handleActionStar(m)}
        onDelete={(m) => handleActionDelete(m)}
      />

      {/* Forward message modal */}
      <ForwardModal
        visible={!!forwardTarget}
        message={forwardTarget}
        currentConversationId={conversation.id}
        onClose={() => setForwardTarget(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#008069',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#008069',
    paddingHorizontal: 8,
    paddingBottom: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerContactTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtn: {
    padding: 6,
    marginRight: 2,
  },
  avatarWrap: {
    marginRight: 8,
  },
  contactDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    textAlign: 'left',
  },
  contactSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.82)',
    marginTop: 1,
    textAlign: 'left',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 4,
    borderRightColor: '#00A884',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    zIndex: 10,
  },
  pinnedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinnedTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00A884',
    textAlign: 'right',
  },
  pinnedText: {
    fontSize: 12,
    color: '#111B21',
    marginTop: 1,
    textAlign: 'right',
  },
  unpinBtn: {
    padding: 6,
    marginLeft: 4,
  },
  transferBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7FCE8',
    paddingVertical: 5,
    paddingHorizontal: 12,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#B6E3D4',
  },
  transferBannerText: {
    fontSize: 11.5,
    color: '#008069',
    fontWeight: '600',
  },
  chatBackground: {
    flex: 1,
    backgroundColor: '#EFEAE2',
    position: 'relative',
  },
  doodleOverlay: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 0.06,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#8696A0',
  },
  messagesList: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  daySeparatorWrap: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dayPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 1.5,
    elevation: 1,
  },
  dayPillText: {
    color: '#54656F',
    fontSize: 11.5,
    fontWeight: '600',
  },
  unreadSeparatorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 16,
  },
  unreadSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#D1D7DB',
  },
  unreadPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  unreadPillText: {
    color: '#00A884',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollBottomBtn: {
    position: 'absolute',
    right: 16,
    bottom: 74,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    zIndex: 15,
  },
  replyPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0F2F5',
    borderRightWidth: 4,
    borderRightColor: '#00A884',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 8,
    marginBottom: 4,
    borderRadius: 8,
  },
  replyPreviewContent: {
    flex: 1,
    marginRight: 6,
  },
  replySenderName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00A884',
    textAlign: 'right',
  },
  replyMessageText: {
    fontSize: 12,
    color: '#54656F',
    textAlign: 'right',
    marginTop: 1,
  },
  closeReplyBtn: {
    padding: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 6,
  },
  inputIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    color: '#111B21',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14.5,
    maxHeight: 100,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  recordingCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 6,
  },
  recordingBlinkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingTimer: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111B21',
  },
  recordingHint: {
    fontSize: 12,
    color: '#667781',
  },
});
