import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../constants/theme';

export type BottomTabType = 'chats' | 'statuses' | 'starred' | 'shortcuts' | 'settings';

/* Pulsing halo drawn around the tab's icon so the bubble's target is obvious. */
const GuideHintRing: React.FC = () => {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
    return () => cancelAnimation(t);
  }, [t]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.7, 1], [0.75, 0.2, 0]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.55, 1.45]) }],
  }));
  return <Animated.View style={[styles.hintRing, ringStyle]} pointerEvents="none" />;
};

/* Onboarding coachmark floating above the shortcuts tab — pops in with a
   spring, then floats up/down in a loop until the guide has been opened once. */
const GuideHintBubble: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const intro = useSharedValue(0);
  const bob = useSharedValue(0);
  useEffect(() => {
    intro.value = withSpring(1, { damping: 10, stiffness: 150, mass: 0.8 });
    const kickoff = setTimeout(() => {
      bob.value = withRepeat(
        withTiming(-6, { duration: 950, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    }, 400);
    return () => {
      clearTimeout(kickoff);
      cancelAnimation(intro);
      cancelAnimation(bob);
    };
  }, [intro, bob]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [
      { translateY: interpolate(intro.value, [0, 1], [14, 0]) + bob.value },
      { scale: interpolate(intro.value, [0, 1], [0.55, 1]) },
    ],
  }));
  return (
    <Animated.View style={[styles.guideBubble, animStyle]} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.guideBubbleCard}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View style={styles.guideBubbleIcon}>
          <MaterialCommunityIcons name="gesture-swipe" size={13} color="#FFFFFF" />
        </View>
        <View style={styles.guideBubbleTexts}>
          <Text style={styles.guideBubbleTitle}>اختصارات التطبيق</Text>
          <Text style={styles.guideBubbleSub}>دوس هنا وشوف كل الحركات</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.guideBubbleTail} />
    </Animated.View>
  );
};

interface BottomNavProps {
  activeTab: BottomTabType;
  onTabPress: (tab: BottomTabType) => void;
  // Long-press shortcuts — chats jumps to the first unread conversation,
  // starred opens the starred screen.
  onTabLongPress?: (tab: BottomTabType) => void;
  onNewChatPress: () => void;
  totalUnread?: number;
  showStatuses?: boolean;
  // Shows the floating hint bubble over the shortcuts tab until the guide
  // screen has been opened at least once.
  guideHintVisible?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabPress,
  onTabLongPress,
  onNewChatPress,
  totalUnread = 0,
  showStatuses = false,
  guideHintVisible = false,
}) => {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 6);

  return (
    <View style={[styles.navBar, { paddingBottom: bottomInset, height: 58 + insets.bottom }]}>
      {/* 1. Chats (Rightmost in RTL) */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('chats')}
        onLongPress={() => onTabLongPress?.('chats')}
        delayLongPress={350}
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

      {/* 2. Statuses (WhatsApp stories) — demo account only for now */}
      {showStatuses && (
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('statuses')}
        onLongPress={() => onTabLongPress?.('statuses')}
        delayLongPress={350}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name={activeTab === 'statuses' ? 'circle-double' : 'circle-double'}
          size={21}
          color={activeTab === 'statuses' ? Colors.primary : '#8696A0'}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'statuses' && styles.tabLabelActive,
          ]}
        >
          الحالة
        </Text>
        {activeTab === 'statuses' && <View style={styles.activeIndicator} />}
      </TouchableOpacity>
      )}

      {/* 3. Starred messages */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('starred')}
        onLongPress={() => onTabLongPress?.('starred')}
        delayLongPress={350}
        activeOpacity={0.7}
      >
        <Ionicons
          name={activeTab === 'starred' ? 'star' : 'star-outline'}
          size={21}
          color={activeTab === 'starred' ? Colors.primary : '#8696A0'}
        />
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'starred' && styles.tabLabelActive,
          ]}
        >
          المميزة
        </Text>
        {activeTab === 'starred' && <View style={styles.activeIndicator} />}
      </TouchableOpacity>

      {/* 4. Center Floating Action Button (New Chat) */}
      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={styles.fab}
          onPress={onNewChatPress}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="chat-plus" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* 5. Gestures & shortcuts guide */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('shortcuts')}
        onLongPress={() => onTabLongPress?.('shortcuts')}
        delayLongPress={350}
        activeOpacity={0.7}
      >
        <View style={styles.tabIconWrap}>
          <MaterialCommunityIcons
            name="gesture-swipe"
            size={21}
            color={activeTab === 'shortcuts' || guideHintVisible ? Colors.primary : '#8696A0'}
          />
          {guideHintVisible && <GuideHintRing />}
        </View>
        <Text
          style={[
            styles.tabLabel,
            activeTab === 'shortcuts' && styles.tabLabelActive,
          ]}
        >
          اختصارات
        </Text>
        {activeTab === 'shortcuts' && <View style={styles.activeIndicator} />}
        {guideHintVisible && (
          <GuideHintBubble onPress={() => onTabPress('shortcuts')} />
        )}
      </TouchableOpacity>

      {/* 6. Settings */}
      <TouchableOpacity
        style={styles.tabItem}
        onPress={() => onTabPress('settings')}
        onLongPress={() => onTabLongPress?.('settings')}
        delayLongPress={350}
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
  tabIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintRing: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 34,
    height: 34,
    marginTop: -17,
    marginLeft: -17,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  guideBubble: {
    position: 'absolute',
    top: -70,
    alignItems: 'center',
    zIndex: 40,
    elevation: 14,
  },
  guideBubbleCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.headerBg,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 14,
  },
  guideBubbleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideBubbleTexts: {
    alignItems: 'flex-end',
  },
  guideBubbleTitle: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  guideBubbleSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9.5,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 1,
  },
  guideBubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.headerBg,
    marginTop: -1,
  },
});
