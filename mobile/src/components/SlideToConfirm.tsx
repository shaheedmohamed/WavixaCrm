import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface SlideToConfirmProps {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  loading?: boolean;
  trackColor?: string;
  thumbColor?: string;
  height?: number;
}

const THUMB = 46;
const TRACK_PAD = 4;
const DONE_FRACTION = 0.82;
const SPRING = { damping: 20, stiffness: 300, mass: 0.7, overshootClamping: true };

// RTL "slide to confirm": the thumb starts at the right edge of the track and
// the user drags it left. Committing past 82% fires onConfirm; releasing early
// springs the thumb home. Used on destructive actions so a stray tap can't
// trigger them.
const SlideToConfirmComponent: React.FC<SlideToConfirmProps> = ({
  label,
  onConfirm,
  disabled = false,
  loading = false,
  trackColor = '#F0F2F5',
  thumbColor = Colors.primary,
  height = 52,
}) => {
  const [trackW, setTrackW] = useState(0);
  const travel = Math.max(0, trackW - THUMB - TRACK_PAD * 2);

  const tx = useSharedValue(0);
  const fired = useSharedValue(false);

  const inactive = disabled || loading || travel <= 0;

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const pan = Gesture.Pan()
    .enabled(!inactive)
    .onBegin(() => {
      'worklet';
      // A new drag re-arms the trigger — a failed submit must not leave the
      // slider dead for the rest of the modal's life.
      fired.value = false;
    })
    .onUpdate((e) => {
      'worklet';
      // Dragging leftward = negative translationX.
      const clamped = Math.max(-travel, Math.min(0, e.translationX));
      tx.value = clamped;
    })
    .onEnd(() => {
      'worklet';
      const progress = travel > 0 ? -tx.value / travel : 0;
      if (progress >= DONE_FRACTION && !fired.value) {
        fired.value = true;
        tx.value = withTiming(-travel, { duration: 120 });
        runOnJS(handleConfirm)();
      } else {
        tx.value = withSpring(0, SPRING);
      }
    })
    .onFinalize(() => {
      'worklet';
      if (!fired.value && tx.value !== 0) {
        tx.value = withSpring(0, SPRING);
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: travel > 0 ? interpolate(-tx.value / travel, [0, 0.55], [1, 0], 'clamp') : 1,
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: interpolate(tx.value, [-travel, 0], [trackW, THUMB + TRACK_PAD], 'clamp'),
  }));

  return (
    <View
      style={[styles.track, { backgroundColor: trackColor, height }]}
      onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: thumbColor, height: height - TRACK_PAD * 2 },
          fillStyle,
        ]}
      />

      <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
        <Text style={styles.label}>{label}</Text>
        <Ionicons name="chevron-back" size={15} color="#8696A0" style={styles.chev} />
        <Ionicons name="chevron-back" size={15} color="#C0C7CC" style={styles.chev} />
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: thumbColor, width: THUMB, height: THUMB },
            thumbStyle,
          ]}
          collapsable={false}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    borderRadius: 26,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    right: 0,
    top: TRACK_PAD,
    borderRadius: 23,
    opacity: 0.28,
  },
  labelWrap: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#54656F',
    marginRight: 6,
  },
  chev: {
    marginLeft: -7,
  },
  thumb: {
    position: 'absolute',
    right: TRACK_PAD,
    top: TRACK_PAD,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
});

export const SlideToConfirm = React.memo(SlideToConfirmComponent);
