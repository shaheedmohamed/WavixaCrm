import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeView } from './KeyboardSafeView';
import { ChatList, Conversation } from '../types/crm';
import { FAVORITES_LIST_NAME } from '../services/chatPrefs';
import { Colors } from '../constants/theme';

interface AddToListModalProps {
  visible: boolean;
  conversations: Conversation[];
  chatLists: ChatList[];
  currentUserId?: number;
  isAgent?: boolean;
  isFavoriteCheck: (convId: number) => boolean;
  initialCreateOnly?: boolean;
  onClose: () => void;
  onToggleListMember: (list: ChatList, convIds: number[], shouldBeMember: boolean) => Promise<void>;
  onCreateList: (name: string, convIds: number[]) => Promise<void>;
  onDeleteList: (list: ChatList) => Promise<void>;
  onToggleFavorite: (conv: Conversation) => void;
  onClaimToMine?: (conv: Conversation) => Promise<void>;
  onToggleArchive?: (conv: Conversation) => void;
}

export const AddToListModal: React.FC<AddToListModalProps> = ({
  visible,
  conversations,
  chatLists,
  currentUserId,
  isAgent = false,
  isFavoriteCheck,
  initialCreateOnly = false,
  onClose,
  onToggleListMember,
  onCreateList,
  onDeleteList,
  onToggleFavorite,
  onClaimToMine,
  onToggleArchive,
}) => {
  const insets = useSafeAreaInsets();
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const [busyListId, setBusyListId] = useState<number | string | null>(null);
  const [showCreateBox, setShowCreateBox] = useState(initialCreateOnly);

  useEffect(() => {
    if (visible) {
      Promise.resolve().then(() => {
        setNewListName('');
        setShowCreateBox(
          initialCreateOnly ||
            chatLists.filter((l) => l.name !== FAVORITES_LIST_NAME).length === 0
        );
      });
    }
  }, [visible, initialCreateOnly, chatLists]);

  if (!visible) return null;

  const convIds = conversations.map((c) => c.id);
  const singleConv = conversations.length === 1 ? conversations[0] : null;
  const customLists = chatLists.filter((l) => l.name !== FAVORITES_LIST_NAME);

  const handleCreate = async () => {
    const trimmed = newListName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await onCreateList(trimmed, convIds);
      setNewListName('');
      if (initialCreateOnly) {
        onClose();
      } else {
        setShowCreateBox(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = (list: ChatList) => {
    Alert.alert(
      'حذف القائمة',
      `هل تريد حذف قائمة "${list.name}"؟ لن يتم حذف المحادثات الموجودة بداخلها.`,
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => onDeleteList(list),
        },
      ]
    );
  };

  const isGroup = Boolean(singleConv?.contact_jid?.includes('@g.us'));
  const isMine = Boolean(singleConv && singleConv.assigned_agent_id === currentUserId);
  const isArchived = Boolean(singleConv?.archived_at);
  const isFav = Boolean(singleConv && isFavoriteCheck(singleConv.id));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafeView style={styles.backdrop}>
        <Pressable style={styles.backdropDismiss} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>
                {initialCreateOnly && convIds.length === 0
                  ? 'إنشاء قائمة محادثات جديدة'
                  : 'إضافة إلى قائمة أو فلتر'}
              </Text>
              <Text style={styles.subtitle}>
                {convIds.length > 1
                  ? `${convIds.length} محادثات محددة`
                  : singleConv
                    ? singleConv.contact_name ||
                      (singleConv.contact_phone ? `+${singleConv.contact_phone}` : 'محادثة')
                    : 'تنظيم المحادثات المتزامن مع الويب'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color="#667781" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {singleConv && !initialCreateOnly && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>الفلاتر الأساسية في التطبيق</Text>

                <View style={[styles.listRow, styles.listRowStatic]}>
                  <View style={[styles.iconCircle, { backgroundColor: '#E8F8F5' }]}>
                    <MaterialCommunityIcons
                      name={isGroup ? 'account-group-outline' : 'chat-outline'}
                      size={18}
                      color={Colors.primaryDark}
                    />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowTitle}>{isGroup ? 'المجموعات' : 'الشاتات'}</Text>
                    <Text style={styles.rowSub}>مصنفة تلقائياً حسب نوع المحادثة</Text>
                  </View>
                  <View style={[styles.badgeChip, { backgroundColor: '#E8F8F5' }]}>
                    <Text style={[styles.badgeChipText, { color: Colors.primaryDark }]}>مُضمنة</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.listRow}
                  onPress={() => onToggleFavorite(singleConv)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconCircle, { backgroundColor: '#FFE4E6' }]}>
                    <Ionicons
                      name={isFav ? 'heart' : 'heart-outline'}
                      size={18}
                      color="#E11D48"
                    />
                  </View>
                  <View style={styles.rowTextWrap}>
                    <Text style={styles.rowTitle}>المفضلة</Text>
                    <Text style={styles.rowSub}>وصول سريع من شريط الفلاتر العلوي</Text>
                  </View>
                  <View style={[styles.checkbox, isFav && styles.checkboxChecked]}>
                    {isFav && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                  </View>
                </TouchableOpacity>

                {!isGroup && onClaimToMine && (
                  <TouchableOpacity
                    style={styles.listRow}
                    disabled={isMine || busyListId === 'mine'}
                    onPress={async () => {
                      if (isMine) return;
                      setBusyListId('mine');
                      try {
                        await onClaimToMine(singleConv);
                      } finally {
                        setBusyListId(null);
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: '#EFF6FF' }]}>
                      <MaterialCommunityIcons
                        name="account-check-outline"
                        size={19}
                        color="#2563EB"
                      />
                    </View>
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowTitle}>محادثاتي</Text>
                      <Text style={styles.rowSub}>
                        {isMine ? 'هذه المحادثة مسندة إليك حالياً' : 'استلام المحادثة وإضافتها لقسم محادثاتي'}
                      </Text>
                    </View>
                    {busyListId === 'mine' ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <View style={[styles.checkbox, isMine && styles.checkboxChecked]}>
                        {isMine && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                      </View>
                    )}
                  </TouchableOpacity>
                )}

                {!isAgent && onToggleArchive && (
                  <TouchableOpacity
                    style={styles.listRow}
                    onPress={() => onToggleArchive(singleConv)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.iconCircle, { backgroundColor: '#F3F4F6' }]}>
                      <MaterialCommunityIcons
                        name="archive-outline"
                        size={18}
                        color="#4B5563"
                      />
                    </View>
                    <View style={styles.rowTextWrap}>
                      <Text style={styles.rowTitle}>المؤرشفة</Text>
                      <Text style={styles.rowSub}>نقل المحادثة إلى صندوق الأرشيف</Text>
                    </View>
                    <View style={[styles.checkbox, isArchived && styles.checkboxChecked]}>
                      {isArchived && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>القوائم المخصصة (متزامنة مع الويب)</Text>
                {!showCreateBox && (
                  <TouchableOpacity
                    style={styles.addSmallBtn}
                    onPress={() => setShowCreateBox(true)}
                  >
                    <Ionicons name="add" size={16} color={Colors.primaryDark} />
                    <Text style={styles.addSmallBtnText}>قائمة جديدة</Text>
                  </TouchableOpacity>
                )}
              </View>

              {showCreateBox && (
                <View style={styles.createCard}>
                  <Text style={styles.createLabel}>اسم القائمة الجديدة:</Text>
                  <View style={styles.createInputRow}>
                    <TextInput
                      style={styles.createInput}
                      placeholder="مثال: عملاء VIP، متابعة اليوم..."
                      placeholderTextColor="#8696A0"
                      value={newListName}
                      onChangeText={setNewListName}
                      textAlign="right"
                      autoFocus={initialCreateOnly}
                      onSubmitEditing={handleCreate}
                    />
                    <TouchableOpacity
                      style={[
                        styles.createSubmitBtn,
                        (!newListName.trim() || creating) && styles.createSubmitBtnDisabled,
                      ]}
                      onPress={handleCreate}
                      disabled={!newListName.trim() || creating}
                    >
                      {creating ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.createSubmitText}>إنشاء</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {customLists.length === 0 ? (
                <View style={styles.emptyListsBox}>
                  <MaterialCommunityIcons name="playlist-star" size={32} color="#8696A0" />
                  <Text style={styles.emptyListsText}>
                    لا توجد قوائم مخصصة بعد. أنشئ قائمة بالأعلى لتظهر هنا وفي نسخة الويب تلقائياً.
                  </Text>
                </View>
              ) : (
                customLists.map((list) => {
                  const allIncluded =
                    convIds.length > 0 &&
                    convIds.every((id) => list.conversation_ids?.includes(id));
                  const isBusy = busyListId === list.id;

                  return (
                    <TouchableOpacity
                      key={list.id}
                      style={styles.listRow}
                      disabled={isBusy || convIds.length === 0}
                      onPress={async () => {
                        if (convIds.length === 0) return;
                        setBusyListId(list.id);
                        try {
                          await onToggleListMember(list, convIds, !allIncluded);
                        } finally {
                          setBusyListId(null);
                        }
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.iconCircle, { backgroundColor: '#F3E8FF' }]}>
                        <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#7C3AED" />
                      </View>
                      <View style={styles.rowTextWrap}>
                        <Text style={styles.rowTitle}>{list.name}</Text>
                        <Text style={styles.rowSub}>
                          {list.conversation_ids?.length || 0} محادثة
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => confirmDelete(list)}
                        style={styles.deleteListBtn}
                        hitSlop={8}
                      >
                        <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                      </TouchableOpacity>

                      {convIds.length > 0 && (
                        isBusy ? (
                          <ActivityIndicator size="small" color={Colors.primary} />
                        ) : (
                          <View style={[styles.checkbox, allIncluded && styles.checkboxChecked]}>
                            {allIncluded && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                          </View>
                        )
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardSafeView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 20, 26, 0.52)',
    justifyContent: 'flex-end',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    maxHeight: '84%',
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D7DB',
    alignSelf: 'center',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9EDEF',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 12,
    color: '#667781',
    marginTop: 2,
    textAlign: 'right',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    maxHeight: 480,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 14,
  },
  section: {
    gap: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#667781',
    textAlign: 'right',
    marginBottom: 2,
  },
  addSmallBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 3,
  },
  addSmallBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  createCard: {
    backgroundColor: '#F8FAFB',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 6,
  },
  createLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
    marginBottom: 6,
  },
  createInputRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  createInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    color: '#111B21',
  },
  createSubmitBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createSubmitBtnDisabled: {
    opacity: 0.45,
  },
  createSubmitText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  listRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFB',
    borderWidth: 1,
    borderColor: '#F0F2F5',
    gap: 10,
  },
  listRowStatic: {
    opacity: 0.9,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  rowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  rowSub: {
    fontSize: 11,
    color: '#667781',
    marginTop: 1,
    textAlign: 'right',
  },
  badgeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeChipText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  deleteListBtn: {
    padding: 4,
  },
  emptyListsBox: {
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 6,
  },
  emptyListsText: {
    fontSize: 12,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 18,
  },
});
