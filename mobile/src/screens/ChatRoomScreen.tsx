import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { MessageBubble } from '../components/MessageBubble';
import { SwipeableMessageRow } from '../components/SwipeableMessageRow';
import { ChatAvatar } from '../components/ChatAvatar';
import { ChatWallpaper } from '../components/ChatWallpaper';
import { KeyboardSafeView } from '../components/KeyboardSafeView';
import { ChatInputBar, ChatInputBarHandle } from '../components/ChatInputBar';
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
import { chatCache } from '../services/chatCache';
import { chatPrefs } from '../services/chatPrefs';
import { mediaSrc, isPlaceholderText } from '../services/media';
import { Config } from '../constants/config';
import { playIncomingMessage } from '../services/notifySound';
import { useAuth } from '../context/AuthContext';
import { Conversation, MediaEditSpec, Message, PinnedPreview } from '../types/crm';
import { Colors } from '../constants/theme';

interface ChatRoomScreenProps {
  conversation: Conversation;
  onBack: () => void;
  focusMessageId?: number | string | null;
}

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
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const msgLabel = (m?: PinnedPreview | Message | null): string => {
  if (!m) return '';
  const raw = ((m as Message).media_caption || m.message || '').trim();
  if (raw && !isPlaceholderText(m as any)) return raw;
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

const mergeChronologicalMessages = (
  existing: Message[],
  incomingServer: Message[],
  mode: 'replace_window' | 'append_newer' | 'prepend_older'
): Message[] => {
  const localOptimistic = existing.filter((m) => Boolean(m.client_temp_id));
  const serverIds = new Set(incomingServer.map((m) => m.id));
  const serverWamids = new Set(incomingServer.map((m) => m.message_id).filter(Boolean));

  let base: Message[];
  if (mode === 'replace_window') {
    const olderKept = existing.filter(
      (m) =>
        !m.client_temp_id &&
        incomingServer.length > 0 &&
        new Date(m.timestamp).getTime() < new Date(incomingServer[0].timestamp).getTime() &&
        !serverIds.has(m.id)
    );
    base = [...olderKept, ...incomingServer];
  } else if (mode === 'prepend_older') {
    const existingIds = new Set(existing.filter((m) => !m.client_temp_id).map((m) => m.id));
    const freshOlder = incomingServer.filter((m) => !existingIds.has(m.id));
    base = [...freshOlder, ...existing.filter((m) => !m.client_temp_id)];
  } else {
    const byId = new Map<number, Message>();
    for (const m of existing) {
      if (!m.client_temp_id) byId.set(m.id, m);
    }
    for (const m of incomingServer) {
      const prev = byId.get(m.id);
      byId.set(m.id, prev?.local_uri && !prev.edit_spec ? { ...m, local_uri: prev.local_uri } : m);
    }
    base = Array.from(byId.values());
  }

  base.sort((a, b) => {
    const ta = new Date(a.timestamp).getTime();
    const tb = new Date(b.timestamp).getTime();
    if (ta !== tb) return ta - tb;
    return (a.id || 0) - (b.id || 0);
  });

  const survivingOptimistic = localOptimistic.filter(
    (opt) => !serverIds.has(opt.id) && !(opt.message_id && serverWamids.has(opt.message_id))
  );

  return [...base, ...survivingOptimistic];
};

export const ChatRoomScreen: React.FC<ChatRoomScreenProps> = ({
  conversation: initialConv,
  onBack,
  focusMessageId = null,
}) => {
  const { user, token, isAgent } = useAuth();
  const insets = useSafeAreaInsets();

  const cachedThread = useMemo(() => chatCache.getThread(initialConv.id), [initialConv.id]);

  const [conversation, setConversation] = useState<Conversation>(initialConv);
  const [messages, setMessages] = useState<Message[]>(() => cachedThread?.messages || []);
  const [pinnedMsg, setPinnedMsg] = useState<PinnedPreview | null>(
    () => cachedThread?.pinned || null
  );
  const [hasMoreOlder, setHasMoreOlder] = useState<boolean>(
    () => cachedThread?.hasMore ?? false
  );
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [initialLoading, setInitialLoading] = useState(() => !cachedThread?.messages?.length);

  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [highlightedMsgKey, setHighlightedMsgKey] = useState<string | number | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [hasNewerTail, setHasNewerTail] = useState(false);
  const [customWallpaperUri, setCustomWallpaperUri] = useState<string | null>(null);
  const [contactInfoVisible, setContactInfoVisible] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const [attachVisible, setAttachVisible] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [viewerState, setViewerState] = useState<{ items: GalleryMediaItem[]; index: number } | null>(null);
  const [actionsFor, setActionsFor] = useState<Message | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Message | null>(null);

  const [quickRepliesVisible, setQuickRepliesVisible] = useState(false);
  const [transferVisible, setTransferVisible] = useState(false);
  const [resolveVisible, setResolveVisible] = useState(false);
  const [pinDurationVisible, setPinDurationVisible] = useState(false);
  const [selectedMsgForPin, setSelectedMsgForPin] = useState<Message | null>(null);
  const [isDeadConversation, setIsDeadConversation] = useState(false);

  const flatListRef = useRef<FlatList<Message>>(null);
  const composerRef = useRef<ChatInputBarHandle>(null);
  const onBackRef = useRef(onBack);

  const msgLoadSeq = useRef(0);
  const knownIncomingIds = useRef<Set<string | number>>(new Set());
  const initialLoadDone = useRef(false);
  const scrolledUpRef = useRef(false);
  const messagesRef = useRef<Message[]>(messages);
  const initialUnreadAnchorIdRef = useRef<number | string | null>(null);
  const capturedInitialUnreadRef = useRef(initialConv.unread_count || 0);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const isGroup = Boolean(conversation.contact_jid?.includes('@g.us'));

  const loadWallpaper = useCallback(async () => {
    try {
      const convWp = await AsyncStorage.getItem(`chat_wallpaper_${initialConv.id}`);
      if (convWp) {
        setCustomWallpaperUri(convWp);
        return;
      }
      const globalWp = await AsyncStorage.getItem('default_chat_wallpaper');
      setCustomWallpaperUri(globalWp || null);
    } catch {}
  }, [initialConv.id]);

  useEffect(() => {
    Promise.resolve().then(() => {
      loadWallpaper();
    });
  }, [loadWallpaper]);

  const syncToCache = useCallback(
    (nextMsgs: Message[], nextPinned?: PinnedPreview | null, nextHasMore?: boolean) => {
      chatCache.setThread(initialConv.id, {
        messages: nextMsgs,
        pinned: nextPinned,
        hasMore: nextHasMore,
      });
    },
    [initialConv.id]
  );

  const fetchLatestWindow = useCallback(
    async (mode: 'initial' | 'poll') => {
      if (isDeadConversation) return;
      const seq = ++msgLoadSeq.current;

      try {
        const res = await chatService.getMessages(
          initialConv.id,
          focusMessageId && !initialLoadDone.current
            ? { around_id: focusMessageId, limit: 80 }
            : { limit: 60 }
        );
        if (seq !== msgLoadSeq.current || !res?.success || !Array.isArray(res.messages)) {
          return;
        }

        if (initialLoadDone.current) {
          const freshIncoming = res.messages.filter(
            (m) =>
              m.direction === 'incoming' &&
              !knownIncomingIds.current.has(m.id ?? m.message_id)
          );
          if (freshIncoming.length > 0) {
            if (!chatPrefs.isMuted(initialConv.id)) {
              playIncomingMessage();
            }
            if (scrolledUpRef.current) {
              setNewBelowCount((c) => c + freshIncoming.length);
            }
          }
        } else if (capturedInitialUnreadRef.current > 0 && !initialUnreadAnchorIdRef.current) {
          let count = 0;
          for (let i = res.messages.length - 1; i >= 0; i--) {
            if (res.messages[i].direction === 'incoming') {
              count++;
              if (count === capturedInitialUnreadRef.current) {
                initialUnreadAnchorIdRef.current = res.messages[i].id || res.messages[i].message_id;
                break;
              }
            }
          }
        }

        for (const m of res.messages) {
          if (m.direction === 'incoming') {
            knownIncomingIds.current.add(m.id ?? m.message_id);
          }
        }
        initialLoadDone.current = true;

        if (mode === 'initial') {
          setHasMoreOlder(Boolean(res.has_more));
          setHasNewerTail(Boolean(focusMessageId && res.has_newer));
        }

        setMessages((prev) => {
          const merged = mergeChronologicalMessages(
            prev,
            res.messages,
            mode === 'initial' ? 'replace_window' : 'append_newer'
          );

          if (merged.length === prev.length) {
            let identical = true;
            for (let i = 0; i < merged.length; i++) {
              const a = prev[i];
              const b = merged[i];
              if (
                a?.id !== b?.id ||
                a?.client_temp_id !== b?.client_temp_id ||
                a?.status !== b?.status ||
                a?.starred_at !== b?.starred_at ||
                a?.revoked_at !== b?.revoked_at ||
                a?.media_url !== b?.media_url ||
                (a?.reactions?.length || 0) !== (b?.reactions?.length || 0)
              ) {
                identical = false;
                break;
              }
            }
            if (identical) return prev;
          }

          syncToCache(
            merged,
            res.pinned || null,
            mode === 'initial' ? Boolean(res.has_more) : undefined
          );
          return merged;
        });

        setPinnedMsg(res.pinned || null);
        if (res.conversation) {
          setConversation(res.conversation);
        }
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 404 || status === 409 || status === 423) {
          setIsDeadConversation(true);
          Alert.alert(
            'تنبيه',
            err?.response?.data?.message || 'هذه المحادثة غير متاحة حالياً',
            [{ text: 'العودة للمحادثات', onPress: () => onBackRef.current() }]
          );
        }
      } finally {
        if (seq === msgLoadSeq.current) {
          setInitialLoading(false);
        }
      }
    },
    [initialConv.id, isDeadConversation, syncToCache, focusMessageId]
  );

  useEffect(() => {
    fetchLatestWindow('initial');
  }, [fetchLatestWindow]);

  useEffect(() => {
    if (isDeadConversation) return;
    const timer = setInterval(() => {
      fetchLatestWindow('poll');
    }, 4000);
    return () => clearInterval(timer);
  }, [fetchLatestWindow, isDeadConversation]);

  const handleLoadOlder = useCallback(async () => {
    if (loadingOlder || !hasMoreOlder || initialLoading) return;
    const oldestReal = messagesRef.current.find((m) => !m.client_temp_id && m.id > 0);
    if (!oldestReal) return;

    setLoadingOlder(true);
    try {
      const res = await chatService.getMessages(initialConv.id, {
        before_id: oldestReal.id,
        limit: 45,
      });
      if (res?.success && Array.isArray(res.messages)) {
        setHasMoreOlder(Boolean(res.has_more));
        if (res.messages.length > 0) {
          setMessages((prev) => {
            const next = mergeChronologicalMessages(prev, res.messages, 'prepend_older');
            syncToCache(next, undefined, Boolean(res.has_more));
            return next;
          });
        }
      }
    } catch {
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMoreOlder, initialLoading, initialConv.id, syncToCache]);

  const scrollToLatest = useCallback((animated = true) => {
    setNewBelowCount(0);
    if (hasNewerTail) {
      setHasNewerTail(false);
      fetchLatestWindow('poll').finally(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated });
      });
      return;
    }
    flatListRef.current?.scrollToOffset({ offset: 0, animated });
  }, [hasNewerTail, fetchLatestWindow]);

  const executeTextSend = useCallback(
    async (tempId: string, text: string, replyId: string | null) => {
      try {
        const res = await chatService.sendMessage(
          conversation.id,
          text,
          replyId,
          conversation.session_id
        );
        if (res && res.success !== false) {
          const serverMsg: Message | undefined = res.message;
          setMessages((prev) => {
            const next = prev.map((m) => {
              if (m.client_temp_id !== tempId) return m;
              if (serverMsg) {
                return { ...serverMsg, status: serverMsg.status || 'sent' };
              }
              return { ...m, client_temp_id: null, status: 'sent' as const };
            });
            syncToCache(next);
            return next;
          });
          chatCache.patchConversationEverywhere(conversation.id, {
            last_message: text,
            last_message_type: 'text',
            last_message_direction: 'outgoing',
            last_message_status: 'sent',
            last_message_at: new Date().toISOString(),
          });
          fetchLatestWindow('poll');
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.client_temp_id === tempId ? { ...m, status: 'failed' } : m
            )
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.client_temp_id === tempId ? { ...m, status: 'failed' } : m
          )
        );
      }
    },
    [conversation.id, conversation.session_id, fetchLatestWindow, syncToCache]
  );

  const handleSendText = useCallback(
    (text: string) => {
      const replyId = replyTarget?.message_id || null;
      const tempId = `temp_txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const nowIso = new Date().toISOString();

      const optimisticMsg: Message = {
        id: -Date.now(),
        client_temp_id: tempId,
        message_id: tempId,
        conversation_id: conversation.id,
        direction: 'outgoing',
        message_type: 'text',
        message: text,
        timestamp: nowIso,
        status: 'pending',
        reply_to_id: replyId,
        retry_payload: {
          kind: 'text',
          text,
          replyToId: replyId,
        },
      };

      setReplyTarget(null);
      setMessages((prev) => [...prev, optimisticMsg]);
      scrollToLatest(true);
      executeTextSend(tempId, text, replyId);
    },
    [replyTarget, conversation.id, scrollToLatest, executeTextSend]
  );

  const executeMediaUpload = useCallback(
    async (
      tempId: string,
      file: { uri: string; name?: string; mimeType?: string; size?: number },
      mediaType: 'image' | 'video' | 'audio' | 'voice' | 'document',
      caption: string,
      replyId: string | null,
      editSpec: MediaEditSpec | null
    ) => {
      try {
        const res = await chatService.sendMedia(
          conversation.id,
          file,
          mediaType,
          {
            caption: caption || undefined,
            sessionId: conversation.session_id,
            replyToId: replyId,
            editSpec,
            onUploadProgress: (pct) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.client_temp_id === tempId ? { ...m, upload_progress: pct } : m
                )
              );
            },
          }
        );

        if (res && res.success !== false) {
          const serverMsg: Message | undefined = res.message;
          setMessages((prev) => {
            const next = prev.map((m) => {
              if (m.client_temp_id !== tempId) return m;
              if (serverMsg) {
                return {
                  ...serverMsg,
                  local_uri: editSpec ? null : file.uri,
                  upload_progress: null,
                  client_temp_id: null,
                  status: serverMsg.status || 'sent',
                };
              }
              return {
                ...m,
                upload_progress: null,
                client_temp_id: null,
                status: 'sent' as const,
              };
            });
            syncToCache(next);
            return next;
          });
          chatCache.patchConversationEverywhere(conversation.id, {
            last_message:
              caption ||
              (mediaType === 'image'
                ? '📷 صورة'
                : mediaType === 'video'
                  ? '🎥 فيديو'
                  : mediaType === 'document'
                    ? '📄 مستند'
                    : '🎤 تسجيل صوتي'),
            last_message_type: mediaType,
            last_message_direction: 'outgoing',
            last_message_status: 'sent',
            last_message_at: new Date().toISOString(),
          });
          fetchLatestWindow('poll');
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.client_temp_id === tempId
                ? { ...m, status: 'failed', upload_progress: null }
                : m
            )
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.client_temp_id === tempId
              ? { ...m, status: 'failed', upload_progress: null }
              : m
          )
        );
      }
    },
    [conversation.id, conversation.session_id, fetchLatestWindow, syncToCache]
  );

  const enqueueOptimisticMedia = useCallback(
    (
      media: PendingMedia,
      caption: string,
      editSpec: MediaEditSpec | null,
      explicitDurationSec?: number
    ) => {
      const replyId = replyTarget?.message_id || null;
      const tempId = `temp_med_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const effectiveSecs =
        editSpec?.trimEnd && editSpec.trimEnd > (editSpec.trimStart || 0)
          ? Math.round(editSpec.trimEnd - (editSpec.trimStart || 0))
          : explicitDurationSec || media.durationSec;

      const optimisticMsg: Message = {
        id: -Date.now(),
        client_temp_id: tempId,
        message_id: tempId,
        conversation_id: conversation.id,
        direction: 'outgoing',
        message_type: media.type,
        message: caption || `[${media.type}]`,
        media_caption: caption || null,
        media_mime_type: media.mimeType || null,
        media_size: media.fileSize || null,
        media_meta: {
          fileName: media.name,
          seconds: effectiveSecs,
        },
        local_uri: media.uri,
        upload_progress: 1,
        edit_spec: editSpec,
        timestamp: new Date().toISOString(),
        status: 'pending',
        reply_to_id: replyId,
        retry_payload: {
          kind: 'media',
          replyToId: replyId,
          file: {
            uri: media.uri,
            name: media.name,
            mimeType: media.mimeType,
            size: media.fileSize,
          },
          mediaType: media.type,
          caption,
          editSpec,
        },
      };

      setReplyTarget(null);
      setPendingMedia(null);
      setMessages((prev) => [...prev, optimisticMsg]);
      scrollToLatest(true);

      executeMediaUpload(
        tempId,
        { uri: media.uri, name: media.name, mimeType: media.mimeType, size: media.fileSize },
        media.type,
        caption,
        replyId,
        editSpec
      );
    },
    [replyTarget, conversation.id, scrollToLatest, executeMediaUpload]
  );

  const handleRetryMessage = useCallback(
    (msg: Message) => {
      const tempId = msg.client_temp_id;
      const retry = msg.retry_payload;
      if (!tempId || !retry) return;

      if (retry.kind === 'text' && retry.text) {
        setMessages((prev) =>
          prev.map((m) => (m.client_temp_id === tempId ? { ...m, status: 'pending' } : m))
        );
        executeTextSend(tempId, retry.text, retry.replyToId || null);
      } else if (retry.kind === 'media' && retry.file && retry.mediaType) {
        setMessages((prev) =>
          prev.map((m) =>
            m.client_temp_id === tempId
              ? { ...m, status: 'pending', upload_progress: 1 }
              : m
          )
        );
        executeMediaUpload(
          tempId,
          retry.file,
          retry.mediaType,
          retry.caption || '',
          retry.replyToId || null,
          retry.editSpec || null
        );
      }
    },
    [executeTextSend, executeMediaUpload]
  );

  const handleDismissFailed = useCallback((msg: Message) => {
    if (!msg.client_temp_id) return;
    setMessages((prev) => prev.filter((m) => m.client_temp_id !== msg.client_temp_id));
  }, []);

  const pickMedia = useCallback(async (useCamera = false) => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('الصلاحية مطلوبة', 'يرجى السماح بالوصول للكاميرا لالتقاط الصور والفيديو');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.88,
        });
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('الصلاحية مطلوبة', 'يرجى السماح بالوصول لمعرض الصور والفيديو');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images', 'videos'],
          quality: 0.88,
        });
      }

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      const filename =
        asset.fileName ||
        asset.uri.split('/').pop() ||
        (isVideo ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`);
      const mime = asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg');
      const durSec = asset.duration
        ? asset.duration > 1000
          ? asset.duration / 1000
          : asset.duration
        : undefined;

      setPendingMedia({
        uri: asset.uri,
        name: filename,
        mimeType: mime,
        type: isVideo ? 'video' : 'image',
        width: asset.width,
        height: asset.height,
        durationSec: durSec,
        fileSize: asset.fileSize,
      });
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'تعذر اختيار الملف');
    }
  }, []);

  const pickDocument = useCallback(async () => {
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
        fileSize: asset.size,
      });
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'تعذر اختيار المستند');
    }
  }, []);

  const handleAttachSelect = useCallback(
    async (kind: AttachmentKind) => {
      setAttachVisible(false);
      if (kind === 'document') {
        await pickDocument();
      } else if (kind === 'camera') {
        await pickMedia(true);
      } else {
        await pickMedia(false);
      }
    },
    [pickDocument, pickMedia]
  );

  const handleSendVoice = useCallback(
    (uri: string, durationSec: number) => {
      enqueueOptimisticMedia(
        {
          uri,
          name: `voice_${Date.now()}.m4a`,
          mimeType: 'audio/m4a',
          type: 'voice',
          durationSec,
        },
        '',
        null,
        durationSec
      );
    },
    [enqueueOptimisticMedia]
  );

  const handleSwipeReply = useCallback((m: Message) => {
    setReplyTarget(m);
    composerRef.current?.focus();
  }, []);

  const handleActionReply = useCallback((m: Message) => {
    setReplyTarget(m);
    setTimeout(() => composerRef.current?.focus(), 80);
  }, []);

  const handleActionForward = useCallback((m: Message) => {
    setForwardTarget(m);
  }, []);

  const handleActionPin = useCallback((m: Message) => {
    setSelectedMsgForPin(m);
    setPinDurationVisible(true);
  }, []);

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

  const handleActionStar = useCallback(async (m: Message) => {
    const nextStar = m.starred_at ? null : new Date().toISOString();
    setMessages((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, starred_at: nextStar } : x))
    );
    try {
      await chatService.toggleStar(m.id);
    } catch {
      fetchLatestWindow('poll');
    }
  }, [fetchLatestWindow]);

  const handleActionDelete = useCallback(
    (m: Message) => {
      Alert.alert('حذف الرسالة', 'هل تريد حذف هذه الرسالة؟', [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف لدي فقط',
          style: 'destructive',
          onPress: async () => {
            setMessages((prev) => prev.filter((x) => x.id !== m.id));
            try {
              await chatService.deleteMessage(m.id, conversation.id, false);
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
                    fetchLatestWindow('poll');
                  } catch (err: any) {
                    Alert.alert('خطأ', err.response?.data?.message || 'تعذر الحذف لدى الجميع');
                  }
                },
              },
            ]
          : []),
      ]);
    },
    [conversation.id, fetchLatestWindow]
  );

  const handleActionReaction = useCallback(
    async (m: Message, emoji: string | null) => {
      try {
        await chatService.sendReaction(conversation.id, m.message_id || m.id, emoji);
        fetchLatestWindow('poll');
      } catch {}
    },
    [conversation.id, fetchLatestWindow]
  );

  const handleDoubleTapLike = useCallback(
    (m: Message) => {
      if (m.client_temp_id || isDeadConversation) return;
      const key = m.id || m.message_id;
      setMessages((prev) =>
        prev.map((msg) => {
          if ((msg.id || msg.message_id) !== key) return msg;
          const reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
          if (!reactions.some((r) => r.emoji === '👍')) {
            reactions.push({ emoji: '👍' });
          }
          return { ...msg, reactions };
        })
      );
      chatService
        .sendReaction(conversation.id, m.message_id || m.id, '👍')
        .then(() => fetchLatestWindow('poll'))
        .catch(() => {});
    },
    [conversation.id, fetchLatestWindow, isDeadConversation]
  );

  const handleUnpin = async () => {
    setPinnedMsg(null);
    try {
      await chatService.unpinMessage(conversation.id);
    } catch {}
  };

  const invertedMessages = useMemo(() => messages.slice().reverse(), [messages]);

  const jumpToMessageKey = useCallback(
    (idOrWamid: string | number) => {
      const idx = invertedMessages.findIndex(
        (m) =>
          m.id === idOrWamid ||
          String(m.message_id) === String(idOrWamid) ||
          String(m.id) === String(idOrWamid)
      );
      if (idx !== -1) {
        try {
          flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
          const target = invertedMessages[idx];
          const key = target.client_temp_id || target.id || target.message_id;
          setHighlightedMsgKey(key);
          setTimeout(() => setHighlightedMsgKey(null), 1600);
        } catch {}
      }
    },
    [invertedMessages]
  );

  const jumpToPinned = () => {
    if (!pinnedMsg) return;
    jumpToMessageKey(pinnedMsg.message_id || pinnedMsg.id);
  };

  const focusJumpDone = useRef(false);
  useEffect(() => {
    if (initialLoading || !focusMessageId || focusJumpDone.current) return;
    const target = invertedMessages.find(
      (m) =>
        m.id === focusMessageId ||
        String(m.message_id) === String(focusMessageId) ||
        String(m.id) === String(focusMessageId)
    );
    if (!target) return;
    focusJumpDone.current = true;
    scrolledUpRef.current = true;
    const t = setTimeout(() => {
      if (hasNewerTail) setShowScrollBottom(true);
      jumpToMessageKey(focusMessageId);
    }, 250);
    return () => clearTimeout(t);
  }, [initialLoading, focusMessageId, invertedMessages, hasNewerTail, jumpToMessageKey]);

  const contactTitle =
    conversation.contact_name ||
    (conversation.contact_username ? `@${conversation.contact_username}` : null) ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل');

  const galleryItems = useMemo(() => {
    const list: GalleryMediaItem[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (['image', 'video', 'sticker'].includes(m.message_type)) {
        const uri = mediaSrc(m, token);
        if (uri) {
          list.push({
            id: m.id || m.message_id || `idx_${i}`,
            uri,
            downloadUri:
              m.id > 0 && token ? Config.getMediaUrl(m.id, token, true) : uri,
            kind: m.message_type === 'video' ? 'video' : 'image',
            caption: m.media_caption || (!isPlaceholderText(m) ? m.message : null),
            senderName:
              m.direction === 'outgoing' ? 'أنت' : m.sender_name || contactTitle,
            timestamp: m.timestamp,
          });
        }
      }
    }
    return list;
  }, [messages, token, contactTitle]);

  const handleViewMedia = useCallback(
    (m: Message) => {
      const mUri = mediaSrc(m, token);
      if (!mUri) return;
      const idx = galleryItems.findIndex((it) => it.id === m.id || it.uri === mUri);
      setViewerState({
        items: galleryItems.length
          ? galleryItems
          : [
              {
                id: m.id,
                uri: mUri,
                downloadUri: m.id > 0 && token ? Config.getMediaUrl(m.id, token, true) : mUri,
                kind: m.message_type === 'video' ? 'video' : 'image',
                caption: m.media_caption || m.message,
                senderName: m.direction === 'outgoing' ? 'أنت' : m.sender_name || contactTitle,
                timestamp: m.timestamp,
              },
            ],
        index: idx >= 0 ? idx : 0,
      });
    },
    [galleryItems, token, contactTitle]
  );

  const messagesByWamid = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) {
      if (m.message_id) map.set(String(m.message_id), m);
    }
    return map;
  }, [messages]);

  const handleOpenActions = useCallback((m: Message) => {
    setActionsFor(m);
  }, []);

  const renderMessageItem = useCallback(
    ({ item, index }: { item: Message; index: number }) => {
      const olderMsg = index + 1 < invertedMessages.length ? invertedMessages[index + 1] : null;
      const isFirstOfDay =
        index === invertedMessages.length - 1 ||
        dayKey(item.timestamp) !== dayKey(olderMsg?.timestamp);
      const isUnreadAnchor =
        Boolean(initialUnreadAnchorIdRef.current) &&
        (item.id === initialUnreadAnchorIdRef.current ||
          item.message_id === initialUnreadAnchorIdRef.current);

      const rowKey = item.client_temp_id || item.id || item.message_id;

      return (
        <View>
          {isFirstOfDay && (
            <View style={styles.daySeparatorWrap}>
              <View style={styles.dayPill}>
                <Text style={styles.dayPillText}>{dayLabel(item.timestamp)}</Text>
              </View>
            </View>
          )}

          {isUnreadAnchor && (
            <View style={styles.unreadSeparatorWrap}>
              <View style={styles.unreadSeparatorLine} />
              <View style={styles.unreadPill}>
                <Text style={styles.unreadPillText}>رسائل غير مقروءة</Text>
              </View>
              <View style={styles.unreadSeparatorLine} />
            </View>
          )}

          <SwipeableMessageRow
            message={item}
            onSwipeReply={handleSwipeReply}
            highlighted={highlightedMsgKey !== null && highlightedMsgKey === rowKey}
          >
            <MessageBubble
              message={item}
              isGroup={isGroup}
              conversation={conversation}
              contactTitle={contactTitle}
              quoted={
                item.reply_to_id
                  ? messagesByWamid.get(String(item.reply_to_id)) || null
                  : null
              }
              onActions={handleOpenActions}
              onViewMedia={handleViewMedia}
              onPressQuoted={jumpToMessageKey}
              onRetry={handleRetryMessage}
              onDismissFailed={handleDismissFailed}
              onDoubleTapLike={handleDoubleTapLike}
            />
          </SwipeableMessageRow>
        </View>
      );
    },
    [
      invertedMessages,
      handleSwipeReply,
      highlightedMsgKey,
      isGroup,
      conversation,
      contactTitle,
      messagesByWamid,
      handleOpenActions,
      handleViewMedia,
      jumpToMessageKey,
      handleRetryMessage,
      handleDismissFailed,
      handleDoubleTapLike,
    ]
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerContactTouch}
            onPress={() => setContactInfoVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.avatarWrap}>
              <ChatAvatar conversation={conversation} title={contactTitle} size={40} badge />
            </View>

            <View style={styles.contactDetails}>
              <Text style={styles.contactName} numberOfLines={1}>
                {contactTitle}
              </Text>
              <Text style={styles.contactSub} numberOfLines={1}>
                {conversation.contact_phone ? `+${conversation.contact_phone}` : ''}
                {conversation.session?.device_name
                  ? ` • ${conversation.session.device_name}`
                  : ''}
                {conversation.assigned_agent
                  ? ` • مع ${
                      conversation.assigned_agent.id === user?.id
                        ? 'أنا'
                        : conversation.assigned_agent.name
                    }`
                  : ''}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setTransferVisible(true)}
            style={styles.actionIconBtn}
            hitSlop={8}
          >
            <MaterialCommunityIcons
              name="account-arrow-left-outline"
              size={22}
              color="#FFFFFF"
            />
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
            <View style={styles.pinnedTextWrap}>
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

      {conversation.transferred_by ? (
        <View style={styles.transferBanner}>
          <Ionicons name="information-circle" size={15} color="#008069" />
          <Text style={styles.transferBannerText}>تم تحويل هذه المحادثة إليك</Text>
        </View>
      ) : null}

      <View style={styles.chatBackground}>
        <ChatWallpaper customUri={customWallpaperUri} />

        <KeyboardSafeView
          style={styles.keyboardArea}
          onKeyboardVisibleChange={setIsKeyboardVisible}
        >
          {initialLoading && invertedMessages.length === 0 ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator color={Colors.primary} size="large" />
              <Text style={styles.loadingText}>جاري تحميل الرسائل...</Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={invertedMessages}
              inverted
              keyExtractor={(item) => String(item.client_temp_id || item.id || item.message_id)}
              contentContainerStyle={styles.messagesList}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
              removeClippedSubviews={false}
              maxToRenderPerBatch={12}
              windowSize={9}
              initialNumToRender={14}
              onEndReached={handleLoadOlder}
              onEndReachedThreshold={0.35}
              onScrollToIndexFailed={(info) => {
                flatListRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: true,
                });
              }}
              ListFooterComponent={
                loadingOlder ? (
                  <View style={styles.olderLoaderWrap}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                ) : undefined
              }
              onScroll={(e) => {
                const y = e.nativeEvent.contentOffset.y;
                const up = y > 220;
                if (up !== scrolledUpRef.current) {
                  scrolledUpRef.current = up;
                  setShowScrollBottom(up);
                  if (!up) setNewBelowCount(0);
                }
              }}
              scrollEventThrottle={64}
              renderItem={renderMessageItem}
            />
          )}

          {showScrollBottom && (
            <TouchableOpacity
              style={styles.scrollBottomBtn}
              onPress={() => scrollToLatest(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-down" size={22} color="#54656F" />
              {newBelowCount > 0 && (
                <View style={styles.scrollBottomBadge}>
                  <Text style={styles.scrollBottomBadgeText}>
                    {newBelowCount > 99 ? '99+' : newBelowCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {replyTarget && (
            <View style={styles.replyPreviewBar}>
              <View style={styles.replyPreviewContent}>
                <Text style={styles.replySenderName} numberOfLines={1}>
                  {replyTarget.direction === 'outgoing'
                    ? 'أنت'
                    : replyTarget.sender_name || contactTitle}
                </Text>
                <Text style={styles.replyMessageText} numberOfLines={1}>
                  {msgLabel(replyTarget)}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplyTarget(null)}
                style={styles.closeReplyBtn}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={20} color="#8696A0" />
              </TouchableOpacity>
            </View>
          )}

          <ChatInputBar
            ref={composerRef}
            bottomInset={insets.bottom}
            isKeyboardVisible={isKeyboardVisible}
            onSendText={handleSendText}
            onSendVoice={handleSendVoice}
            onOpenAttach={() => setAttachVisible(true)}
            onOpenCameraQuick={() => pickMedia(true)}
            onOpenQuickReplies={() => setQuickRepliesVisible(true)}
          />
        </KeyboardSafeView>
      </View>

      <QuickReplyModal
        visible={quickRepliesVisible}
        onClose={() => setQuickRepliesVisible(false)}
        onSelectReply={(txt) => composerRef.current?.appendText(txt)}
      />

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

      <ResolveModal
        visible={resolveVisible}
        conversationId={conversation.id}
        onClose={() => setResolveVisible(false)}
        onResolved={() => {
          Alert.alert('نجاح', 'تم إنهاء المحادثة (مكتمل) بنجاح');
          if (isAgent) {
            onBack();
          } else {
            fetchLatestWindow('poll');
          }
        }}
      />

      <PinDurationModal
        visible={pinDurationVisible}
        onClose={() => setPinDurationVisible(false)}
        onSelectDuration={handleSelectPinDuration}
      />

      <AttachmentSheet
        visible={attachVisible}
        onClose={() => setAttachVisible(false)}
        onSelect={handleAttachSelect}
      />

      <MediaComposerModal
        media={pendingMedia}
        recipientName={contactTitle}
        onClose={() => setPendingMedia(null)}
        onSend={(caption, editSpec) => {
          if (pendingMedia) {
            enqueueOptimisticMedia(pendingMedia, caption, editSpec);
          }
        }}
      />

      <MediaViewerModal
        visible={!!viewerState}
        items={viewerState?.items || []}
        initialIndex={viewerState?.index || 0}
        onClose={() => setViewerState(null)}
      />

      <ContactInfoModal
        visible={contactInfoVisible}
        conversation={conversation}
        onClose={() => setContactInfoVisible(false)}
        onViewMedia={handleViewMedia}
        onWallpaperChanged={loadWallpaper}
        onContactRenamed={(newName) => {
          setConversation((prev) => ({ ...prev, contact_name: newName }));
          chatCache.patchConversationEverywhere(conversation.id, { contact_name: newName });
        }}
      />

      <MessageActionsSheet
        message={actionsFor}
        onClose={() => setActionsFor(null)}
        onReact={(emoji) => actionsFor && handleActionReaction(actionsFor, emoji)}
        onReply={handleActionReply}
        onForward={handleActionForward}
        onPin={handleActionPin}
        onStar={handleActionStar}
        onDelete={handleActionDelete}
      />

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
    backgroundColor: Colors.headerBg,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.headerBg,
    paddingHorizontal: 10,
    paddingBottom: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.16,
    shadowRadius: 2.5,
    zIndex: 10,
  },
  headerRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
  },
  headerContactTouch: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
    gap: 9,
  },
  backBtn: {
    padding: 6,
    marginLeft: 2,
  },
  avatarWrap: {
    position: 'relative',
  },
  contactDetails: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
    width: '100%',
  },
  contactSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.82)',
    marginTop: 1.5,
    textAlign: 'right',
    width: '100%',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginRight: 4,
  },
  actionIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 4,
    borderRightColor: '#00A884',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    zIndex: 9,
  },
  pinnedContent: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  pinnedTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  pinnedTitle: {
    fontSize: 11,
    fontWeight: '800',
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
    padding: 4,
  },
  transferBanner: {
    flexDirection: 'row-reverse',
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
    backgroundColor: '#ECE5DD',
    position: 'relative',
  },
  keyboardArea: {
    flex: 1,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#667781',
  },
  messagesList: {
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  olderLoaderWrap: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  daySeparatorWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  dayPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 4.5,
    borderRadius: 9,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 1.5,
    elevation: 1,
  },
  dayPillText: {
    color: '#54656F',
    fontSize: 11.5,
    fontWeight: '700',
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
    backgroundColor: '#CBD5E1',
  },
  unreadPill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    marginHorizontal: 8,
    elevation: 1,
  },
  unreadPillText: {
    color: '#00A884',
    fontSize: 11,
    fontWeight: '800',
  },
  scrollBottomBtn: {
    position: 'absolute',
    left: 14,
    bottom: 66,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    zIndex: 15,
  },
  scrollBottomBadge: {
    position: 'absolute',
    top: -6,
    right: -4,
    backgroundColor: '#25D366',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBottomBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  replyPreviewBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRightWidth: 4,
    borderRightColor: '#00A884',
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginHorizontal: 10,
    marginBottom: 2,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  replyPreviewContent: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  replySenderName: {
    fontSize: 11.5,
    fontWeight: '800',
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
    padding: 2,
  },
});
