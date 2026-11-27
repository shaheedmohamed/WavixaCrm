import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardSafeView } from './KeyboardSafeView';
import { SlideToConfirm } from './SlideToConfirm';
import { chatService } from '../services/chatService';

interface ResolveModalProps {
  visible: boolean;
  conversationId: number;
  onClose: () => void;
  onResolved: () => void;
}

export const ResolveModal: React.FC<ResolveModalProps> = ({
  visible,
  conversationId,
  onClose,
  onResolved,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleResolve = async () => {
    setSubmitting(true);
    setError('');

    try {
      const res = await chatService.resolveConversation(conversationId, rating, note.trim() || undefined);
      if (res.success) {
        onClose();
        onResolved();
      } else {
        setError(res.message || 'فشل إنهاء المحادثة');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafeView style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>إنهاء وتوثيق المحادثة</Text>
          <Text style={styles.subTitle}>
            هل تم حل استفسار أو طلب العميل بنجاح؟ يمكنك تقييم التجربة وتوثيق النتيجة.
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Star Rating */}
          <Text style={styles.label}>تقييم المحادثة:</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity
                key={star}
                onPress={() => setRating(star)}
                style={styles.starBtn}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={32}
                  color={star <= rating ? '#F59E0B' : '#8696A0'}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Rating note */}
          <Text style={styles.label}>ملاحظة أو ملخص (اختياري):</Text>
          <TextInput
            style={styles.input}
            placeholder="مثال: تم إرسال الطلبية وتأكيد الدفع مع العميل..."
            placeholderTextColor="#8696A0"
            multiline
            numberOfLines={2}
            value={note}
            onChangeText={setNote}
            textAlign="right"
          />

          {/* Actions — the confirm is a deliberate drag so a stray tap can't
              close out a customer's ticket. */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.cancelText}>إلغاء</Text>
            </TouchableOpacity>

            <View style={styles.slideWrap}>
              <SlideToConfirm
                key={visible ? 'open' : 'closed'}
                label="اسحب للإنهاء"
                onConfirm={handleResolve}
                disabled={submitting}
                loading={submitting}
                height={48}
              />
            </View>
          </View>
        </View>
      </KeyboardSafeView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'center',
    marginBottom: 6,
  },
  subTitle: {
    fontSize: 12,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#54656F',
    marginBottom: 6,
    textAlign: 'right',
  },
  starsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 8,
  },
  starBtn: {
    padding: 4,
  },
  input: {
    backgroundColor: '#F8FAFB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    height: 60,
    fontSize: 12.5,
    color: '#111B21',
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  errorText: {
    color: '#EF4444',
    backgroundColor: '#FEE2E2',
    padding: 8,
    borderRadius: 8,
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#54656F',
    fontWeight: '700',
    fontSize: 13,
  },
  slideWrap: {
    flex: 2,
  },
});
