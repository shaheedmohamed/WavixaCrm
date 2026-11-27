import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../types/crm';

const toDate = (v: string | number | null | undefined): Date | null => {
  if (v == null) return null;
  const d = typeof v === 'number' ? new Date(v > 1e11 ? v : v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtTime = (d: Date) =>
  `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

const fmtDay = (d: Date) =>
  `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;

const fmtStamp = (d: Date | null) => (d ? `${fmtTime(d)} — ${fmtDay(d)}` : '—');

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد الإرسال',
  sent: 'تم الإرسال',
  delivered: 'تم التوصيل',
  read: 'تمت القراءة',
  failed: 'فشل الإرسال',
};

/**
 * WhatsApp "Message info" — per-message delivery timeline so the agent can
 * see exactly when the customer's device received it and when it was read.
 * Outgoing messages only (incoming rows have no delivery semantics).
 */
export const MessageInfoModal: React.FC<{
  message: Message | null;
  onClose: () => void;
}> = ({ message, onClose }) => {
  const insets = useSafeAreaInsets();
  if (!message) return null;

  const sentAt =
    toDate(message.sent_at as any) ?? toDate(message.timestamp as any) ?? toDate(message.created_at as any);
  const deliveredAt = toDate(message.delivered_at as any);
  const readAt = toDate(message.read_at as any);
  const status = String(message.status || 'sent');

  const rows = [
    {
      icon: <Ionicons name="checkmark" size={22} color="#8696A0" />,
      label: 'تم الإرسال',
      time: fmtStamp(sentAt),
      active: true,
    },
    {
      icon: <Ionicons name="checkmark-done" size={22} color={readAt || deliveredAt ? '#8696A0' : '#C6CDD2'} />,
      label: 'تم التوصيل',
      time: fmtStamp(deliveredAt),
      active: !!deliveredAt,
    },
    {
      icon: <Ionicons name="checkmark-done" size={22} color={readAt ? '#53BDEB' : '#C6CDD2'} />,
      label: 'تمت القراءة',
      time: fmtStamp(readAt),
      active: !!readAt,
    },
  ];

  const previewText =
    message.message ||
    ({ image: '📷 صورة', video: '🎥 فيديو', audio: '🎵 صوت', voice: '🎵 تسجيل صوتي', document: '📄 ملف', sticker: 'ملصق' } as Record<string, string>)[
      String(message.message_type)
    ] ||
    'رسالة';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}
          onPress={() => {}}
        >
          <View style={styles.grabber} />
          <Text style={styles.title}>معلومات الرسالة</Text>

          {/* Mini bubble preview */}
          <View style={styles.bubbleWrap}>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText} numberOfLines={4}>
                {previewText}
              </Text>
            </View>
          </View>

          {rows.map((r) => (
            <View key={r.label} style={styles.row}>
              <View style={styles.rowTexts}>
                <Text style={styles.rowLabel}>{r.label}</Text>
                <Text style={[styles.rowTime, !r.active && styles.rowTimeDim]}>
                  {r.time}
                </Text>
              </View>
              {r.icon}
            </View>
          ))}

          {status === 'failed' && (
            <View style={styles.failedRow}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#EF4444" />
              <Text style={styles.failedText}>فشل الإرسال — الرسالة لم تصل لخادم واتساب</Text>
            </View>
          )}

          {message.revoked_at ? (
            <View style={styles.failedRow}>
              <MaterialCommunityIcons name="delete-outline" size={18} color="#8696A0" />
              <Text style={[styles.failedText, { color: '#8696A0' }]}>
                حُذفت للجميع {fmtStamp(toDate(message.revoked_at as any))}
              </Text>
            </View>
          ) : null}

          <View style={styles.statusLine}>
            <Text style={styles.statusText}>
              الحالة الحالية: {STATUS_LABEL[status] || status}
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '75%',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D7DEE2',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'center',
    marginBottom: 14,
  },
  bubbleWrap: {
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  bubble: {
    backgroundColor: '#D9FDD3',
    borderRadius: 12,
    borderTopLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  bubbleText: {
    fontSize: 14.5,
    color: '#111B21',
    lineHeight: 20,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E9EDEF',
  },
  rowTexts: { flex: 1 },
  rowLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  rowTime: {
    fontSize: 12.5,
    color: '#54656F',
    marginTop: 3,
    textAlign: 'right',
  },
  rowTimeDim: { color: '#B7C0C6' },
  failedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  failedText: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'right',
    flex: 1,
  },
  statusLine: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E9EDEF',
  },
  statusText: {
    fontSize: 12.5,
    color: '#8696A0',
    textAlign: 'center',
  },
});
