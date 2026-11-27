import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Message } from '../types/crm';

const POPULAR_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

interface MessageActionsSheetProps {
  message: Message | null;
  onClose: () => void;
  onReact: (emoji: string | null) => void;
  onReply: (msg: Message) => void;
  onForward: (msg: Message) => void;
  onPin: (msg: Message) => void;
  onStar: (msg: Message) => void;
  onDelete: (msg: Message) => void;
  /** WhatsApp "Message info" — delivery/read timeline (outgoing only). */
  onInfo: (msg: Message) => void;
  /** Enter WhatsApp-style multi-select starting with this message. */
  onSelect: (msg: Message) => void;
}

/** WhatsApp-style long-press action sheet — emoji reaction row on top,
 *  then the action list. Android Alert only shows 3 buttons, so the
 *  options live in a proper bottom sheet instead. */
export const MessageActionsSheet: React.FC<MessageActionsSheetProps> = ({
  message,
  onClose,
  onReact,
  onReply,
  onForward,
  onPin,
  onStar,
  onDelete,
  onInfo,
  onSelect,
}) => {
  const insets = useSafeAreaInsets();
  if (!message) return null;
  const isOutgoing = message.direction === 'outgoing' || message.sent_by_user_id != null;

  const items = [
    {
      icon: <Ionicons name="arrow-undo-outline" size={19} color="#54656F" />,
      label: 'رد على الرسالة',
      onPress: () => onReply(message),
    },
    {
      icon: <Ionicons name="arrow-redo-outline" size={19} color="#54656F" />,
      label: 'إعادة توجيه',
      onPress: () => onForward(message),
    },
    {
      icon: <MaterialCommunityIcons name="pin-outline" size={19} color="#54656F" />,
      label: 'تثبيت الرسالة',
      onPress: () => onPin(message),
    },
    {
      icon: (
        <Ionicons
          name={message.starred_at ? 'star' : 'star-outline'}
          size={19}
          color={message.starred_at ? '#F59E0B' : '#54656F'}
        />
      ),
      label: message.starred_at ? 'إلغاء التمييز بنجمة' : 'تمييز بنجمة',
      onPress: () => onStar(message),
    },
    ...(message.message
      ? [
          {
            icon: <Ionicons name="copy-outline" size={19} color="#54656F" />,
            label: 'نسخ النص',
            onPress: () => {
              Clipboard.setStringAsync(message.message || '').catch(() => {});
            },
          },
        ]
      : []),
    ...(isOutgoing
      ? [
          {
            icon: <Ionicons name="information-circle-outline" size={19} color="#54656F" />,
            label: 'معلومات الرسالة',
            onPress: () => onInfo(message),
          },
        ]
      : []),
    {
      icon: <Ionicons name="checkmark-circle-outline" size={19} color="#54656F" />,
      label: 'تحديد',
      onPress: () => onSelect(message),
    },
    {
      icon: <Ionicons name="trash-outline" size={19} color="#EF4444" />,
      label: 'حذف الرسالة',
      danger: true,
      onPress: () => onDelete(message),
    },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}>
          {/* Reaction row */}
          <View style={styles.emojiRow}>
            {POPULAR_EMOJIS.map((emoji) => (
              <TouchableOpacity
                key={emoji}
                style={styles.emojiBtn}
                onPress={() => {
                  onClose();
                  onReact(emoji);
                }}
              >
                <Text style={styles.emoji}>{emoji}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.emojiBtn}
              onPress={() => {
                onClose();
                onReact(null);
              }}
            >
              <Ionicons name="close" size={18} color="#8696A0" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {items.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={styles.row}
              onPress={() => {
                onClose();
                item.onPress();
              }}
              activeOpacity={0.7}
            >
              {item.icon}
              <Text style={[styles.rowLabel, item.danger && styles.rowLabelDanger]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
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
    paddingTop: 10,
    paddingHorizontal: 8,
  },
  emojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 4,
  },
  emojiBtn: {
    padding: 7,
  },
  emoji: {
    fontSize: 24,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 14,
  },
  rowLabel: {
    fontSize: 14.5,
    color: '#111B21',
    fontWeight: '600',
  },
  rowLabelDanger: {
    color: '#EF4444',
  },
});
