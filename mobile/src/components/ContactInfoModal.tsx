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
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Conversation, Message } from '../types/crm';
import { ChatAvatar } from './ChatAvatar';
import { chatService } from '../services/chatService';
import { useAuth } from '../context/AuthContext';
import { mediaSrc } from '../services/media';

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
  const [mediaItems, setMediaItems] = useState<Message[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameText, setEditNameText] = useState(
    conversation.contact_name || conversation.contact_phone || ''
  );
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (visible) {
      loadMedia();
      setEditNameText(conversation.contact_name || conversation.contact_phone || '');
      setIsEditingName(false);
    }
  }, [visible, conversation.id]);

  const loadMedia = async () => {
    setLoadingMedia(true);
    try {
      const res = await chatService.getConversationMedia(conversation.id, 60);
      if (res && res.success && res.media) {
        setMediaItems(res.media);
      }
    } catch {
      // silently handle
    } finally {
      setLoadingMedia(false);
    }
  };

  const handleSaveName = async () => {
    const trimmed = editNameText.trim();
    if (!trimmed) return;
    setSavingName(true);
    try {
      const res = await chatService.renameConversation(conversation.id, trimmed);
      if (res && res.success) {
        setIsEditingName(false);
        if (onContactRenamed) onContactRenamed(trimmed);
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
      if (onWallpaperChanged) onWallpaperChanged();
    }
  };

  const handleResetWallpaper = async (forAllChats: boolean) => {
    if (forAllChats) {
      await AsyncStorage.removeItem('default_chat_wallpaper');
      Alert.alert('تم الحذف', 'تمت استعادة الخلفية الافتراضية لجميع المحادثات');
    } else {
      await AsyncStorage.removeItem(`chat_wallpaper_${conversation.id}`);
      Alert.alert('تم الحذف', 'تمت استعادة الخلفية الافتراضية لهذه المحادثة');
    }
    if (onWallpaperChanged) onWallpaperChanged();
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
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={24} color="#E9EDEF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>معلومات جهة الاتصال</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Avatar Section */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrap}>
              <ChatAvatar
                conversation={conversation}
                title={displayName}
                size={110}
              />
            </View>

            {/* Name & Edit */}
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

            {/* Phone */}
            {displayPhone ? (
              <Text style={styles.contactPhone}>{displayPhone}</Text>
            ) : null}

            {/* Via Session Badge */}
            <View style={styles.sessionBadge}>
              <Text style={styles.sessionText}>عبر: {sessionLabel}</Text>
            </View>
          </View>

          {/* Wallpaper Options Section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>خلفية الشات</Text>
            <View style={styles.wallpaperActionsRow}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handlePickWallpaper(false)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="image-plus" size={18} color="#00A884" />
                <Text style={styles.actionBtnText}>خلفية هذا الشات</Text>
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
                onPress={() => handleResetWallpaper(false)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="restore" size={18} color="#EF4444" />
                <Text style={[styles.actionBtnText, { color: '#EF4444' }]}>الافتراضية</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Media & Documents Grid Section */}
          <View style={styles.sectionCard}>
            <View style={styles.mediaHeaderRow}>
              <Text style={styles.sectionTitle}>الوسائط والمستندات</Text>
              <Text style={styles.mediaCountBadge}>{mediaItems.length}</Text>
            </View>

            {loadingMedia ? (
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
                      ) : isVid && mUri ? (
                        <View style={styles.cellPlaceholder}>
                          <Image source={{ uri: mUri }} style={styles.cellImage} resizeMode="cover" />
                          <View style={styles.playIconOverlay}>
                            <Ionicons name="play" size={16} color="#FFFFFF" />
                          </View>
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
        </ScrollView>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');
const cellWidth = (width - 48 - 16) / 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111B21',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    paddingVertical: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#202C33',
  },
  avatarWrap: {
    marginBottom: 16,
    borderRadius: 58,
    borderWidth: 3,
    borderColor: '#00A884',
    overflow: 'hidden',
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
    paddingVertical: 6,
    fontSize: 16,
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
  mediaLoadingWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
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
    flexDirection: 'row',
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
    position: 'relative',
  },
  playIconOverlay: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
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
});
