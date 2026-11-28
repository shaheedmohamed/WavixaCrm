import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Linking,
  Share,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Conversation, Message, GroupMembersResponse, GroupMember } from '../types/crm';
import { Config } from '../constants/config';
import { ChatAvatar } from './ChatAvatar';
import { ZoomableImage } from './ZoomableImage';
import { KeyboardSafeView } from './KeyboardSafeView';
import { chatService } from '../services/chatService';
import { useAuth } from '../context/AuthContext';
import { avatarSrc, mediaSrc } from '../services/media';
import { Colors } from '../constants/theme';

interface ContactInfoModalProps {
  visible: boolean;
  conversation: Conversation;
  onClose: () => void;
  onViewMedia: (message: Message) => void;
  onWallpaperChanged?: () => void;
  onContactRenamed?: (newName: string) => void;
}

export const ContactInfoModal: React.FC<ContactInfoModalProps> = ({
  visible,
  conversation,
  onClose,
  onViewMedia,
  onWallpaperChanged,
  onContactRenamed,
}) => {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [mediaItems, setMediaItems] = useState<Message[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mediaTab, setMediaTab] = useState<'media' | 'links'>('media');
  const [linkItems, setLinkItems] = useState<Message[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const linksLoadedRef = React.useRef(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameText, setEditNameText] = useState(
    conversation.contact_name || conversation.contact_phone || ''
  );
  const [savingName, setSavingName] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [groupInfo, setGroupInfo] = useState<GroupMembersResponse | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const isGroup = Boolean(conversation.contact_jid?.includes('@g.us'));

  const fullAvatarUri = avatarSrc(conversation, token, false);
  const downloadAvatarUri = avatarSrc(conversation, token, true);

  const loadMedia = React.useCallback(async () => {
    setLoadingMedia(true);
    try {
      const res = await chatService.getConversationMedia(conversation.id, 60);
      if (res && res.success && res.media) {
        setMediaItems(res.media);
      }
    } catch {
    } finally {
      setLoadingMedia(false);
    }
  }, [conversation.id]);

  const loadLinks = React.useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await chatService.getConversationMedia(conversation.id, 120, 'links');
      if (res && res.success && res.media) {
        setLinkItems(res.media);
      }
    } catch {
    } finally {
      setLoadingLinks(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    if (!visible) return;
    Promise.resolve().then(() => {
      linksLoadedRef.current = false;
      setMediaTab('media');
      setEditNameText(conversation.contact_name || conversation.contact_phone || '');
      setIsEditingName(false);
      setAvatarViewerOpen(false);
      loadMedia();
      if (isGroup) {
        setLoadingMembers(true);
        setGroupInfo(null);
        chatService
          .getGroupMembers(conversation.id)
          .then((res) => {
            if (res && res.success) setGroupInfo(res);
          })
          .catch(() => {})
          .finally(() => setLoadingMembers(false));
      }
    });
  }, [visible, conversation.id, conversation.contact_name, conversation.contact_phone, loadMedia, isGroup]);

  const handleSaveName = async () => {
    const trimmed = editNameText.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      const res = await chatService.renameConversation(conversation.id, trimmed);
      if (res && res.success) {
        setIsEditingName(false);
        onContactRenamed?.(trimmed);
      } else {
        Alert.alert('خطأ', res?.message || 'تعذر تعديل الاسم');
      }
    } catch (err: any) {
      Alert.alert('خطأ', err.response?.data?.message || 'تعذر تعديل الاسم');
    } finally {
      setSavingName(false);
    }
  };

  const handlePickWallpaper = async (forAllChats: boolean) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      if (forAllChats) {
        await AsyncStorage.setItem('default_chat_wallpaper', uri);
        Alert.alert('تم التغيير', 'تم تعيين خلفية جديدة لجميع المحادثات بنجاح');
      } else {
        await AsyncStorage.setItem(`chat_wallpaper_${conversation.id}`, uri);
        Alert.alert('تم التغيير', 'تم تعيين خلفية جديدة لهذه المحادثة بنجاح');
      }
      onWallpaperChanged?.();
    }
  };

  const handleResetWallpaper = async () => {
    await AsyncStorage.removeItem(`chat_wallpaper_${conversation.id}`);
    await AsyncStorage.removeItem('default_chat_wallpaper');
    Alert.alert('تمت الاستعادة', 'تمت استعادة الخلفية الافتراضية المزخرفة بنجاح');
    onWallpaperChanged?.();
  };

  const handleOpenAvatar = () => {
    if (!fullAvatarUri) {
      Alert.alert('الصورة الشخصية', 'لا توجد صورة شخصية متاحة لجهة الاتصال هذه حالياً');
      return;
    }
    setAvatarViewerOpen(true);
  };

  const handleDownloadAvatar = async () => {
    const target = downloadAvatarUri || fullAvatarUri;
    if (!target) return;
    try {
      await Linking.openURL(target);
    } catch {
      Alert.alert('تنبيه', 'تعذر بدء تحميل الصورة');
    }
  };

  const handleShareAvatar = async () => {
    if (!fullAvatarUri) return;
    try {
      await Share.share({
        message: displayName,
        url: fullAvatarUri,
      });
    } catch {}
  };

  const displayName = conversation.contact_name || conversation.contact_phone || 'جهة الاتصال';
  const displayPhone = conversation.contact_phone ? `+${conversation.contact_phone}` : '';
  const sessionLabel = conversation.session?.device_name || `جهاز #${conversation.session_id}`;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardSafeView style={styles.container}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 14) }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="arrow-forward" size={24} color="#E9EDEF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>معلومات جهة الاتصال</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.avatarSection}>
            <TouchableOpacity
              style={styles.avatarTouchWrap}
              onPress={handleOpenAvatar}
              activeOpacity={0.85}
            >
              <View style={styles.avatarWrap}>
                <ChatAvatar
                  conversation={conversation}
                  title={displayName}
                  size={116}
                />
              </View>
              {fullAvatarUri ? (
                <View style={styles.zoomHintBadge}>
                  <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
                </View>
              ) : null}
            </TouchableOpacity>

            {fullAvatarUri ? (
              <Text style={styles.tapToZoomHint}>اضغط على الصورة لتكبيرها أو حفظها</Text>
            ) : null}

            {isEditingName ? (
              <View style={styles.nameEditRow}>
                <TextInput
                  style={styles.nameInput}
                  value={editNameText}
                  onChangeText={setEditNameText}
                  autoFocus
                  placeholder="اسم جهة الاتصال"
                  placeholderTextColor="#8696A0"
                />
                <TouchableOpacity
                  onPress={handleSaveName}
                  style={styles.saveNameBtn}
                  disabled={savingName}
                >
                  {savingName ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsEditingName(false)}
                  style={styles.cancelNameBtn}
                >
                  <Ionicons name="close" size={20} color="#8696A0" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.nameRow}
                onPress={() => setIsEditingName(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.contactName}>{displayName}</Text>
                <MaterialCommunityIcons name="pencil-outline" size={18} color="#8696A0" />
              </TouchableOpacity>
            )}

            {displayPhone ? (
              <Text style={styles.contactPhone}>{displayPhone}</Text>
            ) : null}

            <View style={styles.sessionBadge}>
              <Text style={styles.sessionText}>عبر: {sessionLabel}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>خلفية المحادثة</Text>
            <View style={styles.wallpaperActionsRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handlePickWallpaper(false)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="image-plus" size={18} color="#00A884" />
                <Text style={styles.actionBtnText}>لهذا الشات</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handlePickWallpaper(true)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="image-multiple" size={18} color="#00A884" />
                <Text style={styles.actionBtnText}>لكل الشاتات</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDanger]}
                onPress={handleResetWallpaper}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="restore" size={18} color="#EF4444" />
                <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>الافتراضية</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.mediaHeaderRow}>
              <Text style={styles.sectionTitle}>الوسائط والمستندات المشتركة</Text>
              <Text style={styles.mediaCountBadge}>
                {mediaTab === 'media' ? mediaItems.length : linkItems.length}
              </Text>
            </View>

            <View style={styles.mediaTabRow}>
              {(['media', 'links'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.mediaTabBtn, mediaTab === t && styles.mediaTabBtnActive]}
                  onPress={() => {
                    setMediaTab(t);
                    if (t === 'links' && !linksLoadedRef.current) {
                      linksLoadedRef.current = true;
                      loadLinks();
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.mediaTabText, mediaTab === t && styles.mediaTabTextActive]}>
                    {t === 'media' ? 'وسائط' : 'لينكات'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {mediaTab === 'links' ? (
              loadingLinks ? (
                <View style={styles.mediaLoadingWrap}>
                  <ActivityIndicator size="small" color="#00A884" />
                  <Text style={styles.mediaLoadingText}>جاري تحميل اللينكات...</Text>
                </View>
              ) : linkItems.length === 0 ? (
                <Text style={styles.noMediaText}>لا توجد لينكات مشاركة في هذه المحادثة</Text>
              ) : (
                <View>
                  {linkItems.map((m, idx) => {
                    const url = (m.message || '').match(/https?:\/\/\S+/)?.[0] || '';
                    return (
                      <TouchableOpacity
                        key={`link-${m.id}-${idx}`}
                        style={styles.linkRow}
                        onPress={() => url && Linking.openURL(url).catch(() => {})}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="link-outline" size={18} color="#0EA5E9" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.linkUrl} numberOfLines={1}>{url}</Text>
                          <Text style={styles.linkBody} numberOfLines={1}>{m.message}</Text>
                        </View>
                        <Ionicons name="open-outline" size={14} color="#8696A0" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )
            ) : loadingMedia ? (
              <View style={styles.mediaLoadingWrap}>
                <ActivityIndicator size="small" color="#00A884" />
                <Text style={styles.mediaLoadingText}>جاري تحميل الوسائط...</Text>
              </View>
            ) : mediaItems.length === 0 ? (
              <Text style={styles.noMediaText}>لا توجد وسائط مشاركة في هذه المحادثة</Text>
            ) : (
              <View style={styles.mediaGrid}>
                {mediaItems.map((m, idx) => {
                  const mUri = mediaSrc(m, token);
                  const isImg = m.message_type === 'image' || m.message_type === 'sticker';
                  const isVid = m.message_type === 'video';
                  const isAud = m.message_type === 'audio' || m.message_type === 'voice';

                  return (
                    <TouchableOpacity
                      key={`${m.id}-${idx}`}
                      style={styles.mediaCell}
                      onPress={() => onViewMedia(m)}
                      activeOpacity={0.8}
                    >
                      {isImg && mUri ? (
                        <Image source={{ uri: mUri }} style={styles.cellImage} resizeMode="cover" />
                      ) : isVid ? (
                        <View style={[styles.cellPlaceholder, { backgroundColor: '#202C33' }]}>
                          <Ionicons name="videocam" size={24} color="#00A884" />
                          <Text style={styles.cellDocLabel}>فيديو</Text>
                        </View>
                      ) : isAud ? (
                        <View style={[styles.cellPlaceholder, { backgroundColor: '#202C33' }]}>
                          <Ionicons name="musical-notes" size={24} color="#A78BFA" />
                          <Text style={styles.cellAudioLabel}>صوت</Text>
                        </View>
                      ) : (
                        <View style={[styles.cellPlaceholder, { backgroundColor: '#202C33' }]}>
                          <FontAwesome5 name="file-alt" size={22} color="#00A884" />
                          <Text style={styles.cellDocLabel} numberOfLines={1}>
                            {m.media_mime_type?.split('/')[1]?.toUpperCase() || 'ملف'}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {isGroup ? (
            <View style={styles.sectionCard}>
              <View style={styles.mediaHeaderRow}>
                <Text style={styles.sectionTitle}>أعضاء الجروب</Text>
                <Text style={styles.mediaCountBadge}>
                  {groupInfo?.members?.length ?? (loadingMembers ? '…' : 0)}
                </Text>
              </View>

              {loadingMembers ? (
                <View style={styles.mediaLoadingWrap}>
                  <ActivityIndicator size="small" color="#00A884" />
                  <Text style={styles.mediaLoadingText}>جاري تحميل الأعضاء...</Text>
                </View>
              ) : !groupInfo || groupInfo.members.length === 0 ? (
                <Text style={styles.noMediaText}>تعذر تحميل قائمة الأعضاء</Text>
              ) : (
                <View>
                  {groupInfo.members.map((m, idx) => (
                    <MemberRow
                      key={m.jid || idx}
                      member={m}
                      sessionId={conversation.session_id}
                      token={token}
                      isLast={idx === groupInfo.members.length - 1}
                    />
                  ))}
                  {groupInfo.past?.length ? (
                    <Text style={styles.pastMembersLine}>
                      {groupInfo.past.length} غادر أو أُزيل من الجروب
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          ) : null}
        </ScrollView>

        <Modal
          visible={avatarViewerOpen}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setAvatarViewerOpen(false)}
        >
          <View style={styles.viewerRoot}>
            <View style={[styles.viewerHeader, { paddingTop: Math.max(insets.top + 8, 20) }]}>
              <View style={styles.viewerRightGroup}>
                <TouchableOpacity
                  onPress={() => setAvatarViewerOpen(false)}
                  style={styles.viewerIconBtn}
                  hitSlop={10}
                >
                  <Ionicons name="arrow-forward" size={23} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.viewerTitleWrap}>
                  <Text style={styles.viewerTitle} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {displayPhone ? (
                    <Text style={styles.viewerSub}>{displayPhone}</Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.viewerLeftActions}>
                <TouchableOpacity
                  onPress={handleDownloadAvatar}
                  style={styles.downloadPillBtn}
                  activeOpacity={0.8}
                >
                  <Ionicons name="download-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.downloadPillText}>حفظ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleShareAvatar}
                  style={styles.viewerIconBtn}
                  hitSlop={8}
                >
                  <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.viewerStage}>
              {fullAvatarUri ? <ZoomableImage uri={fullAvatarUri} showControls /> : null}
            </View>
          </View>
        </Modal>
      </KeyboardSafeView>
    </Modal>
  );
};

const MEMBER_COLORS = ['#00A884', '#1F70C1', '#D63384', '#D97706', '#7C3AED', '#0D9488', '#EA580C'];

const MemberRow: React.FC<{
  member: GroupMember;
  sessionId: number | string | undefined;
  token?: string | null;
  isLast?: boolean;
}> = ({ member, sessionId, token, isLast }) => {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarUri =
    member.jid && sessionId && token
      ? Config.getSenderAvatarUrl(sessionId, member.jid, token)
      : null;
  const label = member.name || (member.phone ? `+${member.phone}` : 'عضو');
  const color =
    MEMBER_COLORS[
      Math.abs((member.jid || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0)) %
        MEMBER_COLORS.length
    ];
  return (
    <View style={[styles.memberRow, !isLast && styles.memberRowBorder]}>
      <View style={[styles.memberAvatar, { backgroundColor: color }]}>
        <Text style={styles.memberAvatarText}>{(label || 'ع').slice(0, 1).toUpperCase()}</Text>
        {avatarUri && !avatarFailed ? (
          <Image
            source={{ uri: avatarUri }}
            style={StyleSheet.absoluteFill}
            onError={() => setAvatarFailed(true)}
          />
        ) : null}
      </View>
      <View style={styles.memberTextWrap}>
        <Text style={styles.memberName} numberOfLines={1}>
          {label}
        </Text>
        {member.name && member.phone ? (
          <Text style={styles.memberPhone} numberOfLines={1}>
            +{member.phone}
          </Text>
        ) : null}
      </View>
      {member.superadmin || member.admin ? (
        <View style={styles.adminBadge}>
          <Text style={styles.adminBadgeText}>مسؤول</Text>
        </View>
      ) : null}
    </View>
  );
};

const { width } = Dimensions.get('window');
const cellWidth = (width - 32 - 16) / 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111B21',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#202C33',
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#E9EDEF',
    fontSize: 16,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 22,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#202C33',
  },
  avatarTouchWrap: {
    position: 'relative',
    marginBottom: 8,
  },
  avatarWrap: {
    borderRadius: 62,
    borderWidth: 3,
    borderColor: '#00A884',
    overflow: 'hidden',
  },
  zoomHintBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    borderWidth: 2,
    borderColor: '#111B21',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapToZoomHint: {
    color: '#8696A0',
    fontSize: 11,
    marginBottom: 10,
  },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  contactName: {
    color: '#E9EDEF',
    fontSize: 20,
    fontWeight: '700',
  },
  nameEditRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 6,
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#202C33',
    color: '#E9EDEF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 15.5,
    textAlign: 'right',
  },
  saveNameBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelNameBtn: {
    padding: 6,
  },
  contactPhone: {
    color: '#8696A0',
    fontSize: 14,
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  sessionBadge: {
    backgroundColor: '#202C33',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A3942',
  },
  sessionText: {
    color: '#00A884',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionCard: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#111B21',
  },
  sectionTitle: {
    color: '#8696A0',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'right',
  },
  wallpaperActionsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202C33',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  actionBtnText: {
    color: '#E9EDEF',
    fontSize: 11.5,
    fontWeight: '600',
  },
  mediaHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mediaCountBadge: {
    color: '#8696A0',
    fontSize: 13,
    fontWeight: '700',
  },
  mediaTabRow: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  mediaTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  mediaTabBtnActive: {
    backgroundColor: '#D1FAE5',
  },
  mediaTabText: {
    fontSize: 12.5,
    color: '#54656F',
    fontWeight: '600',
  },
  mediaTabTextActive: {
    color: '#008069',
  },
  linkRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  linkUrl: {
    fontSize: 12.5,
    color: '#0EA5E9',
    textAlign: 'right',
  },
  linkBody: {
    fontSize: 11.5,
    color: '#8696A0',
    textAlign: 'right',
    marginTop: 2,
  },
  mediaLoadingWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  memberRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  memberRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#202C33',
  },
  memberAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  memberAvatarText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  memberTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  memberName: {
    color: '#E9EDEF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  memberPhone: {
    color: '#8696A0',
    fontSize: 12,
    marginTop: 1,
    textAlign: 'right',
  },
  adminBadge: {
    backgroundColor: 'rgba(0,168,132,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  adminBadgeText: {
    color: '#00A884',
    fontSize: 10,
    fontWeight: '700',
  },
  pastMembersLine: {
    color: '#8696A0',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 8,
  },
  mediaLoadingText: {
    color: '#8696A0',
    fontSize: 12,
  },
  noMediaText: {
    color: '#8696A0',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 16,
  },
  mediaGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  mediaCell: {
    width: cellWidth,
    height: cellWidth,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#202C33',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellAudioLabel: {
    color: '#8696A0',
    fontSize: 10,
    marginTop: 4,
  },
  cellDocLabel: {
    color: '#00A884',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: '#000000',
  },
  viewerHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    backgroundColor: 'rgba(11, 20, 26, 0.85)',
    zIndex: 20,
  },
  viewerRightGroup: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  viewerTitleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  viewerTitle: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  viewerSub: {
    color: '#94A3B8',
    fontSize: 11.5,
    marginTop: 1,
  },
  viewerLeftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadPillBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.primary,
    paddingHorizontal: 13,
    height: 36,
    borderRadius: 18,
  },
  downloadPillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  viewerStage: {
    flex: 1,
  },
});
