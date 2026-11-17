import React from 'react';
import { StyleSheet, Vibration, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Message } from '../types/crm';
import { Colors } from '../constants/theme';

interface SwipeableMessageRowProps {
  message: Message;
  onSwipeReply: (message: Message) => void;
  highlighted?: boolean;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 52;
const MAX_TRANSLATE = 80;

const vibrateTick = () => {
  try {
    Vibration.vibrate(12);
  } catch {}
};

const SwipeableMessageRowComponent: React.FC<SwipeableMessageRowProps> = ({
  message,
  onSwipeReply,
  highlighted = false,
  children,
}) => {
  const translateX = useSharedValue(0);
  const triggered = useSharedValue(false);

  const pan = Gesture.Pan()
    // Activate only for clearly-horizontal drags so the vertical
    // FlatList keeps full priority — the WhatsApp conflict rule.
    .activeOffsetX([-16, 16])
    .failOffsetY([-18, 18])
    .onUpdate((e) => {
      'worklet';
      const raw = e.translationX;
      const sign = raw >= 0 ? 1 : -1;
      const abs = Math.abs(raw);
      const damped =
        abs <= SWIPE_THRESHOLD
          ? abs * 0.9
          : SWIPE_THRESHOLD * 0.9 + (abs - SWIPE_THRESHOLD) * 0.3;
      translateX.value = sign * Math.min(MAX_TRANSLATE, damped);

      if (abs >= SWIPE_THRESHOLD && !triggered.value) {
        triggered.value = true;
        runOnJS(vibrateTick)();
      } else if (abs < SWIPE_THRESHOLD * 0.68 && triggered.value) {
        triggered.value = false;
      }
    })
    .onEnd(() => {
      'worklet';
      const shouldFire = triggered.value;
      triggered.value = false;
      translateX.value = withSpring(0, {
        damping: 20,
        stiffness: 320,
        mass: 0.7,
        overshootClamping: true,
      });
      if (shouldFire) {
        runOnJS(onSwipeReply)(message);
      }
    })
    .onFinalize(() => {
      'worklet';
      if (translateX.value !== 0) {
        translateX.value = withSpring(0, {
          damping: 20,
          stiffness: 320,
          mass: 0.7,
          overshootClamping: true,
        });
      }
      triggered.value = false;
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const rightBadgeStyle = useAnimatedStyle(() => {
    const op = interpolate(
      translateX.value,
      [-MAX_TRANSLATE, -18, 0],
      [1, 0.2, 0],
      'clamp'
    );
    const sc = interpolate(
      translateX.value,
      [-MAX_TRANSLATE, -SWIPE_THRESHOLD, 0],
      [1.06, 0.95, 0.4],
      'clamp'
    );
    return { opacity: op, transform: [{ scale: sc }] };
  });

  const leftBadgeStyle = useAnimatedStyle(() => {
    const op = interpolate(
      translateX.value,
      [0, 18, MAX_TRANSLATE],
      [0, 0.2, 1],
      'clamp'
    );
    const sc = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD, MAX_TRANSLATE],
      [0.4, 0.95, 1.06],
      'clamp'
    );
    return { opacity: op, transform: [{ scale: sc }] };
  });

  return (
    <View style={[styles.wrapper, highlighted && styles.wrapperHighlighted]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.replyBadge, styles.replyBadgeLeft, leftBadgeStyle]}
      >
        <Ionicons name="arrow-undo" size={16} color={Colors.primaryDark} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[styles.replyBadge, styles.replyBadgeRight, rightBadgeStyle]}
      >
        <Ionicons name="arrow-undo" size={16} color={Colors.primaryDark} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle} collapsable={false}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  wrapperHighlighted: {
    backgroundColor: 'rgba(0, 168, 132, 0.18)',
    borderRadius: 8,
  },
  replyBadge: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
  },
  replyBadgeLeft: {
    left: 14,
  },
  replyBadgeRight: {
    right: 14,
  },
});

export const SwipeableMessageRow = React.memo(SwipeableMessageRowComponent);
