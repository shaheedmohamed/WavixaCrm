import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';
import { Config } from '../constants/config';
import { chatPrefs } from '../services/chatPrefs';

interface ProfileScreenProps {
  onBack: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ onBack }) => {
  const { user, logout, isAgent } = useAuth();
  const insets = useSafeAreaInsets();
  const [groupsInChats, setGroupsInChats] = useState(() => chatPrefs.isGroupsInChats());

  const handleLogout = () => {
    Alert.alert('تسجيل الخروج', 'هل تريد بالتأكيد تسجيل الخروج من التطبيق؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تسجيل الخروج', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.safeArea}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الملف الشخصي والإعدادات</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 20, 24) }}>
        {/* Profile Card */}
        <View style={styles.userCard}>
          <View style={styles.avatarWrap}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'W'}
                </Text>
              </View>
            )}
            <View style={styles.onlineDot} />
          </View>

          <Text style={styles.userName}>{user?.name || 'موظف CRM'}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {isAgent ? 'موظف خدمة عملاء' : 'مدير النظام'}
            </Text>
          </View>
        </View>

        {/* Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>بيانات الحساب والصلاحيات</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>{user?.id || '-'}</Text>
            <Text style={styles.infoLabel}>معرّف الموظف (ID):</Text>
          </View>

          {user?.group_name ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>{user.group_name}</Text>
              <Text style={styles.infoLabel}>المجموعة / الفريق:</Text>
            </View>
          ) : null}

          {isAgent && user?.max_active_chats ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoValue}>
                {user.active_chats || 0} من {user.max_active_chats} محادثة
              </Text>
              <Text style={styles.infoLabel}>عبء المحادثات النشطة:</Text>
            </View>
          ) : null}

          <View style={styles.infoRow}>
            <Text style={styles.infoValue}>{Config.appVersion}</Text>
            <Text style={styles.infoLabel}>إصدار التطبيق:</Text>
          </View>
        </View>

        {/* Display Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>إعدادات العرض</Text>

          <View style={styles.actionRow}>
            <Switch
              value={groupsInChats}
              onValueChange={(v) => {
                setGroupsInChats(v);
                chatPrefs.setGroupsInChats(v);
              }}
              trackColor={{ false: '#D1D5DB', true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
            <View style={styles.actionRight}>
              <Text style={styles.actionText}>إظهار المجموعات ضمن الشاتات</Text>
              <MaterialCommunityIcons
                name="account-group-outline"
                size={20}
                color={Colors.primary}
              />
            </View>
          </View>
          <Text style={styles.settingHint}>
            لما يتفعل، محادثات المجموعات تظهر جوه فلتر الشاتات بدل فلتر منفصل
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Alert.alert('Wavixa', 'تطبيق موظفي خدمة العملاء لنظام Wavixa')}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color="#8696A0" />
            <View style={styles.actionRight}>
              <Text style={styles.actionText}>عن تطبيق Wavixa</Text>
              <Ionicons name="information-circle-outline" size={20} color={Colors.primary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionRow, { borderBottomWidth: 0 }]}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={18} color="#EF4444" />
            <View style={styles.actionRight}>
              <Text style={[styles.actionText, { color: '#EF4444' }]}>تسجيل الخروج</Text>
              <MaterialCommunityIcons name="logout" size={20} color="#EF4444" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.headerBg,
  },
  header: {
    backgroundColor: Colors.headerBg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  userCard: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 10,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#25D366',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111B21',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 12.5,
    color: '#667781',
    marginBottom: 10,
  },
  badge: {
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: Colors.primaryDark,
    fontSize: 11.5,
    fontWeight: '700',
  },
  section: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8696A0',
    marginBottom: 10,
    textAlign: 'right',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F5',
  },
  infoLabel: {
    fontSize: 13,
    color: '#54656F',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    color: '#111B21',
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F2F5',
  },
  actionRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  actionText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#111B21',
  },
  settingHint: {
    fontSize: 11.5,
    color: '#8696A0',
    textAlign: 'right',
    marginTop: 6,
    lineHeight: 17,
  },
});
