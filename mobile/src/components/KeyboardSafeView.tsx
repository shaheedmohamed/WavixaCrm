import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardEvent,
  LayoutChangeEvent,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

interface KeyboardSafeViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  extraOffset?: number;
  onKeyboardVisibleChange?: (visible: boolean) => void;
}

/**
 * Universal keyboard-safe wrapper that guarantees the input is never
 * covered by the soft keyboard on any device, screen size, or Android mode.
 *
 * Rather than guessing via window dimensions (which break on edge-to-edge
 * and Android 13-15), it measures the container view's actual layout height
 * against its unconstrained baseline. If the OS already shrank the view
 * (adjustResize), it only applies the remaining difference. If the OS did not
 * shrink the view (edge-to-edge / adjustPan / absoluteFill), it lifts by the
 * full measured keyboard height + extraOffset.
 */
export const KeyboardSafeView: React.FC<KeyboardSafeViewProps> = ({
  children,
  style,
  extraOffset = 4,
  onKeyboardVisibleChange,
}) => {
  const [shiftAnim] = useState(() => new Animated.Value(0));
  const isKeyboardVisibleRef = useRef(false);
  const kbHeightRef = useRef(0);
  const containerHeightRef = useRef(0);
  const unconstrainedHeightRef = useRef(0);

  const computeLift = useCallback(() => {
    if (!isKeyboardVisibleRef.current || kbHeightRef.current <= 0) {
      return 0;
    }
    const kbH = kbHeightRef.current;
    const currentH = containerHeightRef.current;
    const unconstrainedH = unconstrainedHeightRef.current;

    // How much the container actually shrank (if OS resized it via adjustResize)
    const viewShrink =
      unconstrainedH > 0 && currentH > 0
        ? Math.max(0, unconstrainedH - currentH)
        : 0;

    // Lift whatever remaining portion of the keyboard the OS didn't absorb
    const neededLift = Math.max(0, kbH - viewShrink) + extraOffset;
    return neededLift;
  }, [extraOffset]);

  const animateTo = useCallback(
    (toValue: number, duration?: number) => {
      Animated.timing(shiftAnim, {
        toValue,
        duration: Platform.OS === 'ios' ? duration ?? 200 : Math.min(duration ?? 130, 130),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [shiftAnim]
  );

  const updateLift = useCallback(
    (duration?: number) => {
      const lift = computeLift();
      animateTo(lift, duration);
    },
    [computeLift, animateTo]
  );

  const handleLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h <= 0) return;
    containerHeightRef.current = h;

    if (!isKeyboardVisibleRef.current) {
      // Keyboard closed: record the true unconstrained baseline height
      if (h > unconstrainedHeightRef.current) {
        unconstrainedHeightRef.current = h;
      }
    } else {
      // Keyboard open: layout changed (e.g. OS resize or orientation); recompute lift
      updateLift(60);
    }
  };

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleShow = (e: KeyboardEvent) => {
      isKeyboardVisibleRef.current = true;
      kbHeightRef.current = e.endCoordinates?.height ?? 0;
      onKeyboardVisibleChange?.(true);
      updateLift(Platform.OS === 'ios' ? e.duration : 120);
    };

    const handleHide = (e: KeyboardEvent) => {
      isKeyboardVisibleRef.current = false;
      kbHeightRef.current = 0;
      onKeyboardVisibleChange?.(false);
      animateTo(0, Platform.OS === 'ios' ? e?.duration || 180 : 100);
    };

    const subs = [
      Keyboard.addListener('keyboardWillShow', handleShow),
      Keyboard.addListener('keyboardDidShow', handleShow),
      Keyboard.addListener('keyboardWillHide', handleHide),
      Keyboard.addListener('keyboardDidHide', handleHide),
    ];

    if (Platform.OS === 'ios') {
      subs.push(Keyboard.addListener('keyboardWillChangeFrame', handleShow));
    }

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [animateTo, onKeyboardVisibleChange, updateLift]);

  return (
    <View style={[styles.outer, style]} onLayout={handleLayout}>
      <Animated.View style={[styles.inner, { paddingBottom: shiftAnim }]}>
        {children}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  inner: {
    flex: 1,
  },
});
