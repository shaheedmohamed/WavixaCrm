import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardEvent,
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

export const KeyboardSafeView: React.FC<KeyboardSafeViewProps> = ({
  children,
  style,
  extraOffset = 8,
  onKeyboardVisibleChange,
}) => {
  const [shiftAnim] = useState(() => new Animated.Value(0));
  const kbRef = useRef({ visible: false, height: 0 });
  // Window height captured while the keyboard is hidden. Comparing it
  // against the current height at show-time tells us exactly how much
  // of the keyboard the OS already absorbed via adjustResize — no
  // inset guessing, works in every soft-input mode.
  const baselineWinHRef = useRef(Dimensions.get('window').height);

  const computeLift = useCallback(() => {
    const kb = kbRef.current;
    if (!kb.visible || kb.height <= 0) return 0;

    const winH = Dimensions.get('window').height;
    const baseline = baselineWinHRef.current;
    const resizedByOs = Math.max(0, baseline - winH);
    const lift = Math.max(0, kb.height - resizedByOs);
    // extraOffset always applies — keeps the input visibly above the
    // keyboard even when the OS already resized the window for us.
    return lift + extraOffset;
  }, [extraOffset]);

  const animateLift = useCallback(
    (duration?: number) => {
      Animated.timing(shiftAnim, {
        toValue: computeLift(),
        duration: Platform.OS === 'ios' ? duration ?? 180 : Math.min(duration ?? 120, 120),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [computeLift, shiftAnim]
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleShow = (e: KeyboardEvent) => {
      kbRef.current = {
        visible: true,
        height: e.endCoordinates?.height ?? 0,
      };
      onKeyboardVisibleChange?.(true);
      animateLift(e.duration);
      // The window-resize 'change' event can land after the keyboard
      // event — recompute once the layout has settled.
      setTimeout(() => animateLift(0), 90);
      setTimeout(() => animateLift(0), 280);
    };

    const handleHide = (e: KeyboardEvent) => {
      kbRef.current = { visible: false, height: 0 };
      onKeyboardVisibleChange?.(false);
      Animated.timing(shiftAnim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? e?.duration || 180 : 90,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
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

    const dimSub = Dimensions.addEventListener('change', () => {
      if (kbRef.current.visible) {
        animateLift(0);
      } else {
        // Keyboard hidden — this is a true baseline window height.
        baselineWinHRef.current = Dimensions.get('window').height;
      }
    });

    return () => {
      subs.forEach((s) => s.remove());
      dimSub.remove();
    };
  }, [animateLift, onKeyboardVisibleChange, shiftAnim]);

  return (
    <View
      style={[styles.outer, style]}
      onLayout={() => {
        if (!kbRef.current.visible) {
          baselineWinHRef.current = Dimensions.get('window').height;
        }
      }}
    >
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
