import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../constants/theme';

interface GesturesGuideScreenProps {
  onBack: () => void;
}

/* A 0→1 looping clock every demo derives its phases from. Each card runs a
   single clock so the illustration reads as one continuous gesture. */
const useLoop = (duration = 2400) => {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [t, duration]);
  return t;
};

/** Semi-transparent touch indicator shared by every demo. */
const FingerDot: React.FC<{ style?: any }> = ({ style }) => (
  <Animated.View style={[demo.finger, style]} />
);

/* 1 ─ Swipe on a conversation → action buttons behind it */
const DemoRowSwipe = () => {
  const t = useLoop();
  const rowStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          t.value,
          [0, 0.18, 0.45, 0.68, 0.92, 1],
          [0, 0, -54, -54, 0, 0]
        ),
      },
    ],
  }));
  const actionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.2, 0.4, 0.62, 0.85], [0, 1, 1, 0]),
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.actionsRow, actionsStyle]}>
        <View style={[demo.actionSq, { backgroundColor: '#00A884' }]} />
        <View style={[demo.actionSq, { backgroundColor: '#F59E0B' }]} />
      </Animated.View>
      <Animated.View style={[demo.convRow, rowStyle]}>
        <View style={demo.miniAvatar} />
        <View style={demo.miniLines}>
          <View style={[demo.miniLine, { width: 34 }]} />
          <View style={[demo.miniLine, { width: 22, opacity: 0.45 }]} />
        </View>
      </Animated.View>
    </View>
  );
};

/* 2 ─ Two-finger (or edge) horizontal swipe flips the filter chips */
const DemoFilterSwipe = () => {
  const t = useLoop();
  const underline = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          t.value,
          [0, 0.3, 0.62, 0.95, 1],
          [0, -30, -60, -60, 0]
        ),
      },
    ],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          t.value,
          [0, 0.3, 0.62, 0.95, 1],
          [30, 0, -30, -30, 30]
        ),
      },
    ],
    opacity: interpolate(t.value, [0, 0.08, 0.85, 0.98], [0, 1, 1, 0]),
  }));
  return (
    <View style={demo.box}>
      <View style={demo.chipsRow}>
        {[2, 1, 0].map((i) => (
          <View key={i} style={demo.chip} />
        ))}
        <Animated.View style={[demo.chipUnderline, underline]} />
      </View>
      <FingerDot style={[demo.filterFinger, dotStyle]} />
    </View>
  );
};

/* 3 ─ Hold the mic, drag up to lock, drag in to cancel */
const DemoVoiceHold = () => {
  const t = useLoop();
  const dotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0, 0.15, 0.55, 0.8, 1], [18, 0, 0, -34, -34]) },
      { translateX: interpolate(t.value, [0, 0.55, 0.8, 1], [0, 0, 0, 24, 24]) },
      { scale: interpolate(t.value, [0, 0.15, 0.9, 1], [0.8, 1, 1, 0.8]) },
    ],
    opacity: interpolate(t.value, [0, 0.08, 0.92, 1], [0, 1, 1, 0]),
  }));
  const waveStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.15, 0.3, 0.85, 0.98], [0, 1, 1, 0]),
  }));
  const lockStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.55, 0.68], [0.25, 1]),
    transform: [{ scale: interpolate(t.value, [0.55, 0.72], [0.8, 1.05]) }],
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.lockIcon, lockStyle]}>
        <Ionicons name="lock-closed" size={13} color="#00A884" />
      </Animated.View>
      <Animated.View style={[demo.waveRow, waveStyle]}>
        {[7, 12, 9, 14, 8].map((h, i) => (
          <View key={i} style={[demo.waveBar, { height: h }]} />
        ))}
      </Animated.View>
      <View style={demo.micBtn}>
        <Ionicons name="mic" size={15} color="#FFFFFF" />
      </View>
      <FingerDot style={[demo.micFinger, dotStyle]} />
    </View>
  );
};

/* 4 ─ Double-tap a message → 👍 */
const DemoDoubleTap = () => {
  const t = useLoop();
  const rippleA = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.1, 0.3], [0.2, 1.5]) }],
    opacity: interpolate(t.value, [0.1, 0.3], [0.8, 0]),
  }));
  const rippleB = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.28, 0.48], [0.2, 1.5]) }],
    opacity: interpolate(t.value, [0.28, 0.48], [0.8, 0]),
  }));
  const likeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.4, 0.55, 0.9, 1], [0, 1.15, 1.15, 0]) }],
    opacity: interpolate(t.value, [0.4, 0.5, 0.88, 1], [0, 1, 1, 0]),
  }));
  return (
    <View style={demo.box}>
      <View style={demo.bubble} />
      <Animated.View style={[demo.ripple, rippleA]} />
      <Animated.View style={[demo.ripple, rippleB]} />
      <Animated.View style={[demo.likeBadge, likeStyle]}>
        <Ionicons name="thumbs-up" size={12} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
};

/* 5 ─ Swipe on a message → quick reply */
const DemoSwipeReply = () => {
  const t = useLoop();
  const rowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 0.2, 0.5, 0.7, 0.95, 1], [0, 0, 30, 30, 0, 0]) },
    ],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.2, 0.42, 0.6, 0.8], [0, 1, 1, 0]),
    transform: [{ translateX: interpolate(t.value, [0.2, 0.5], [10, -2]) }],
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.replyArrow, arrowStyle]}>
        <Ionicons name="arrow-undo" size={16} color="#00A884" />
      </Animated.View>
      <Animated.View style={[demo.bubble, { width: 56 }, rowStyle]} />
    </View>
  );
};

/* 6 ─ Long-press then drag → multi-select (+ edge auto-scroll) */
const DemoDragSelect = () => {
  const t = useLoop();
  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0.1, 0.75], [2, 46]) }],
    opacity: interpolate(t.value, [0, 0.08, 0.85, 1], [0, 1, 1, 0]),
  }));
  const check0 = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.16, 0.24], [0, 1]),
  }));
  const check1 = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.4, 0.48], [0, 1]),
  }));
  const check2 = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.64, 0.72], [0, 1]),
  }));
  const checks = [check0, check1, check2];
  return (
    <View style={demo.box}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={demo.selectRow}>
          <Animated.View style={[demo.checkDot, checks[i]]}>
            <Ionicons name="checkmark" size={8} color="#FFFFFF" />
          </Animated.View>
          <View style={demo.selectBar} />
        </View>
      ))}
      <FingerDot style={[demo.selectFinger, dotStyle]} />
    </View>
  );
};

/* 7 ─ Slide-to-confirm (destructive actions) */
const DemoSlideConfirm = () => {
  const t = useLoop();
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0.12, 0.55, 0.6, 0.72, 1], [0, -52, -52, 0, 0]) },
    ],
    opacity: interpolate(t.value, [0.6, 0.64, 0.72, 0.8], [1, 0, 0, 1]),
  }));
  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.2, 0.5, 0.75, 0.95], [1, 0.15, 0.15, 1]),
  }));
  return (
    <View style={demo.box}>
      <View style={demo.slideTrack}>
        <Animated.Text style={[demo.slideHint, hintStyle]}>اسحب</Animated.Text>
        <Animated.View style={[demo.slideThumb, thumbStyle]}>
          <Ionicons name="chevron-back" size={12} color="#00A884" />
        </Animated.View>
      </View>
    </View>
  );
};

/* 8 ─ Double-tap the chat header → jump to top */
const DemoHeaderTap = () => {
  const t = useLoop();
  const ripple = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.1, 0.32], [0.2, 1.6]) }],
    opacity: interpolate(t.value, [0.1, 0.32], [0.9, 0]),
  }));
  const listStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0.35, 0.7, 0.9, 1], [16, -4, -4, 16]) },
    ],
  }));
  return (
    <View style={demo.box}>
      <View style={demo.miniHeader}>
        <Animated.View style={[demo.ripple, { left: 30, top: 6 }, ripple]} />
      </View>
      <Animated.View style={[demo.miniList, listStyle]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[demo.miniLine, { width: 44 - i * 10, marginBottom: 4 }]} />
        ))}
      </Animated.View>
    </View>
  );
};

/* 9 ─ Amber dot on the notes icon = handover notes waiting */
const DemoNotesDot = () => {
  const t = useLoop(2000);
  const pulse = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0, 0.5, 1], [1, 1.45, 1]) }],
    opacity: interpolate(t.value, [0, 0.5, 1], [0.85, 1, 0.85]),
  }));
  return (
    <View style={[demo.box, { alignItems: 'center', justifyContent: 'center' }]}>
      <View style={demo.noteIconWrap}>
        <MaterialCommunityIcons name="note-text-outline" size={24} color="#54656F" />
        <Animated.View style={[demo.notesDot, pulse]} />
      </View>
    </View>
  );
};

/* 10 ─ Swipe left/right pages through the media gallery */
const DemoMediaPager = () => {
  const t = useLoop();
  const stripStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0, 0.35, 0.7, 0.9, 1], [0, -46, -46, -46, 0]) },
    ],
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.pagerStrip, stripStyle]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[demo.photoCard, { backgroundColor: ['#A7C7E7', '#B8E0C8', '#F3C4C4'][i] }]} />
        ))}
      </Animated.View>
    </View>
  );
};

/* 11 ─ Pull down → viewer closes */
const DemoSwipeDismiss = () => {
  const t = useLoop();
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(t.value, [0.15, 0.55, 0.75, 1], [0, 34, 34, 0]) },
      { scale: interpolate(t.value, [0.15, 0.55, 0.75, 1], [1, 0.85, 0.85, 1]) },
    ],
    opacity: interpolate(t.value, [0.15, 0.55, 0.78, 0.95], [1, 0.25, 0.25, 1]),
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.photoCard, { position: 'absolute', top: 10 }, cardStyle]} />
      <Ionicons name="arrow-down" size={14} color="#8696A0" style={{ position: 'absolute', bottom: 8 }} />
    </View>
  );
};

/* 12 ─ Story: right third = back, left = next; hold = pause */
const DemoStoryTap = () => {
  const t = useLoop();
  const barStyle = useAnimatedStyle(() => ({
    width: `${interpolate(t.value, [0.05, 0.75], [4, 96])}%`,
  }));
  const tapZone = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.3, 0.38, 0.5, 0.58], [0, 0.35, 0.35, 0]),
  }));
  return (
    <View style={demo.box}>
      <View style={demo.storyBar}>
        <Animated.View style={[demo.storyBarFill, barStyle]} />
      </View>
      <Animated.View style={[demo.storyTapZone, tapZone]} />
      <Ionicons name="chevron-back" size={12} color="#8696A0" style={{ position: 'absolute', left: 6 }} />
      <Ionicons name="chevron-forward" size={12} color="#8696A0" style={{ position: 'absolute', right: 6 }} />
    </View>
  );
};

/* 13 ─ Long-press a conversation → context menu */
const DemoLongPressMenu = () => {
  const t = useLoop();
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0, 0.2, 0.8, 0.92, 1], [1, 0.96, 0.96, 1, 1]) }],
  }));
  const menuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.3, 0.42, 0.85, 0.95], [0, 1, 1, 0]),
    transform: [{ scale: interpolate(t.value, [0.3, 0.45], [0.8, 1]) }],
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.convRow, { width: 80 }, rowStyle]}>
        <View style={demo.miniAvatar} />
        <View style={demo.miniLines}>
          <View style={[demo.miniLine, { width: 30 }]} />
        </View>
      </Animated.View>
      <Animated.View style={[demo.ctxMenu, menuStyle]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[demo.ctxItem, { width: 30 + i * 4 }]} />
        ))}
      </Animated.View>
    </View>
  );
};

/* 14 ─ Long-press an avatar → peek card */
const DemoAvatarPeek = () => {
  const t = useLoop();
  const cardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.25, 0.4, 0.8, 0.95], [0, 1, 1, 0]),
    transform: [
      { scale: interpolate(t.value, [0.25, 0.45], [0.7, 1]) },
      { translateY: interpolate(t.value, [0.25, 0.45], [8, 0]) },
    ],
  }));
  return (
    <View style={demo.box}>
      <View style={[demo.miniAvatar, { width: 26, height: 26 }]} />
      <Animated.View style={[demo.peekCard, cardStyle]}>
        <View style={[demo.miniAvatar, { width: 30, height: 30 }]} />
        <View style={[demo.miniLine, { width: 38, marginTop: 5 }]} />
        <View style={[demo.miniLine, { width: 26, marginTop: 3, opacity: 0.45 }]} />
      </Animated.View>
    </View>
  );
};

/* 15 ─ Long-press the chats tab → first unread */
const DemoNavLongPress = () => {
  const t = useLoop();
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.1, 0.45], [0.4, 1.6]) }],
    opacity: interpolate(t.value, [0.1, 0.45, 0.6], [0.9, 0.5, 0]),
  }));
  const badge = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.5, 0.62, 0.9, 1], [0, 1, 1, 0]) }],
    opacity: interpolate(t.value, [0.5, 0.58], [0, 1]),
  }));
  return (
    <View style={demo.box}>
      <View style={demo.navBarMini}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={demo.navIconWrap}>
            <View style={[demo.navIcon, i === 0 && { backgroundColor: '#00A884' }]} />
            {i === 0 && <Animated.View style={[demo.navRing, ring]} />}
            {i === 0 && (
              <Animated.View style={[demo.navBadge, badge]}>
                <Text style={demo.navBadgeText}>3</Text>
              </Animated.View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
};

/* 16 ─ Quick replies: flash icon inside the composer */
const DemoQuickReply = () => {
  const t = useLoop();
  const chipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.25, 0.38, 0.85, 0.98], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(t.value, [0.25, 0.38], [10, 0]) }],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.06, 0.18, 0.3], [1, 1.35, 1]) }],
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.qrChip, chipStyle]}>
        <View style={[demo.miniLine, { width: 34 }]} />
        <View style={[demo.miniLine, { width: 22, opacity: 0.45, marginTop: 4 }]} />
      </Animated.View>
      <View style={demo.composerMini}>
        <Animated.View style={flashStyle}>
          <MaterialCommunityIcons name="flash" size={12} color="#D97706" />
        </Animated.View>
        <View style={[demo.miniLine, { width: 34, opacity: 0.5 }]} />
      </View>
    </View>
  );
};

/* 17 ─ Pin a message → banner jumps you back to it */
const DemoPinBanner = () => {
  const t = useLoop();
  const bannerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.12, 0.26, 0.9, 1], [0, 1, 1, 0]),
    transform: [{ translateY: interpolate(t.value, [0.12, 0.26], [-9, 0]) }],
  }));
  const pinStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.04, 0.14, 0.9, 1], [0, 1, 1, 0]),
    transform: [{ rotate: `${interpolate(t.value, [0.04, 0.22], [-50, 0])}deg` }],
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.pinBanner, bannerStyle]}>
        <Animated.View style={pinStyle}>
          <Ionicons name="pin" size={9} color="#00A884" />
        </Animated.View>
        <View style={[demo.miniLine, { width: 46 }]} />
      </Animated.View>
      <View style={[demo.bubble, { position: 'absolute', bottom: 12, left: 25, width: 46, height: 20 }]} />
    </View>
  );
};

/* 18 ─ Tap the reaction count → who reacted & with what */
const DemoReactionInfo = () => {
  const t = useLoop();
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0.4, 0.56, 0.92, 1], [44, 0, 0, 44]) }],
  }));
  const tapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.16, 0.26, 0.34, 0.44], [0, 1, 1, 0]),
    transform: [{ scale: interpolate(t.value, [0.22, 0.3, 0.38], [0.5, 1.15, 0.5]) }],
  }));
  return (
    <View style={demo.box}>
      <View style={[demo.bubble, { position: 'absolute', top: 12, left: 22, width: 52, height: 24 }]} />
      <View style={demo.reactBadge}>
        <View style={[demo.reactDot, { backgroundColor: '#00A884' }]} />
        <View style={[demo.reactDot, { backgroundColor: '#E91E63', marginLeft: -4 }]} />
        <Text style={demo.reactCount}>2</Text>
      </View>
      <Animated.View style={[demo.reactTap, tapStyle]} />
      <Animated.View style={[demo.reactSheet, sheetStyle]}>
        {[0, 1].map((i) => (
          <View key={i} style={demo.reactRow}>
            <View style={[demo.miniAvatar, { width: 11, height: 11 }]} />
            <View style={[demo.miniLine, { flex: 1, height: 4 }]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

/* 19 ─ Per-chat wallpaper tint */
const DemoWallpaper = () => {
  const t = useLoop();
  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      t.value,
      [0, 0.35, 0.7, 1],
      ['#EAE6DF', '#DCEFD6', '#D8E5F2', '#EAE6DF']
    ),
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} />
      <View style={[demo.bubble, { position: 'absolute', top: 12, left: 10, width: 38, height: 15 }]} />
      <View
        style={[
          demo.bubble,
          { position: 'absolute', top: 33, right: 10, width: 48, height: 15, backgroundColor: '#D9FDD3' },
        ]}
      />
      <MaterialCommunityIcons
        name="format-paint"
        size={11}
        color="rgba(0,0,0,0.4)"
        style={{ position: 'absolute', bottom: 5, right: 6 }}
      />
    </View>
  );
};

/* 20 ─ Star a message → collected under the المميزة tab */
const DemoStar = () => {
  const t = useLoop();
  const starStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(t.value, [0.15, 0.32, 0.44, 0.9, 1], [0, 1.3, 1, 1, 0]) }],
    opacity: interpolate(t.value, [0.15, 0.24, 0.88, 1], [0, 1, 1, 0]),
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.3, 0.45, 0.8, 0.96], [0, 0.55, 0.55, 0]),
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.starGlow, glowStyle]} />
      <View style={[demo.bubble, { width: 56, height: 26 }]} />
      <Animated.View style={[demo.starBadge, starStyle]}>
        <Ionicons name="star" size={10} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
};

/* 21 ─ Forward a message into another chat */
const DemoForward = () => {
  const t = useLoop();
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(t.value, [0.15, 0.5], [20, -20]) },
      { translateY: interpolate(t.value, [0.15, 0.5], [-14, 12]) },
      { scale: interpolate(t.value, [0.15, 0.32, 0.5], [0, 1.15, 1]) },
    ],
    opacity: interpolate(t.value, [0.15, 0.24, 0.48, 0.6], [0, 1, 1, 0]),
  }));
  const targetStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.5, 0.62, 0.92, 1], [0.4, 1, 1, 0.4]),
  }));
  return (
    <View style={demo.box}>
      <View style={[demo.bubble, { position: 'absolute', top: 10, right: 12, width: 34, height: 16 }]} />
      <Animated.View
        style={[
          demo.bubble,
          { position: 'absolute', bottom: 10, left: 12, width: 34, height: 16, backgroundColor: '#D9FDD3' },
          targetStyle,
        ]}
      />
      <Animated.View style={[demo.fwdArrow, arrowStyle]}>
        <Ionicons name="arrow-redo" size={13} color="#00A884" />
      </Animated.View>
    </View>
  );
};

/* 22 ─ Multi-select conversations → bulk archive / add-to-list */
const DemoBulkSelect = () => {
  const t = useLoop();
  const c0 = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.14, 0.24], [0, 1]) }));
  const c1 = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.34, 0.44], [0, 1]) }));
  const checks = [c0, c1];
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(t.value, [0.55, 0.72, 0.95, 1], [26, 0, 0, 26]) }],
    opacity: interpolate(t.value, [0.55, 0.68, 0.92, 1], [0, 1, 1, 0]),
  }));
  return (
    <View style={demo.box}>
      {[0, 1].map((i) => (
        <View key={i} style={demo.selectRow}>
          <Animated.View style={[demo.checkDot, checks[i]]}>
            <Ionicons name="checkmark" size={8} color="#FFFFFF" />
          </Animated.View>
          <View style={demo.selectBar} />
        </View>
      ))}
      <Animated.View style={[demo.bulkBar, barStyle]}>
        <MaterialCommunityIcons name="archive-arrow-down-outline" size={11} color="#111B21" />
        <MaterialCommunityIcons name="playlist-plus" size={13} color="#00A884" />
      </Animated.View>
    </View>
  );
};

/* 23 ─ Mute for 8h / a week / forever */
const DemoMuteTimer = () => {
  const t = useLoop();
  const menuStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.14, 0.28, 0.85, 0.97], [0, 1, 1, 0]),
    transform: [{ scale: interpolate(t.value, [0.14, 0.3], [0.8, 1]) }],
  }));
  const bellOnStyle = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.5, 0.62], [1, 0.25]) }));
  const bellOffStyle = useAnimatedStyle(() => ({ opacity: interpolate(t.value, [0.5, 0.62], [0, 1]) }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.bellWrap, bellOnStyle]}>
        <Ionicons name="notifications" size={17} color="#54656F" />
      </Animated.View>
      <Animated.View style={[demo.bellWrap, bellOffStyle]}>
        <Ionicons name="notifications-off" size={17} color="#D97706" />
      </Animated.View>
      <Animated.View style={[demo.muteMenu, menuStyle]}>
        {['8س', 'أسبوع', '∞'].map((x) => (
          <View key={x} style={demo.muteOpt}>
            <Text style={demo.muteOptText}>{x}</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

/* 24 ─ Snooze → the chat leaves the inbox and returns on time */
const DemoSnooze = () => {
  const t = useLoop();
  const rowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.35, 0.55, 0.9, 1], [1, 0.35, 0.35, 1]),
    transform: [{ translateX: interpolate(t.value, [0.35, 0.55, 0.9, 1], [0, -12, -12, 0]) }],
  }));
  const clockStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.3, 0.42, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ scale: interpolate(t.value, [0.3, 0.46], [0.5, 1.15]) }],
  }));
  return (
    <View style={demo.box}>
      <Animated.View style={[demo.convRow, { width: 80 }, rowStyle]}>
        <View style={demo.miniAvatar} />
        <View style={demo.miniLines}>
          <View style={[demo.miniLine, { width: 30 }]} />
        </View>
      </Animated.View>
      <Animated.View style={[demo.snoozeClock, clockStyle]}>
        <Ionicons name="time" size={11} color="#FFFFFF" />
      </Animated.View>
    </View>
  );
};

/* 25 ─ Search narrows the list while you type */
const DemoSearch = () => {
  const t = useLoop();
  const typedStyle = useAnimatedStyle(() => ({
    width: `${interpolate(t.value, [0.05, 0.5, 0.95, 1], [8, 55, 55, 8])}%`,
  }));
  const rowBStyle = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0.45, 0.6, 0.9, 1], [1, 0.15, 0.15, 1]),
  }));
  return (
    <View style={demo.box}>
      <View style={demo.searchPill}>
        <Ionicons name="search" size={9} color="#8696A0" />
        <Animated.View style={[demo.searchTyped, typedStyle]} />
      </View>
      <View style={[demo.searchRow, { top: 30 }]}>
        <View style={[demo.miniAvatar, { width: 12, height: 12 }]} />
        <View style={demo.selectBar} />
      </View>
      <Animated.View style={[demo.searchRow, { top: 46 }, rowBStyle]}>
        <View style={[demo.miniAvatar, { width: 12, height: 12 }]} />
        <View style={demo.selectBar} />
      </Animated.View>
    </View>
  );
};

/* ─── Catalogue ─── */

type DemoComponent = React.FC;

interface GuideItem {
  id: string;
  title: string;
  desc: string;
  cue: string;
  cueIcon: keyof typeof Ionicons.glyphMap;
  Demo: DemoComponent;
}

interface GuideSection {
  id: string;
  title: string;
  accent: string;
  items: GuideItem[];
}

const SECTIONS: GuideSection[] = [
  {
    id: 'inbox',
    title: 'قائمة المحادثات',
    accent: '#00A884',
    items: [
      {
        id: 'row-swipe',
        title: 'اسحب المحادثة يمين أو شمال',
        desc: 'سحبة جزئية تفتح الأزرار، وسحبة كاملة تنفّذ أول أكشن: إنهاء/استلام/تأجيل من جهة، وتثبيت/غير مقروءة/كتم من التانية.',
        cue: 'اسحب يمين/شمال',
        cueIcon: 'swap-horizontal',
        Demo: DemoRowSwipe,
      },
      {
        id: 'filter-swipe',
        title: 'التنقل بين الفلاتر بالسحب',
        desc: 'اسحب أفقياً بصباعين في أي حتة، أو بصباعة واحدة على الفراغات — الكل/لي/غير معينة/المفضلة بتتقلب.',
        cue: 'اسحب أفقي',
        cueIcon: 'albums-outline',
        Demo: DemoFilterSwipe,
      },
      {
        id: 'conv-longpress',
        title: 'ضغطة مطوّلة على المحادثة',
        desc: 'قائمة الأكشنز الكاملة: رد سريع، تحويل، أرشفة، تثبيت، كتم، إضافة لقائمة مخصصة.',
        cue: 'دوس مطوّل',
        cueIcon: 'ellipsis-horizontal-circle-outline',
        Demo: DemoLongPressMenu,
      },
      {
        id: 'avatar-peek',
        title: 'ضغطة مطوّلة على الأفاتار',
        desc: 'معاينة سريعة لجهة الاتصال من غير ما تفتح الشات — مفيد لما تحب تتأكد مين اللي بيكلمك.',
        cue: 'دوس على الصورة',
        cueIcon: 'person-circle-outline',
        Demo: DemoAvatarPeek,
      },
    ],
  },
  {
    id: 'chat',
    title: 'داخل المحادثة',
    accent: '#1F70C1',
    items: [
      {
        id: 'voice-hold',
        title: 'تسجيل صوتي بإيد واحدة',
        desc: 'دوس مطوّل على المايك وارفع صباعك = إرسال. اسحب لفوق = قفل وكمّل براحتك. اسحب جوه = إلغاء.',
        cue: 'دوس + اسحب',
        cueIcon: 'mic-outline',
        Demo: DemoVoiceHold,
      },
      {
        id: 'double-tap-like',
        title: 'دوس مرتين على رسالة = 👍',
        desc: 'أسرع رد فعل ممكن — الضغطة المزدوجة تبعت 👍 فوراً من غير قوائم.',
        cue: 'دوس مرتين',
        cueIcon: 'thumbs-up-outline',
        Demo: DemoDoubleTap,
      },
      {
        id: 'swipe-reply',
        title: 'اسحب الرسالة للرد',
        desc: 'سحبة خفيفة على أي فقاعة — يمين أو شمال — تفتح الرد عليها فوراً بدل الضغطة المطوّلة.',
        cue: 'اسحب للرد',
        cueIcon: 'arrow-undo-outline',
        Demo: DemoSwipeReply,
      },
      {
        id: 'drag-select',
        title: 'تحديد جماعي بالسحب',
        desc: 'من "تحديد"، دوس مطوّل خفيف واسحب فوق الرسايل — والقايمة بتتحرك لوحدها لو وصلت لطرف الشاشة.',
        cue: 'دوس + اسحب فوق',
        cueIcon: 'checkmark-done-outline',
        Demo: DemoDragSelect,
      },
      {
        id: 'header-tap',
        title: 'دوس مرتين على الهيدر',
        desc: 'يرجعك لأعلى المحادثة فوراً بدل ما تظل تسكرول. الضغطة العادية لسه بتفتح بيانات جهة الاتصال.',
        cue: 'دوس مرتين فوق',
        cueIcon: 'arrow-up-circle-outline',
        Demo: DemoHeaderTap,
      },
      {
        id: 'notes-dot',
        title: 'النقطة البرتقاني = في ملاحظات',
        desc: 'لو زميل ساب ملاحظة على الشات، دوت صغيرة بتظهر على أيقونة النوت — اقرأها قبل ما ترد على العميل.',
        cue: 'راقب الأيقونة',
        cueIcon: 'alert-circle-outline',
        Demo: DemoNotesDot,
      },
      {
        id: 'slide-confirm',
        title: 'اسحب للإنهاء',
        desc: 'إنهاء المحادثة بقى سحبة متعمّدة مش ضغطة — مستحيل تنهي تيكيت بضغطة غلط.',
        cue: 'اسحب للتأكيد',
        cueIcon: 'checkmark-circle-outline',
        Demo: DemoSlideConfirm,
      },
    ],
  },
  {
    id: 'media',
    title: 'الوسائط والحالات',
    accent: '#7C3AED',
    items: [
      {
        id: 'media-pager',
        title: 'التقليب بين الصور والفيديوهات',
        desc: 'افتح أي صورة واسحب يمين أو شمال — كل وسائط المحادثة معرض واحد، والاتجاه بيطابق ترتيبها.',
        cue: 'اسحب يمين/شمال',
        cueIcon: 'images-outline',
        Demo: DemoMediaPager,
      },
      {
        id: 'media-dismiss',
        title: 'اسحب لتحت للقفل',
        desc: 'عارض الصور وعارض الحالات بيتقفلوا بسحبة لتحت — المحتوى بينزل ويفيد مع إيدك.',
        cue: 'اسحب لتحت',
        cueIcon: 'arrow-down-outline',
        Demo: DemoSwipeDismiss,
      },
      {
        id: 'story-tap',
        title: 'التنقل في الحالات',
        desc: 'دوس شمال الشاشة = الحالة اللي بعدها، يمين = اللي قبلها. دوس مطوّل = إيقاف مؤقت.',
        cue: 'دوس أو امسك',
        cueIcon: 'play-circle-outline',
        Demo: DemoStoryTap,
      },
    ],
  },
  {
    id: 'nav',
    title: 'التنقل السريع',
    accent: '#D97706',
    items: [
      {
        id: 'nav-longpress',
        title: 'ضغطة مطوّلة على التابات',
        desc: 'دوس مطوّل على "المحادثات" ياخدك لأول محادثة غير مقروءة فوراً — وعلى "المميزة" يفتح الرسايل المميزة.',
        cue: 'دوس مطوّل',
        cueIcon: 'star-half-outline',
        Demo: DemoNavLongPress,
      },
    ],
  },
  {
    id: 'chat-features',
    title: 'مميزات داخل المحادثة',
    accent: '#0891B2',
    items: [
      {
        id: 'quick-replies',
        title: 'الردود السريعة',
        desc: 'أيقونة البرق ⚡ جوه مربع الكتابة بتفتح ردودك المحفوظة — رد كامل بضغطة واحدة بدل ما تكتب نفس الكلام كل مرة.',
        cue: 'أيقونة ⚡ في الإدخال',
        cueIcon: 'flash-outline',
        Demo: DemoQuickReply,
      },
      {
        id: 'pin-message',
        title: 'تثبيت رسالة مهمة',
        desc: 'دوس مطوّل على أي رسالة → "تثبيت الرسالة". بتظهر كبانر فوق الشات — دوس عليه يوصلك ليها على طول.',
        cue: 'من قائمة الرسالة',
        cueIcon: 'pin-outline',
        Demo: DemoPinBanner,
      },
      {
        id: 'reaction-info',
        title: 'مين عمل رياكت؟',
        desc: 'دوس على عداد الرياكشنز تحت الرسالة — شيت بيوريك كل شخص حط إيه بالظبط، وتقدر تشيل رياكتك منه.',
        cue: 'دوس على العداد',
        cueIcon: 'people-outline',
        Demo: DemoReactionInfo,
      },
      {
        id: 'wallpaper',
        title: 'خلفية لكل محادثة',
        desc: 'من بيانات جهة الاتصال → خلفية المحادثة: اختار لون أو صورة للشات ده بس، أو خلفية موحدة للتطبيق كله.',
        cue: 'من بيانات جهة الاتصال',
        cueIcon: 'color-palette-outline',
        Demo: DemoWallpaper,
      },
      {
        id: 'forward',
        title: 'إعادة توجيه الرسايل',
        desc: 'أي رسالة تقدر تبعتها لمحادثة تانية — من "إعادة توجيه" في قائمة الرسالة، أو حدد كذا واحدة وابعتهم مع بعض.',
        cue: 'من قائمة الرسالة',
        cueIcon: 'arrow-redo-outline',
        Demo: DemoForward,
      },
      {
        id: 'star',
        title: 'تمييز بنجمة',
        desc: 'الرسايل المهمة متضيعش وسط الشغل — ميّزها بنجمة وارجع ليها كلها من تاب "المميزة" في أي وقت.',
        cue: 'من قائمة الرسالة',
        cueIcon: 'star-outline',
        Demo: DemoStar,
      },
    ],
  },
  {
    id: 'inbox-features',
    title: 'تنظيم البريد الوارد',
    accent: '#DB2777',
    items: [
      {
        id: 'bulk-select',
        title: 'تحديد عدة محادثات',
        desc: 'من قائمة المحادثة → "تحديد عدة محادثات" — أرشفة جماعية أو إضافة لقائمة مخصصة بضغطة واحدة.',
        cue: 'من قائمة المحادثة',
        cueIcon: 'layers-outline',
        Demo: DemoBulkSelect,
      },
      {
        id: 'mute-timer',
        title: 'كتم بمؤقت',
        desc: 'الكتم مش للأبد بس — اختار ٨ ساعات تغطي الدوام، أسبوع كامل، أو دائم. بيرجع لوحده لما المدة تخلص.',
        cue: 'دوس مطوّل → كتم',
        cueIcon: 'timer-outline',
        Demo: DemoMuteTimer,
      },
      {
        id: 'snooze',
        title: 'التأجيل',
        desc: 'شات مش محتاج رد دلوقتي؟ أجّله — بيختفي من الوارد ويرجع يظهر تاني في المعاد اللي تحدده بالظبط.',
        cue: 'من قائمة المحادثة',
        cueIcon: 'moon-outline',
        Demo: DemoSnooze,
      },
      {
        id: 'search',
        title: 'بحث فوري',
        desc: 'شريط البحث فوق الليستة بيلاقي المحادثة بالاسم أو الرقم — وبيدور جوه الرسايل نفسها كمان، والنتايج بتتحدث وأنت بتكتب.',
        cue: 'اكتب في البحث',
        cueIcon: 'search-outline',
        Demo: DemoSearch,
      },
    ],
  },
];

const GestureCard: React.FC<{ item: GuideItem; accent: string }> = ({ item, accent }) => (
  <View style={styles.card}>
    <View style={styles.cardText}>
      <View style={[styles.cueChip, { backgroundColor: `${accent}1A` }]}>
        <Ionicons name={item.cueIcon} size={11} color={accent} />
        <Text style={[styles.cueText, { color: accent }]}>{item.cue}</Text>
      </View>
      <Text style={styles.cardTitle}>{item.title}</Text>
      <Text style={styles.cardDesc}>{item.desc}</Text>
    </View>
    <View style={styles.demoWrap}>
      <item.Demo />
    </View>
  </View>
);

export const GesturesGuideScreen: React.FC<GesturesGuideScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const total = SECTIONS.reduce((n, s) => n + s.items.length, 0);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>الإيماءات والاختصارات</Text>
          <Text style={styles.headerSub}>
            {total} اختصار وميزة توفّر وقتك كل يوم — شوفهم وهما بيتحركوا
          </Text>
        </View>
        <MaterialCommunityIcons name="gesture-swipe-horizontal" size={26} color="rgba(255,255,255,0.75)" />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {SECTIONS.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: section.accent }]} />
              <Text style={[styles.sectionTitle, { color: section.accent }]}>
                {section.title}
              </Text>
              <Text style={styles.sectionCount}>{section.items.length}</Text>
            </View>
            {section.items.map((item) => (
              <GestureCard key={item.id} item={item} accent={section.accent} />
            ))}
          </View>
        ))}

        <View style={styles.footer}>
          <Ionicons name="bulb-outline" size={15} color="#8696A0" />
          <Text style={styles.footerText}>
            كل الإيماءات شغالة على الـ UI thread — حاسس ببطء؟ بلغ الإدارة على طول.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

/* ─── shared demo shapes ─── */
const demo = StyleSheet.create({
  box: {
    width: 96,
    height: 78,
    borderRadius: 12,
    backgroundColor: '#ECEFF1',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  finger: {
    position: 'absolute',
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: 'rgba(17, 27, 33, 0.35)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    zIndex: 30,
  },
  convRow: {
    position: 'absolute',
    left: 6,
    right: 6,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 7,
    gap: 6,
    zIndex: 5,
  },
  actionsRow: {
    position: 'absolute',
    right: 6,
    height: 34,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  actionSq: {
    width: 24,
    height: 34,
    borderRadius: 7,
  },
  miniAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C4CED4',
  },
  miniLines: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-end',
  },
  miniLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#B7C2C8',
  },
  chipsRow: {
    position: 'absolute',
    top: 12,
    flexDirection: 'row-reverse',
    gap: 6,
  },
  chip: {
    width: 24,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C4CED4',
  },
  chipUnderline: {
    position: 'absolute',
    bottom: -5,
    right: 0,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#00A884',
  },
  lockIcon: {
    position: 'absolute',
    top: 6,
    left: 40,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveRow: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    gap: 2.5,
    alignItems: 'center',
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#00A884',
  },
  micBtn: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    width: 62,
    height: 26,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 2,
  },
  ripple: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(0, 168, 132, 0.7)',
  },
  likeBadge: {
    position: 'absolute',
    bottom: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyArrow: {
    position: 'absolute',
    left: 8,
    zIndex: 1,
  },
  selectRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
    paddingHorizontal: 8,
    width: '100%',
  },
  checkDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  selectFinger: {
    top: 8,
    left: 30,
  },
  filterFinger: {
    bottom: 12,
    left: 40,
  },
  micFinger: {
    bottom: 12,
    left: 10,
  },
  slideTrack: {
    width: 80,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#00A884',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 3,
    overflow: 'hidden',
  },
  slideHint: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  slideThumb: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#0B4D3C',
  },
  miniList: {
    position: 'absolute',
    top: 26,
    right: 12,
    alignItems: 'flex-end',
  },
  noteIconWrap: {
    position: 'relative',
  },
  notesDot: {
    position: 'absolute',
    top: -3,
    right: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  pagerStrip: {
    position: 'absolute',
    left: 8,
    flexDirection: 'row',
    gap: 8,
  },
  photoCard: {
    width: 38,
    height: 46,
    borderRadius: 8,
  },
  storyBar: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
    overflow: 'hidden',
  },
  storyBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  storyTapZone: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  ctxMenu: {
    position: 'absolute',
    right: 6,
    top: 26,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 5,
    gap: 4,
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  ctxItem: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#B7C2C8',
  },
  peekCard: {
    position: 'absolute',
    left: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  navBarMini: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 30,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  navIconWrap: {
    position: 'relative',
  },
  navIcon: {
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#C4CED4',
  },
  navRing: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#00A884',
  },
  navBadge: {
    position: 'absolute',
    top: -6,
    right: -9,
    minWidth: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  navBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  qrChip: {
    position: 'absolute',
    top: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 6,
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: '#BFE5D8',
  },
  composerMini: {
    position: 'absolute',
    bottom: 10,
    left: 8,
    right: 8,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 7,
    gap: 5,
  },
  pinBanner: {
    position: 'absolute',
    top: 6,
    left: 8,
    right: 8,
    height: 15,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 6,
    gap: 5,
    borderRightWidth: 2,
    borderRightColor: '#00A884',
  },
  reactBadge: {
    position: 'absolute',
    top: 30,
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    gap: 2,
    elevation: 1,
  },
  reactDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  reactCount: {
    fontSize: 8,
    fontWeight: '800',
    color: '#54656F',
  },
  reactTap: {
    position: 'absolute',
    top: 27,
    left: 14,
    width: 34,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(0,168,132,0.7)',
  },
  reactSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    padding: 6,
    gap: 5,
  },
  reactRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  starGlow: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FDE68A',
  },
  starBadge: {
    position: 'absolute',
    right: 16,
    top: 44,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fwdArrow: {
    position: 'absolute',
    top: 32,
    left: 41,
  },
  bulkBar: {
    position: 'absolute',
    bottom: 6,
    left: 14,
    right: 14,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    elevation: 2,
  },
  bellWrap: {
    position: 'absolute',
    left: 16,
    top: 30,
  },
  muteMenu: {
    position: 'absolute',
    right: 8,
    top: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 5,
    gap: 4,
    elevation: 2,
  },
  muteOpt: {
    borderRadius: 5,
    backgroundColor: '#ECEFF1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignItems: 'center',
  },
  muteOptText: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#54656F',
  },
  snoozeClock: {
    position: 'absolute',
    top: 16,
    right: 10,
    width: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ECEFF1',
  },
  searchPill: {
    position: 'absolute',
    top: 8,
    left: 6,
    right: 6,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 6,
    gap: 4,
  },
  searchTyped: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#54656F',
  },
  searchRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.headerBg,
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11.5,
    marginTop: 3,
    textAlign: 'right',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 10,
    gap: 7,
  },
  sectionAccent: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8696A0',
    backgroundColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row-reverse',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    gap: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  cardText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  cueChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 6,
  },
  cueText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#111B21',
    textAlign: 'right',
  },
  cardDesc: {
    fontSize: 11.5,
    color: '#54656F',
    textAlign: 'right',
    lineHeight: 17,
    marginTop: 4,
  },
  demoWrap: {
    width: 96,
  },
  footer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  footerText: {
    fontSize: 11,
    color: '#8696A0',
  },
});
