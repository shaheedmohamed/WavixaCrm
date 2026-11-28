import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons, Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

interface ThreeDotMenuProps {
  visible: boolean;
  onClose: () => void;
  onOpenDevices?: () => void;
  onOpenQuickReplies?: () => void;
  onOpenArchived?: () => void;
  onOpenProfile?: () => void;
  onOpenNewChat?: () => void;
  onOpenStarred?: () => void;
  onOpenMediaLibrary?: () => void;
  onOpenStats?: () => void;
}

export const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({
  visible,
  onClose,
  onOpenDevices,
  onOpenQuickReplies,
  onOpenArchived,
  onOpenProfile,
  onOpenNewChat,
  onOpenStarred,
  onOpenMediaLibrary,
  onOpenStats,
}) => {
  const { user, logout, isAgent } = useAuth();

  const handleAction = (callback?: () => void) => {
    onClose();
    if (callback) {
      setTimeout(callback, 100);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.menuContainer}>
              {/* User Header */}
              <View style={styles.userSection}>
                <Text style={styles.userName} numberOfLines={1}>
                  {user?.name || 'موظف خدمة العملاء'}
                </Text>
                <Text style={styles.userRole}>
                  {isAgent ? 'موظف خدمة عملاء' : 'مدير النظام'}
                  {user?.group_name ? ` • ${user.group_name}` : ''}
                </Text>
                {isAgent && user?.max_active_chats ? (
                  <Text style={styles.workloadText}>
                    العبء: {user.active_chats || 0} من أصل {user.max_active_chats} محادثة
                  </Text>
                ) : null}
              </View>

              <View style={styles.divider} />

              {/* Menu items */}
              {onOpenNewChat && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenNewChat)}
                >
                  <MaterialCommunityIcons name="chat-plus-outline" size={20} color="#111B21" />
                  <Text style={styles.menuItemText}>محادثة جديدة</Text>
                </TouchableOpacity>
              )}

              {onOpenDevices && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenDevices)}
                >
                  <MaterialCommunityIcons name="cellphone-link" size={20} color="#111B21" />
                  <Text style={styles.menuItemText}>أجهزة الواتساب المتصلة</Text>
                </TouchableOpacity>
              )}

              {onOpenQuickReplies && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenQuickReplies)}
                >
                  <MaterialCommunityIcons name="flash-outline" size={20} color="#111B21" />
                  <Text style={styles.menuItemText}>الردود السريعة</Text>
                </TouchableOpacity>
              )}

              {onOpenStarred && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenStarred)}
                >
                  <Ionicons name="star-outline" size={20} color="#111B21" />
                  <Text style={styles.menuItemText}>الرسائل المميزة</Text>
                </TouchableOpacity>
              )}

              {onOpenMediaLibrary && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenMediaLibrary)}
                >
                  <MaterialCommunityIcons name="image-multiple-outline" size={20} color="#111B21" />
                  <Text style={styles.menuItemText}>مكتبة الوسائط</Text>
                </TouchableOpacity>
              )}

              {onOpenStats && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenStats)}
                >
                  <Ionicons name="bar-chart-outline" size={20} color="#111B21" />
                  <Text style={styles.menuItemText}>الإحصائيات</Text>
                </TouchableOpacity>
              )}

              {onOpenArchived && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenArchived)}
                >
                  <Feather name="archive" size={19} color="#111B21" />
                  <Text style={styles.menuItemText}>المحادثات المؤرشفة</Text>
                </TouchableOpacity>
              )}

              {onOpenProfile && (
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => handleAction(onOpenProfile)}
                >
                  <Ionicons name="person-outline" size={20} color="#111B21" />
                  <Text style={styles.menuItemText}>الملف الشخصي</Text>
                </TouchableOpacity>
              )}

              <View style={styles.divider} />

              {/* Logout */}
              <TouchableOpacity
                style={[styles.menuItem, styles.logoutItem]}
                onPress={() => handleAction(logout)}
              >
                <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
                <Text style={styles.logoutText}>تسجيل الخروج</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  menuContainer: {
    width: 240,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginTop: 50,
    marginLeft: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E9EDEF',
  },
  userSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFB',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    alignItems: 'flex-end',
  },
  userName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111B21',
  },
  userRole: {
    fontSize: 11,
    color: '#667781',
    marginTop: 2,
  },
  workloadText: {
    fontSize: 10.5,
    color: Colors.primary,
    fontWeight: '700',
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F2F5',
    marginVertical: 4,
  },
  menuItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemText: {
    fontSize: 13,
    color: '#111B21',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  logoutItem: {
    marginTop: 2,
  },
  logoutText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
});
