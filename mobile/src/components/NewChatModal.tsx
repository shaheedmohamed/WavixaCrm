import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { chatService } from '../services/chatService';
import { SessionDevice } from '../types/crm';
import { Colors } from '../constants/theme';

interface NewChatModalProps {
  visible: boolean;
  onClose: () => void;
  onChatStarted: (conversation: any) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  visible,
  onClose,
  onChatStarted,
}) => {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [devices, setDevices] = useState<SessionDevice[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setPhone('');
      setMessage('');
      setError('');
      chatService.getDevices().then((res) => {
        if (res.success && res.devices?.length) {
          const connected = res.devices.filter((d) => d.status === 'connected');
          setDevices(connected.length ? connected : res.devices);
          if (connected.length) {
            setSelectedSessionId(connected[0].id);
          }
        }
      }).catch(() => {});
    }
  }, [visible]);

  const handleStart = async () => {
    const cleanPhone = phone.trim().replace(/[^\d+]/g, '');
    if (!cleanPhone) {
      setError('يرجى إدخال رقم الهاتف بشكل صحيح');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await chatService.startConversation(cleanPhone, selectedSessionId, message.trim() || undefined);
      if (res.success && res.conversation) {
        onClose();
        onChatStarted(res.conversation);
      } else {
        setError(res.message || 'تعذر بدء المحادثة');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#111B21" />
            </TouchableOpacity>
            <Text style={styles.title}>محادثة جديدة</Text>
            <View style={{ width: 32 }} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <ScrollView style={styles.content}>
            <Text style={styles.label}>رقم هاتف العميل (مع مفتاح الدولة):</Text>
            <TextInput
              style={styles.input}
              placeholder="مثال: +201012345678"
              placeholderTextColor="#8696A0"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              textAlign="right"
            />

            {devices.length > 1 && (
              <View style={styles.section}>
                <Text style={styles.label}>الإرسال عبر جهاز:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.deviceRow}>
                  {devices.map((d) => {
                    const isSelected = selectedSessionId === d.id;
                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[styles.deviceChip, isSelected && styles.deviceChipActive]}
                        onPress={() => setSelectedSessionId(d.id)}
                      >
                        <Text style={[styles.deviceChipText, isSelected && styles.deviceChipTextActive]}>
                          {d.device_name || `جهاز ${d.id}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <Text style={styles.label}>الرسالة الأولى (اختياري):</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="اكتب رسالتك للعميل..."
              placeholderTextColor="#8696A0"
              multiline
              numberOfLines={3}
              value={message}
              onChangeText={setMessage}
              textAlign="right"
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleStart}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>بدء المحادثة</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
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
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#54656F',
    marginBottom: 6,
    textAlign: 'right',
  },
  input: {
    backgroundColor: '#F8FAFB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111B21',
    marginBottom: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  section: {
    marginBottom: 12,
  },
  deviceRow: {
    flexDirection: 'row-reverse',
    marginTop: 4,
  },
  deviceChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#F0F2F5',
    marginLeft: 8,
  },
  deviceChipActive: {
    backgroundColor: Colors.primary,
  },
  deviceChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#54656F',
  },
  deviceChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  errorText: {
    color: '#EF4444',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 8,
    fontSize: 12,
    textAlign: 'right',
  },
  footer: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
