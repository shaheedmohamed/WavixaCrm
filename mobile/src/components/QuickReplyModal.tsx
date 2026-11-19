import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { KeyboardSafeView } from './KeyboardSafeView';
import { chatService } from '../services/chatService';
import { QuickReply } from '../types/crm';
import { Colors } from '../constants/theme';

interface QuickReplyModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectReply: (replyText: string) => void;
}

interface FormState {
  mode: 'hidden' | 'add' | 'edit';
  id: number | null;
  shortcut: string;
  body: string;
  isShared: boolean;
  saving: boolean;
}

const HIDDEN_FORM: FormState = {
  mode: 'hidden',
  id: null,
  shortcut: '',
  body: '',
  isShared: false,
  saving: false,
};

export const QuickReplyModal: React.FC<QuickReplyModalProps> = ({
  visible,
  onClose,
  onSelectReply,
}) => {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(HIDDEN_FORM);

  const loadReplies = () => {
    setLoading(true);
    chatService
      .getQuickReplies()
      .then((res) => {
        if (res.success && res.quick_replies) {
          setReplies(res.quick_replies);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (visible) {
      Promise.resolve().then(() => {
        setSearch('');
        setForm(HIDDEN_FORM);
        loadReplies();
      });
    }
  }, [visible]);

  const filtered = replies.filter(
    (r) =>
      r.shortcut.toLowerCase().includes(search.toLowerCase()) ||
      r.message.toLowerCase().includes(search.toLowerCase())
  );

  const openAddForm = () => {
    setForm({ mode: 'add', id: null, shortcut: '', body: '', isShared: false, saving: false });
  };

  const openEditForm = (reply: QuickReply) => {
    setForm({
      mode: 'edit',
      id: reply.id,
      shortcut: reply.shortcut,
      body: reply.message,
      isShared: Boolean(reply.is_shared),
      saving: false,
    });
  };

  const handleSave = async () => {
    const body = form.body.trim();
    if (!body) {
      Alert.alert('نص الرد مطلوب', 'اكتب نص الرد السريع أولاً');
      return;
    }
    setForm((f) => ({ ...f, saving: true }));
    try {
      const res = await chatService.saveQuickReply({
        id: form.mode === 'edit' ? form.id ?? undefined : undefined,
        shortcut: form.shortcut.trim().replace(/^\/+/, ''),
        body,
        is_shared: form.isShared,
      });
      if (res.success) {
        setForm(HIDDEN_FORM);
        loadReplies();
      } else {
        Alert.alert('تعذر الحفظ', 'حاول مرة أخرى');
      }
    } catch {
      Alert.alert('تعذر الحفظ', 'حاول مرة أخرى');
    } finally {
      setForm((f) => ({ ...f, saving: false }));
    }
  };

  const handleDelete = (reply: QuickReply) => {
    Alert.alert('حذف الرد السريع', `حذف "${reply.shortcut || reply.message.slice(0, 40)}"؟`, [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await chatService.deleteQuickReply(reply.id);
            setReplies((prev) => prev.filter((r) => r.id !== reply.id));
          } catch {
            Alert.alert('تعذر الحذف', 'حاول مرة أخرى');
          }
        },
      },
    ]);
  };

  const renderForm = () => (
    <View style={styles.formWrap}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={() => setForm(HIDDEN_FORM)} hitSlop={8}>
          <Ionicons name="arrow-forward" size={20} color="#111B21" />
        </TouchableOpacity>
        <Text style={styles.formTitle}>
          {form.mode === 'edit' ? 'تعديل الرد السريع' : 'رد سريع جديد'}
        </Text>
        <View style={{ width: 20 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.fieldLabel}>الاختصار</Text>
        <View style={styles.shortcutRow}>
          <Text style={styles.slashPrefix}>/</Text>
          <TextInput
            style={styles.shortcutInput}
            placeholder="مثال: ترحيب"
            placeholderTextColor="#8696A0"
            value={form.shortcut}
            onChangeText={(t) => setForm((f) => ({ ...f, shortcut: t }))}
            textAlign="right"
          />
        </View>

        <Text style={styles.fieldLabel}>نص الرد</Text>
        <TextInput
          style={styles.bodyInput}
          placeholder="اكتب الرسالة التي سترسل للعميل..."
          placeholderTextColor="#8696A0"
          value={form.body}
          onChangeText={(t) => setForm((f) => ({ ...f, body: t }))}
          multiline
          textAlign="right"
          textAlignVertical="top"
          autoFocus={form.mode === 'add'}
        />

        <Text style={styles.fieldLabel}>من يقدر يشوف الرد ده؟</Text>
        <View style={styles.visibilityRow}>
          <TouchableOpacity
            style={[styles.visibilityOption, !form.isShared && styles.visibilityOptionActive]}
            onPress={() => setForm((f) => ({ ...f, isShared: false }))}
            activeOpacity={0.8}
          >
            <Ionicons
              name={!form.isShared ? 'lock-closed' : 'lock-closed-outline'}
              size={18}
              color={!form.isShared ? '#FFFFFF' : Colors.primary}
            />
            <Text
              style={[
                styles.visibilityLabel,
                !form.isShared && styles.visibilityLabelActive,
              ]}
            >
              لي فقط
            </Text>
            <Text
              style={[
                styles.visibilitySub,
                !form.isShared && styles.visibilitySubActive,
              ]}
            >
              يظهر لحسابك أنت بس
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.visibilityOption, form.isShared && styles.visibilityOptionActive]}
            onPress={() => setForm((f) => ({ ...f, isShared: true }))}
            activeOpacity={0.8}
          >
            <Ionicons
              name={form.isShared ? 'people' : 'people-outline'}
              size={18}
              color={form.isShared ? '#FFFFFF' : Colors.primary}
            />
            <Text
              style={[
                styles.visibilityLabel,
                form.isShared && styles.visibilityLabelActive,
              ]}
            >
              يظهر للجميع
            </Text>
            <Text
              style={[
                styles.visibilitySub,
                form.isShared && styles.visibilitySubActive,
              ]}
            >
              لكل الموظفين في الحساب
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, form.saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={form.saving}
          activeOpacity={0.85}
        >
          {form.saving ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>
              {form.mode === 'edit' ? 'حفظ التعديلات' : 'إضافة الرد'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafeView style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#111B21" />
            </TouchableOpacity>
            <Text style={styles.title}>الردود السريعة</Text>
            {form.mode === 'hidden' ? (
              <TouchableOpacity onPress={openAddForm} style={styles.addBtn} hitSlop={8}>
                <Ionicons name="add" size={24} color={Colors.primary} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 32 }} />
            )}
          </View>

          {form.mode !== 'hidden' ? (
            renderForm()
          ) : (
            <>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color="#8696A0" style={{ marginLeft: 6 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="ابحث في الردود أو الاختصارات..."
                  placeholderTextColor="#8696A0"
                  value={search}
                  onChangeText={setSearch}
                  textAlign="right"
                />
              </View>

              {loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color={Colors.primary} size="small" />
                </View>
              ) : filtered.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <MaterialCommunityIcons name="flash-off" size={36} color="#8696A0" />
                  <Text style={styles.emptyText}>لا توجد ردود سريعة مضافة</Text>
                  <TouchableOpacity style={styles.emptyAddBtn} onPress={openAddForm}>
                    <Ionicons name="add" size={18} color="#FFF" />
                    <Text style={styles.emptyAddText}>أضف رد سريع</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => String(item.id)}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.itemCard}
                      onPress={() => {
                        onSelectReply(item.message);
                        onClose();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.itemTopRow}>
                        {Boolean(item.shortcut) && (
                          <View style={styles.shortcutTag}>
                            <Text style={styles.shortcutText}>/{item.shortcut}</Text>
                          </View>
                        )}
                        {item.is_shared ? (
                          <View style={styles.sharedTag}>
                            <Ionicons name="people" size={10} color="#2563EB" />
                            <Text style={styles.sharedTagText}>
                              {item.mine ? 'للجميع' : `من ${item.owner_name || 'زميل'}`}
                            </Text>
                          </View>
                        ) : null}
                        <View style={{ flex: 1 }} />
                        {item.mine !== false && (
                          <>
                            <TouchableOpacity
                              onPress={() => openEditForm(item)}
                              hitSlop={8}
                              style={styles.itemAction}
                            >
                              <Ionicons name="create-outline" size={16} color="#667781" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDelete(item)}
                              hitSlop={8}
                              style={styles.itemAction}
                            >
                              <Ionicons name="trash-outline" size={16} color="#E11D48" />
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                      <Text style={styles.messageText} numberOfLines={2}>
                        {item.message}
                      </Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}
        </View>
      </KeyboardSafeView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '85%',
    minHeight: 350,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  closeBtn: {
    padding: 4,
  },
  addBtn: {
    padding: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
  },
  searchBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#111B21',
    fontSize: 12.5,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#8696A0',
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginTop: 6,
  },
  emptyAddText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  itemCard: {
    backgroundColor: '#F8FAFB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E9EDEF',
    alignItems: 'flex-end',
  },
  itemTopRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
    alignSelf: 'stretch',
  },
  shortcutTag: {
    backgroundColor: '#E8F8F5',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  shortcutText: {
    color: Colors.primaryDark,
    fontSize: 11,
    fontWeight: '700',
  },
  sharedTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sharedTagText: {
    color: '#2563EB',
    fontSize: 9.5,
    fontWeight: '700',
  },
  itemAction: {
    padding: 3,
  },
  messageText: {
    fontSize: 12.5,
    color: '#111B21',
    lineHeight: 18,
    textAlign: 'right',
  },
  // --- Add / edit form ---
  formWrap: {
    flexGrow: 1,
  },
  formHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111B21',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667781',
    textAlign: 'right',
    marginTop: 14,
    marginBottom: 6,
  },
  shortcutRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  slashPrefix: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.primary,
    marginLeft: 6,
  },
  shortcutInput: {
    flex: 1,
    height: '100%',
    fontSize: 13.5,
    color: '#111B21',
  },
  bodyInput: {
    backgroundColor: '#F0F2F5',
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    fontSize: 13.5,
    color: '#111B21',
    lineHeight: 20,
  },
  visibilityRow: {
    flexDirection: 'row-reverse',
    gap: 10,
  },
  visibilityOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E9EDEF',
    backgroundColor: '#F8FAFB',
    gap: 3,
  },
  visibilityOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  visibilityLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111B21',
  },
  visibilityLabelActive: {
    color: '#FFFFFF',
  },
  visibilitySub: {
    fontSize: 10,
    color: '#667781',
    textAlign: 'center',
  },
  visibilitySubActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 20,
  },
  saveBtnText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
});
