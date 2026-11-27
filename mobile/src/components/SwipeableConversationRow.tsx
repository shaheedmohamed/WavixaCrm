/* eslint-disable react-hooks/immutability --
   Reanimated shared values (translateX, swipeLock) are mutated inside gesture
   worklets by design; the React-Compiler immutability rule can't model that. */
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  Vibration,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

export interface ConvSwipeAction {
  key: string;
  label: string;
  icon: string;
  iconSet?: 'ion' | 'mci';
  color?: string;
  bg?: string;
  onPress: () => void;
}

interface SwipeableConversationRowProps {
  // Revealed on the LEFT screen edge — user drags the row to the right.
  leftActions: ConvSwipeAction[];
  // Revealed on the RIGHT screen edge — user drags the row to the left.
  // The first entry doubles as the full-swipe commit action.
  rightActions: ConvSwipeAction[];
  disabled?: boolean;
  // Owned by the parent screen: while a row owns a horizontal swipe the
  // container's filter-switch gesture must stay out of the way.
  swipeLock?: SharedValue<number>;
  children: React.ReactNode;
}

const ACTION_W = 78;
const OPEN_MIN = 46;
const COMMIT_FRACTION = 0.58;
const SPRING = { damping: 22, stiffness: 340, mass: 0.7, overshootClamping: true };

const tick = () => {
  try {
    Vibration.vibrate(12);
  } catch {}
};

const fireAction = (a: ConvSwipeAction) => {
  try {
    a.onPress();
  } catch {}
};

const ActionButton: React.FC<{ action: ConvSwipeAction; onPress: () => void }> = ({
  action,
  onPress,
}) => (
  <TouchableOpacity
    style={[styles.actionBtn, { backgroundColor: action.bg || '#F0F2F5' }]}
    onPress={onPress}
    activeOpacity={0.82}
  >
    {action.iconSet === 'mci' ? (
      <MaterialCommunityIcons
        name={action.icon as never}
        size={20}
        color={action.color || '#54656F'}
      />
    ) : (
      <Ionicons name={action.icon as never} size={20} color={action.color || '#54656F'} />
    )}
    <Text style={[styles.actionLabel, { color: action.color || '#54656F' }]} numberOfLines={1}>
      {action.label}
    </Text>
  </TouchableOpacity>
);

const SwipeableConversationRowComponent: React.FC<SwipeableConversationRowProps> = ({
  leftActions,
  rightActions,
  disabled = false,
  swipeLock,
  children,
}) => {
  const { width: screenW } = useWindowDimensions();
  const commitDist = screenW * COMMIT_FRACTION;

  const leftW = leftActions.length * ACTION_W;
  const rightW = rightActions.length * ACTION_W;

  const translateX = useSharedValue(0);
  const startX = useSharedValue(0);
  const tickDone = useSharedValue(false);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    translateX.value = withSpring(0, SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = Gesture.Pan()
    .enabled(!disabled)
    // Single finger only — a two-finger horizontal drag is reserved for the
    // container's filter-tab switch and must never claim a row.
    .maxPointers(1)
    // Only clearly-horizontal drags — the vertical FlatList keeps priority.
    .activeOffsetX([-15, 15])
    .failOffsetY([-16, 16])
    .onStart(() => {
      'worklet';
      startX.value = translateX.value;
      tickDone.value = false;
      if (swipeLock) swipeLock.value = 1;
    })
    .onUpdate((e) => {
      'worklet';
      let raw = startX.value + e.translationX;
      // Rubber-band past the reveal width so the row never flies off.
      if (raw > leftW) raw = leftW + (raw - leftW) * 0.22;
      if (raw < -rightW) raw = -rightW + (raw + rightW) * 0.22;
      if (leftW === 0 && raw > 0) raw *= 0.3;
      if (rightW === 0 && raw < 0) raw *= 0.3;
      translateX.value = raw;

      if (!tickDone.value && Math.abs(raw) > commitDist) {
        tickDone.value = true;
        runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      'worklet';
      const tx = translateX.value;
      const vx = e.velocityX;
      let target = 0;
      let action: ConvSwipeAction | null = null;

      if (tx > 0 && leftW > 0) {
        if (tx > commitDist || vx > 1100) action = leftActions[0];
        else if (tx > OPEN_MIN || vx > 380) target = leftW;
      } else if (tx < 0 && rightW > 0) {
        if (-tx > commitDist || vx < -1100) action = rightActions[0];
        else if (-tx > OPEN_MIN || vx < -380) target = -rightW;
      }

      if (action) {
        runOnJS(tick)();
        runOnJS(fireAction)(action);
      }
      runOnJS(setOpen)(target !== 0);
      translateX.value = withSpring(target, SPRING);
    })
    .onFinalize(() => {
      'worklet';
      if (swipeLock) swipeLock.value = 0;
      tickDone.value = false;
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const leftActionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 24], [0, 1], 'clamp'),
  }));

  const rightActionsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-24, 0], [1, 0], 'clamp'),
  }));

  return (
    <View style={styles.wrapper}>
      {leftW > 0 && (
        <Animated.View
          style={[styles.actionsEdge, { left: 0, width: leftW }, leftActionsStyle]}
        >
          {leftActions.map((a) => (
            <ActionButton
              key={a.key}
              action={a}
              onPress={() => {
                close();
                fireAction(a);
              }}
            />
          ))}
        </Animated.View>
      )}

      {rightW > 0 && (
        <Animated.View
          style={[
            styles.actionsEdge,
            { right: 0, width: rightW, flexDirection: 'row' },
            rightActionsStyle,
          ]}
        >
          {[...rightActions].reverse().map((a) => (
            <ActionButton
              key={a.key}
              action={a}
              onPress={() => {
                close();
                fireAction(a);
              }}
            />
          ))}
        </Animated.View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle} collapsable={false}>
          {children}
          {open && (
            <Pressable
              style={[StyleSheet.absoluteFill, styles.openShield]}
              onPress={close}
            />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#F0F2F5',
  },
  actionsEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '700',
  },
  openShield: {
    zIndex: 5,
  },
});

export const SwipeableConversationRow = React.memo(SwipeableConversationRowComponent);
