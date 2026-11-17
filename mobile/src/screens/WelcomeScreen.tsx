import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Image,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { WavixaLogo } from '../components/WavixaLogo';
import { Colors } from '../constants/theme';

interface WelcomeScreenProps {
  onContinue: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onContinue }) => {
  const { user, isAgent } = useAuth();

  // Auto navigate after 2.8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onContinue();
    }, 2800);
    return () => clearTimeout(timer);
  }, [onContinue]);

  const roleLabel = isAgent ? 'موظف خدمة العملاء' : 'مدير النظام';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Top Logo */}
        <View style={styles.logoWrap}>
          <WavixaLogo size="large" lightText />
        </View>

        {/* Center Welcome Card */}
        <View style={styles.card}>
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

          <Text style={styles.greeting}>مرحباً بك مجدداً 👋</Text>
          <Text style={styles.userName}>{user?.name || 'فريق Wavixa'}</Text>

          <View style={styles.roleBadge}>
            <MaterialCommunityIcons name="account-badge" size={15} color={Colors.primary} />
            <Text style={styles.roleText}>{roleLabel}</Text>
          </View>

          {user?.group_name ? (
            <Text style={styles.groupText}>مجموعة العمل: {user.group_name}</Text>
          ) : null}

          {isAgent && user?.max_active_chats ? (
            <View style={styles.quotaBox}>
              <Text style={styles.quotaText}>
                الحد الأقصى للمحادثات النشطة: {user.max_active_chats} محادثة
              </Text>
            </View>
          ) : null}

          <Text style={styles.subtext}>
            جاهز لمتابعة محادثات واستفسارات عملائك والرد عليها في الوقت الفعلي
          </Text>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={onContinue}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
            <Text style={styles.continueText}>الدخول إلى المحادثات</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.headerBg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  logoWrap: {
    marginBottom: 28,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: '#E8F8F5',
  },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#E8F8F5',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 28,
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
  greeting: {
    fontSize: 15,
    color: '#667781',
    fontWeight: '600',
    marginBottom: 4,
  },
  userName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'center',
    marginBottom: 10,
  },
  roleBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F8F5',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    marginBottom: 10,
  },
  roleText: {
    color: Colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  groupText: {
    fontSize: 12,
    color: '#54656F',
    fontWeight: '600',
    marginBottom: 10,
  },
  quotaBox: {
    backgroundColor: '#F8FAFB',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  quotaText: {
    fontSize: 11,
    color: '#54656F',
    fontWeight: '600',
  },
  subtext: {
    fontSize: 12.5,
    color: '#8696A0',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 14,
    height: 48,
    width: '100%',
    gap: 8,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
