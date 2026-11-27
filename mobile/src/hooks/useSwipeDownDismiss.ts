import { useCallback } from 'react';
import { Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';

const { height: SCREEN_H } = Dimensions.get('window');

// Finger must pull clearly down before the container follows; sideways or
// upward drags keep their normal meaning (paging, scrolling, taps).
const VERTICAL_GRAB = 18;
const DISMISS_DISTANCE = 140;
const DISMISS_VELOCITY = 900;

interface SwipeDownDismissOptions {
  // Worklet-side veto — e.g. a shared value that reads 1 while the viewer's
  // image is zoomed, so a vertical drag pans the photo instead of dismissing.
  blockedSV?: SharedValue<number>;
}

/**
 * WhatsApp-style vertical pull-to-close for fullscreen viewers. Attach the
 * returned `pan` to a GestureDetector wrapping the content, spread
 * `containerStyle` on its Animated.View, and call `reset` if the content is
 * reused after a cancelled close.
 */
export const useSwipeDownDismiss = (
  onClose: () => void,
  opts?: SwipeDownDismissOptions
) => {
  const ty = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const closing = useSharedValue(0);

  const finish = useCallback(() => {
    onClose();
  }, [onClose]);

  const pan = Gesture.Pan()
    .manualActivation(true)
    .maxPointers(1)
    .onTouchesDown((e) => {
      'worklet';
      const t = e.allTouches[0];
      if (t) {
        startX.value = t.absoluteX;
        startY.value = t.absoluteY;
      }
    })
    .onTouchesMove((e, state) => {
      'worklet';
      // A second finger = pinch/zoom territory — never hijack it.
      if (e.numberOfTouches > 1 || closing.value || opts?.blockedSV?.value) {
        state.fail();
        return;
      }
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.absoluteX - startX.value;
      const dy = t.absoluteY - startY.value;
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) {
        state.fail();
        return;
      }
      if (dy > VERTICAL_GRAB && dy > Math.abs(dx) * 1.5) {
        state.activate();
      }
    })
    .onUpdate((e) => {
      'worklet';
      // Rubber-band a little so the pull doesn't feel rigidly 1:1.
      ty.value = e.translationY * 0.94;
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationY > DISMISS_DISTANCE || e.velocityY > DISMISS_VELOCITY) {
        closing.value = 1;
        ty.value = withTiming(SCREEN_H, { duration: 170 }, (done) => {
          if (done) runOnJS(finish)();
        });
      } else {
        ty.value = withSpring(0, { damping: 20, stiffness: 260, mass: 0.7 });
      }
    })
    .onFinalize(() => {
      'worklet';
      if (!closing.value) ty.value = 0;
    });

  const containerStyle = useAnimatedStyle(() => {
    const p = Math.max(0, Math.min(1, ty.value / (SCREEN_H * 0.75)));
    return {
      opacity: 1 - p * 0.75,
      transform: [
        { translateY: ty.value },
        { scale: 1 - p * 0.08 },
      ],
    };
  });

  /* eslint-disable react-hooks/immutability -- shared-value writes are the
     reanimated bridge, not render mutation. */
  const reset = useCallback(() => {
    ty.value = 0;
    closing.value = 0;
  }, [ty, closing]);
  /* eslint-enable react-hooks/immutability */

  return { pan, containerStyle, ty, reset, closing };
};
