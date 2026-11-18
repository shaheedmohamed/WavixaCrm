import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type AttachmentKind = 'gallery' | 'camera' | 'document';

interface AttachmentSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: AttachmentKind) => void;
}

/** WhatsApp-style attach sheet — gallery, camera, document. */
export const AttachmentSheet: React.FC<AttachmentSheetProps> = ({ visible, onClose, onSelect }) => {
  const insets = useSafeAreaInsets();

  const items: { kind: AttachmentKind; icon: React.ReactNode; label: string; bg: string }[] = [
    {
      kind: 'gallery',
      icon: <Ionicons name="images" size={26} color="#FFFFFF" />,
      label: 'صور وفيديو',
      bg: '#7C5CFC',
    },
    {
      kind: 'camera',
      icon: <Ionicons name="camera" size={26} color="#FFFFFF" />,
      label: 'كاميرا',
      bg: '#00A884',
    },
    {
      kind: 'document',
      icon: <MaterialCommunityIcons name="file-document" size={26} color="#FFFFFF" />,
      label: 'مستند',
      bg: '#3B82F6',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={styles.row}>
            {items.map((item) => (
              <TouchableOpacity
                key={item.kind}
                style={styles.item}
                onPress={() => {
                  onSelect(item.kind);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.bg }]}>
                  {item.icon}
                </View>
                <Text style={styles.label}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
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
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 18,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  item: {
    alignItems: 'center',
    width: 84,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 7,
    fontSize: 12,
    color: '#111B21',
    fontWeight: '600',
  },
});
