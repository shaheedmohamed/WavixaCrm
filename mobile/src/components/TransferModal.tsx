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
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { chatService } from '../services/chatService';
import { Agent } from '../types/crm';
import { Colors } from '../constants/theme';

interface TransferModalProps {
  visible: boolean;
  conversationId: number;
  currentAgentId?: number | null;
  onClose: () => void;
  onTransferred: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  visible,
  conversationId,
  currentAgentId,
  onClose,
  onTransferred,
}) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedAgentId(null);
      setNote('');
      setError('');
      setLoading(true);
      chatService
        .getAgents()
        .then((res) => {
          if (res.success && res.agents) {
            // Filter out current agent
            const filtered = res.agents.filter((a) => a.id !== currentAgentId);
            setAgents(filtered);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [visible, currentAgentId]);

  const handleTransfer = async () => {
    if (!selectedAgentId) {
      setError('يرجى اختيار الموظف المطلوب التحويل إليه');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await chatService.transferConversation(conversationId, selectedAgentId, note.trim() || undefined);
      if (res.success) {
        onClose();
        onTransferred();
      } else {
        setError(res.message || 'فشل تحويل المحادثة');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#111B21" />
            </TouchableOpacity>
            <Text style={styles.title}>تحويل المحادثة لزميل</Text>
            <View style={{ width: 32 }} />
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <Text style={styles.sectionTitle}>اختر الموظف:</Text>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={Colors.primary} size="small" />
              </View>
            ) : agents.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>لا يوجد موظفون متاحون حالياً</Text>
              </View>
            ) : (
              <FlatList
                data={agents}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 180 }}
                renderItem={({ item }) => {
                  const isSelected = selectedAgentId === item.id;
                  return (
                    <TouchableOpacity
                      style={[styles.agentRow, isSelected && styles.agentRowSelected]}
                      onPress={() => setSelectedAgentId(item.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.agentInfo}>
                        <Text style={[styles.agentName, isSelected && styles.agentNameSelected]}>
                          {item.name}
                        </Text>
                        <Text style={styles.agentEmail}>{item.email}</Text>
                      </View>
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>
                        {isSelected && <View style={styles.radioDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <Text style={[styles.sectionTitle, { marginTop: 12 }]}>ملاحظة التحويل (اختياري):</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="اكتب ملاحظة للزميل لتوضيح حالة العميل..."
              placeholderTextColor="#8696A0"
              multiline
              numberOfLines={2}
              value={note}
              onChangeText={setNote}
              textAlign="right"
            />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleTransfer}
              disabled={submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.submitBtnText}>تأكيد التحويل</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    paddingBottom: 20,
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
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#54656F',
    marginVertical: 8,
    textAlign: 'right',
  },
  agentRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFB',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E9EDEF',
  },
  agentRowSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#E8F8F5',
  },
  agentInfo: {
    alignItems: 'flex-end',
  },
  agentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111B21',
  },
  agentNameSelected: {
    color: Colors.primaryDark,
  },
  agentEmail: {
    fontSize: 10.5,
    color: '#8696A0',
    marginTop: 1,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#8696A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  noteInput: {
    backgroundColor: '#F8FAFB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    height: 60,
    fontSize: 12.5,
    color: '#111B21',
    textAlignVertical: 'top',
  },
  loadingWrap: {
    padding: 20,
    alignItems: 'center',
  },
  emptyWrap: {
    padding: 16,
    alignItems: 'center',
  },
  emptyText: {
    color: '#8696A0',
    fontSize: 12,
  },
  errorText: {
    color: '#EF4444',
    backgroundColor: '#FEE2E2',
    padding: 8,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    fontSize: 12,
    textAlign: 'right',
  },
  footer: {
    paddingHorizontal: 16,
    marginTop: 14,
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
