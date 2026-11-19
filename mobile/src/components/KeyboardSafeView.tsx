import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  StyleProp,
  StyleSheet,
  TurboModuleRegistry,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';

// react-native-keyboard-controller only exists in dev builds / release
// APKs — Expo Go does not bundle it. Probe the turbo module directly so
// _layout can skip the provider there.
export const HAS_KEYBOARD_SYNC =
  Platform.OS !== 'web' &&
  TurboModuleRegistry.get('KeyboardController') != null;

interface KeyboardSafeViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  extraOffset?: number;
  onKeyboardVisibleChange?: (visible: boolean) => void;
}

/**
 * Keyboard-safe wrapper — pure geometric measurement, no KAV library.
 *
 * When the keyboard shows we measure this view's bottom edge on the
 * screen and compare it to the keyboard's top edge (`screenY`). The
 * overlap is exactly how much we need to lift:
 *
 * - Edge-to-edge → our bottom edge sits at the screen bottom, overlap =
 *   full IME height → we pad up ourselves.
 * - adjustResize active → the window already shrank, our bottom edge is
 *   at/above the keyboard top, overlap = 0 → we do nothing (no double
 *   lift, whatever the OS/OEM decides).
 */
export const KeyboardSafeView: React.FC<KeyboardSafeViewProps> = ({
  children,
  style,
  extraOffset = 4,
  onKeyboardVisibleChange,
}) => {
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const [lift, setLift] = useState(0);
  // Recompute the lift if the window geometry itself changes (resize
  // finishing after the keyboard event, rotation, split-screen…).
  const { height: windowH } = useWindowDimensions();
  const lastKbTop = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const measureLift = () => {
      const top = lastKbTop.current;
      if (top == null) return;
      // Defer one frame so an in-flight window resize settles into layout.
      requestAnimationFrame(() => {
        rootRef.current?.measure(
          (_x: number, _y: number, _w: number, h: number, _pageX: number, pageY: number) => {
            const overlap = Math.max(0, pageY + h - top);
            setLift(overlap);
          }
        );
      });
    };

    const show = (e: { endCoordinates: { screenY: number } }) => {
      lastKbTop.current = e.endCoordinates.screenY;
      onKeyboardVisibleChange?.(true);
      measureLift();
    };
    const hide = () => {
      lastKbTop.current = null;
      setLift(0);
      onKeyboardVisibleChange?.(false);
    };
    const subs = [
      Keyboard.addListener('keyboardDidShow', show),
      Keyboard.addListener('keyboardDidHide', hide),
      // iOS (and newer Android RN) fire the Will events — harmless
      // duplicates that let the lift start a beat earlier.
      Keyboard.addListener('keyboardWillShow', show),
      Keyboard.addListener('keyboardWillHide', hide),
    ];
    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [onKeyboardVisibleChange]);

  // Window changed while the keyboard is open (delayed resize, rotation,
  // split-screen drag) → the earlier overlap math is stale; re-measure.
  useEffect(() => {
    if (lastKbTop.current == null) return;
    const id = setTimeout(() => {
      const top = lastKbTop.current;
      rootRef.current?.measure((_x: number, _y: number, _w: number, h: number, _px: number, py: number) => {
        setLift(top == null ? 0 : Math.max(0, py + h - top));
      });
    }, 60);
    return () => clearTimeout(id);
  }, [windowH]);

  return (
    <View
      ref={rootRef}
      style={[
        styles.root,
        style,
        { paddingBottom: lift > 0 ? lift + extraOffset : 0 },
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});
