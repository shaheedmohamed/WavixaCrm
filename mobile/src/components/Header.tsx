import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WavixaLogo } from './WavixaLogo';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

interface HeaderProps {
  onOpenMenu: () => void;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMenu, onOpenProfile }) => {
  const { user, isAgent } = useAuth();
  const insets = useSafeAreaInsets();

  const userInitial = user?.name ? user.name.trim().charAt(0).toUpperCase() : 'U';

  return (
    <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
      {/* Right side (RTL layout: user avatar with online dot) */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onOpenProfile || onOpenMenu}
        style={styles.avatarWrap}
      >
        {user?.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>{userInitial}</Text>
          </View>
        )}
        <View style={styles.onlineDot} />
      </TouchableOpacity>

      {/* Center: Wavixa CRM Logo */}
      <View style={styles.logoContainer}>
        <WavixaLogo size="medium" />
      </View>

      {/* Left side: Three-dot action menu */}
      <View style={styles.leftActions}>
        {isAgent && user?.max_active_chats ? (
          <View style={styles.workloadBadge}>
            <Text style={styles.workloadText}>
              {user.active_chats || 0}/{user.max_active_chats}
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onOpenMenu}
          style={styles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="dots-vertical" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.headerBg,
    flexDirection: 'row-reverse', // RTL alignment
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#008069',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  onlineDot: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#25D366',
    borderWidth: 2,
    borderColor: Colors.headerBg,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  workloadBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  workloadText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  iconButton: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
