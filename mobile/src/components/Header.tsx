import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CareBotLogo } from './CareBotLogo';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

interface HeaderProps {
  onOpenMenu: () => void;
  onOpenProfile?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMenu, onOpenProfile }) => {
  const { user, isAgent } = useAuth();
  const insets = useSafeAreaInsets();

  const userInitial = user?.name ? user.name.trim().charAt(0).toUpperCase() : 'C';
  const topPad = Math.max(insets.top + 8, 16);

  return (
    <View style={[styles.header, { paddingTop: topPad }]}>
      <View style={styles.row}>
        {/* Right side (RTL): user avatar with online dot */}
        <View style={styles.rightSlot}>
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
        </View>

        {/* True optical center: CareBot icon + title */}
        <View style={styles.logoContainer}>
          <CareBotLogo size="medium" />
        </View>

        {/* Left side: workload pill + three-dot menu */}
        <View style={styles.leftSlot}>
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
            <MaterialCommunityIcons name="dots-vertical" size={23} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: Colors.headerBg,
    paddingHorizontal: 16,
    paddingBottom: 13,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rightSlot: {
    minWidth: 72,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  leftSlot: {
    minWidth: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#008069',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontWeight: '800',
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
  workloadBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  workloadText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
