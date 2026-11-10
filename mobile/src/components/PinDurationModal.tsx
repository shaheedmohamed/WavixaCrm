import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface PinDurationModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDuration: (durationInSeconds: number) => void;
}

export const PinDurationModal: React.FC<PinDurationModalProps> = ({
  visible,
  onClose,
  onSelectDuration,
}) => {
  const options = [
    { label: '٢٤ ساعة', seconds: 86400 },
    { label: '٧ أيام (مستحسن)', seconds: 604800, recommended: true },
    { label: '٣٠ يوم', seconds: 2592000 },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons name="pin" size={26} color={Colors.primary} />
          </View>
          <Text style={styles.title}>مدة تثبيت الرسالة</Text>
          <Text style={styles.subtitle}>يمكنك إلغاء تثبيت الرسالة في أي وقت</Text>

          <View style={styles.optionsWrap}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.seconds}
                style={[styles.optionBtn, opt.recommended && styles.optionBtnRecommended]}
                onPress={() => {
                  onSelectDuration(opt.seconds);
                  onClose();
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.optionText,
                    opt.recommended && styles.optionTextRecommended,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>إلغاء</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F8F5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111B21',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#667781',
    marginBottom: 16,
  },
  optionsWrap: {
    width: '100%',
    gap: 8,
    marginBottom: 12,
  },
  optionBtn: {
    backgroundColor: '#F8FAFB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9EDEF',
  },
  optionBtnRecommended: {
    borderColor: Colors.primary,
    backgroundColor: '#E8F8F5',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111B21',
  },
  optionTextRecommended: {
    color: Colors.primaryDark,
    fontWeight: '800',
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: '#8696A0',
    fontSize: 13,
    fontWeight: '600',
  },
});
