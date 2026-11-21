import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

export interface GroupSender {
  phone: string | null;
  name: string | null;
  avatarUri?: string | null;
  color?: string;
}

interface GroupMemberSheetProps {
  member: GroupSender | null;
  onClose: () => void;
  /** Open the member's 1:1 conversation. */
  onMessage: (phone: string) => void;
}

/** WhatsApp-style group member card — tapping a sender's name/avatar in a
 *  group opens this sheet instead of jumping straight into a chat. */
export const GroupMemberSheet: React.FC<GroupMemberSheetProps> = ({
  member,
  onClose,
  onMessage,
}) => {
  const insets = useSafeAreaInsets();
  if (!member) return null;

  const title = member.name || (member.phone ? `+${member.phone}` : 'عضو الجروب');
  const subtitle = member.phone ? `+${member.phone}` : 'الرقم غير متاح';
  const initial = (title || 'ع').slice(0, 1).toUpperCase();
  const color = member.color || Colors.primary;

  const call = () => {
    if (!member.phone) return;
    Linking.openURL(`tel:+${member.phone}`).catch(() =>
      Alert.alert('فشل', 'تعذر فتح تطبيق الاتصال')
    );
  };

  const copyNumber = async () => {
    if (!member.phone) return;
    await Clipboard.setStringAsync(`+${member.phone}`).catch(() => {});
    Alert.alert('تم', 'اتنسخ الرقم');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <View style={[styles.card, { marginBottom: Math.max(insets.bottom, 16) + 60 }]}>
              {/* Profile head */}
              <View style={[styles.avatar, { backgroundColor: color }]}>
                {member.avatarUri ? (
                  <Image source={{ uri: member.avatarUri }} style={StyleSheet.absoluteFill} />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
              </View>
              <Text style={styles.name} numberOfLines={1}>{title}</Text>
              <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text>

              {/* Quick actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, !member.phone && styles.actionDisabled]}
                  onPress={() => member.phone && onMessage(member.phone)}
                  disabled={!member.phone}
                  activeOpacity={0.7}
                >
                  <Ionicons name="chatbubble-ellipses" size={22} color={Colors.primary} />
                  <Text style={styles.actionText}>مراسلة</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, !member.phone && styles.actionDisabled]}
                  onPress={call}
                  disabled={!member.phone}
                  activeOpacity={0.7}
                >
                  <Ionicons name="call" size={22} color={Colors.primary} />
                  <Text style={styles.actionText}>اتصال</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.divider} />

              {/* Menu rows */}
              <TouchableOpacity
                style={[styles.menuRow, !member.phone && styles.actionDisabled]}
                onPress={copyNumber}
                disabled={!member.phone}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="content-copy" size={20} color="#54656F" />
                <Text style={styles.menuText}>نسخ الرقم</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.menuRow, !member.phone && styles.actionDisabled]}
                onPress={() => member.phone && onMessage(member.phone)}
                disabled={!member.phone}
                activeOpacity={0.7}
              >
                <Ionicons name="information-circle-outline" size={22} color="#54656F" />
                <Text style={styles.menuText}>عرض محادثة العضو</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  card: {
    width: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    alignItems: 'center',
    paddingTop: 22,
    paddingBottom: 8,
    overflow: 'hidden',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  sub: {
    fontSize: 13,
    color: '#667781',
    marginTop: 3,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 14,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 26,
    borderRadius: 14,
    backgroundColor: '#F0F2F5',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111B21',
  },
  divider: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E2E8F0',
  },
  menuRow: {
    alignSelf: 'stretch',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  menuText: {
    fontSize: 14,
    color: '#111B21',
    fontWeight: '600',
  },
});
