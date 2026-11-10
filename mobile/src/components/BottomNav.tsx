import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons, Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

export type BottomTabType = 'chats' | 'filters' | 'stats' | 'settings';

interface BottomNavProps {
  activeTab: BottomTabType;
  onTabPress: (tab: BottomTabType) => void;
  onNewChatPress: () => void;
  totalUnread?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabPress,
  onNewChatPress,
  totalUnread = 0,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 6);

  return (
    <View style={[styles.navBar, { paddingBottom: bottomInset, height: 58 + insets.bottom }]}>
      {/* 1. Chats (Rightmost in RTL) */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('chats')}
        activeOpacity={0.7}
      >
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name={activeTab === 'chats' ? 'chat' : 'chat-outline'}
            size={22}
            color={activeTab === 'chats' ? Colors.primary : '#8696A0'}
          />
          {totalUnread > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>
                {totalUnread > 99 ? '99+' : totalUnread}
              </Text>
            </View>
          )}
        </View>
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'chats' && styles.tabLabelActive,
          ]}
        >
          المحادثات
        </Text>
        {activeTab === 'chats' && <View style={styles.activeIndicator} />}
      </TouchableOpacity>

      {/* 2. Filters */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('filters')}
        activeOpacity={0.7}
      >
        <Feather
          name="filter"
          size={20}
          color={activeTab === 'filters' ? Colors.primary : '#8696A0'}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'filters' && styles.tabLabelActive,
          ]}
        >
          الفلاتر
        </Text>
        {activeTab === 'filters' && <View style={styles.activeIndicator} />}
      </TouchableOpacity>

      {/* 3. Center Floating Action Button (New Chat) */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={onNewChatPress}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="chat-plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* 4. Stats */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('stats')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={activeTab === 'stats' ? 'bar-chart' : 'bar-chart-outline'}
          size={20}
          color={activeTab === 'stats' ? Colors.primary : '#8696A0'}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'stats' && styles.tabLabelActive,
          ]}
        >
          الإحصائيات
        </Text>
        {activeTab === 'stats' && <View style={styles.activeIndicator} />}
      </TouchableOpacity>

      {/* 5. Settings */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('settings')}
        activeOpacity={0.7}
      >
        <Ionicons
          name={activeTab === 'settings' ? 'settings-sharp' : 'settings-outline'}
          size={21}
          color={activeTab === 'settings' ? Colors.primary : '#8696A0'}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'settings' && styles.tabLabelActive,
          ]}
        >
          الإعدادات
        </Text>
        {activeTab === 'settings' && <View style={styles.activeIndicator} />}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F2F5',
    paddingVertical: 5,
    paddingHorizontal: 8,
    position: 'relative',
    height: 58,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  iconWrap: {
    position: 'relative',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#25D366',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  tabLabel: {
    fontSize: 10.5,
    color: '#8696A0',
    marginTop: 2,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -5,
    width: 24,
    height: 2.5,
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  fabContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    top: -14,
    marginHorizontal: 4,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});
