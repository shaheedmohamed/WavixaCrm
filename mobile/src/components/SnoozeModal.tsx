import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from './ChatAvatar';
import { useNow } from '../hooks/useNow';
import { Conversation } from '../types/crm';

interface SnoozeModalProps {
  conversation: Conversation | null;
  onClose: () => void;
  /** minutes to snooze, or null to clear an active snooze */
  onSnooze: (conv: Conversation, minutes: number | null) => void;
}

const PRESETS: { label: string; sub: string; minutes: number }[] = [
  { label: 'بعد ساعة', sub: 'ترجع المحادثة للقائمة تلقائياً', minutes: 60 },
  { label: 'بعد ساعتين', sub: 'تذكير سريع خلال الشيفت', minutes: 120 },
  { label: 'بعد ٤ ساعات', sub: 'نهاية الشيفت تقريباً', minutes: 240 },
  { label: 'بكرة الصبح', sub: 'ترجع الساعة ٨ صباحاً', minutes: -1 }, // special
  { label: 'بعد أسبوع', sub: 'متابعة بعيدة المدى', minutes: 7 * 24 * 60 },
];

const minutesUntilTomorrow8am = () => {
  const target = new Date();
  target.setDate(target.getDate() + 1);
  target.setHours(8, 0, 0, 0);
  return Math.max(30, Math.round((target.getTime() - Date.now()) / 60000));
};

const snoozeUntilLabel = (iso?: string | null) => {
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

export const SnoozeModal: React.FC<SnoozeModalProps> = ({
  conversation,
  onClose,
  onSnooze,
}) => {
  const insets = useSafeAreaInsets();
  const now = useNow(30_000, !!conversation);
  if (!conversation) return null;

  const title =
    conversation.contact_name ||
    (conversation.contact_username ? `@${conversation.contact_username}` : null) ||
    (conversation.contact_phone ? `+${conversation.contact_phone}` : 'عميل واتساب');

  const isSnoozed =
    !!conversation.snoozed_until &&
    new Date(conversation.snoozed_until).getTime() > now;

  const pick = (minutes: number) => {
    const m = minutes === -1 ? minutesUntilTomorrow8am() : minutes;
    onSnooze(conversation, m);
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.convHeader}>
            <ChatAvatar conversation={conversation} title={title} size={46} badge />
            <View style={styles.convInfo}>
              <Text style={styles.convTitle} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.convSub} numberOfLines={1}>
                {isSnoozed
                  ? `مؤجلة حتى ${snoozeUntilLabel(conversation.snoozed_until)}`
                  : 'هتختفي من قائمة الشاتات وترجع لوحدها'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={20} color="#667781" />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>ذكّرني بالمحادثة دي بعد...</Text>

          {PRESETS.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={styles.option}
              onPress={() => pick(opt.minutes)}
              activeOpacity={0.7}
            >
              <View style={styles.optIcon}>
                <MaterialCommunityIcons name="alarm-snooze" size={20} color="#6366F1" />
              </View>
              <View style={styles.optTextWrap}>
                <Text style={styles.optLabel}>{opt.label}</Text>
                <Text style={styles.optSub}>{opt.sub}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {isSnoozed && (
            <TouchableOpacity
              style={[styles.option, styles.unsnoozeOption]}
              onPress={() => {
                onSnooze(conversation, null);
                onClose();
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.optIcon, { backgroundColor: '#FEF2F2' }]}>
                <MaterialCommunityIcons name="alarm-off" size={20} color="#DC2626" />
              </View>
              <View style={styles.optTextWrap}>
                <Text style={[styles.optLabel, { color: '#DC2626' }]}>إلغاء التأجيل</Text>
                <Text style={styles.optSub}>ترجع المحادثة للقائمة فوراً</Text>
              </View>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 20, 26, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 8,
    paddingHorizontal: 14,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D7DB',
    alignSelf: 'center',
    marginBottom: 10,
  },
  convHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9EDEF',
    marginBottom: 6,
    gap: 10,
  },
  convInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  convTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
  },
  convSub: {
    fontSize: 11.5,
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
    marginVertical: 8,
    paddingHorizontal: 4,
  },
  option: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFB',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E9EDEF',
    gap: 12,
  },
  unsnoozeOption: {
    borderColor: '#FECACA',
  },
  optIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  optLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111B21',
  },
  optSub: {
    fontSize: 11,
    color: '#667781',
    marginTop: 1,
  },
});
