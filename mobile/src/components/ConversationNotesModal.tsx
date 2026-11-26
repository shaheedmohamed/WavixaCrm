import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeView } from './KeyboardSafeView';
import { Conversation, ConversationNote } from '../types/crm';
import { chatService } from '../services/chatService';
import { Colors } from '../constants/theme';

interface ConversationNotesModalProps {
  conversation: Conversation | null;
  currentUserId?: number;
  isAgent?: boolean;
  onClose: () => void;
}

const noteTime = (iso?: string | null) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const hh = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ampm = hh >= 12 ? 'م' : 'ص';
    const h12 = hh % 12 || 12;
    return `${isToday ? 'اليوم' : `${d.getDate()}/${d.getMonth() + 1}`} ${h12}:${mm} ${ampm}`;
  } catch {
    return '';
  }
};

export const ConversationNotesModal: React.FC<ConversationNotesModalProps> = ({
  conversation,
  currentUserId,
  isAgent,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const convId = conversation?.id ?? null;
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!convId) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const res = await chatService.getNotes(convId);
      if (seq === loadSeq.current && res?.success) {
        setNotes(res.notes || []);
      }
    } catch {
      /* notes are auxiliary — silent */
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [convId]);

  useEffect(() => {
    if (conversation) {
      Promise.resolve().then(() => {
        setDraft('');
        load();
      });
    }
  }, [conversation, load]);

  if (!conversation) return null;

  const title =
    conversation.contact_name ||
    (conversation.contact_username ? `@${conversation.contact_username}` : null) ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل واتساب');

  const canDelete = (n: ConversationNote) =>
    !isAgent || n.author?.id === currentUserId;

  const submit = async () => {
    const body = draft.trim();
    if (!body || saving || !convId) return;
    setSaving(true);
    try {
      const res = await chatService.addNote(convId, body);
      if (res?.success && res.note) {
        setNotes((prev) => [...prev, res.note]);
        setDraft('');
      }
    } catch (err: any) {
      Alert.alert('خطأ', err?.response?.data?.message || 'تعذر حفظ الملاحظة');
    } finally {
      setSaving(false);
    }
  };

  const remove = (n: ConversationNote) => {
    Alert.alert('حذف الملاحظة', 'متأكد إنك عايز تحذف الملاحظة دي؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await chatService.deleteNote(n.id);
            setNotes((prev) => prev.filter((x) => x.id !== n.id));
          } catch (err: any) {
            Alert.alert('خطأ', err?.response?.data?.message || 'تعذر حذف الملاحظة');
          }
        },
      },
    ]);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafeView style={styles.backdrop}>
        <Pressable style={styles.backdropDismiss} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>ملاحظات داخلية</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {title} — بيشوفها كل الفريق
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color="#667781" />
            </TouchableOpacity>
          </View>

          {loading && notes.length === 0 ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : notes.length === 0 ? (
            <View style={styles.centerBox}>
              <MaterialCommunityIcons name="note-text-outline" size={34} color="#8696A0" />
              <Text style={styles.emptyText}>
                مفيش ملاحظات لسه — اكتب حاجة يعرفها اللي جاي في الشيفت بعدك
              </Text>
            </View>
          ) : (
            <FlatList
              data={notes}
              keyExtractor={(n) => String(n.id)}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.noteCard}>
                  <View style={styles.noteBodyWrap}>
                    <Text style={styles.noteText}>{item.body}</Text>
                    <Text style={styles.noteMeta}>
                      {item.author?.name || 'فريق'} • {noteTime(item.created_at)}
                    </Text>
                  </View>
                  {canDelete(item) && (
                    <TouchableOpacity onPress={() => remove(item)} hitSlop={8} style={styles.deleteBtn}>
                      <Ionicons name="trash-outline" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}

          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder="اكتب ملاحظة للفريق…"
              placeholderTextColor="#8696A0"
              value={draft}
              onChangeText={setDraft}
              multiline
              textAlign="right"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!draft.trim() || saving) && styles.sendBtnDisabled]}
              onPress={submit}
              disabled={!draft.trim() || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="send" size={18} color="#FFFFFF" style={{ transform: [{ scaleX: -1 }] }} />
              )}
            </TouchableOpacity>
          </View>
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
    maxHeight: '78%',
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
  centerBox: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 28,
    gap: 8,
  },
  emptyText: {
    fontSize: 12.5,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 19,
  },
  list: {
    maxHeight: 380,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  noteCard: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEA',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  noteBodyWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  noteText: {
    fontSize: 13.5,
    color: '#111B21',
    textAlign: 'right',
    lineHeight: 20,
  },
  noteMeta: {
    fontSize: 10.5,
    color: '#92700C',
    marginTop: 5,
    textAlign: 'right',
  },
  deleteBtn: {
    padding: 4,
  },
  composer: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E9EDEF',
  },
  input: {
    flex: 1,
    backgroundColor: '#F0F2F5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 13.5,
    color: '#111B21',
    maxHeight: 110,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
