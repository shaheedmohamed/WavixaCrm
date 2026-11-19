import React, { useEffect } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  StyleProp,
  StyleSheet,
  TurboModuleRegistry,
  View,
  ViewStyle,
} from 'react-native';

// react-native-keyboard-controller only exists in dev builds / release
// APKs — Expo Go does not bundle it. Probe the turbo module directly and
// fall back to React Native's own KeyboardAvoidingView so the input is
// never left buried under the keyboard there.
export const HAS_KEYBOARD_SYNC =
  Platform.OS !== 'web' &&
  TurboModuleRegistry.get('KeyboardController') != null;

// Edge-to-edge is enforced on Expo SDK 53+ Android: the window is NOT
// resized for the IME — apps must consume the inset themselves. Under
// E2E the (disabled) provider's margin path is skipped too, so a plain
// view leaves the composer under the keyboard. Detect E2E the same way
// the lib does.
const IS_EDGE_TO_EDGE = (() => {
  if (Platform.OS !== 'android') return false;
  try {
    const deviceInfo = TurboModuleRegistry.get('DeviceInfo') as any;
    return (
      TurboModuleRegistry.get('RNEdgeToEdge') != null ||
      deviceInfo?.getConstants?.()?.isEdgeToEdge === true
    );
  } catch {
    return false;
  }
})();

interface KeyboardSafeViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  extraOffset?: number;
  onKeyboardVisibleChange?: (visible: boolean) => void;
}

/**
 * Keyboard-safe wrapper.
 *
 * Three cases:
 * - Android non-E2E: android:windowSoftInputMode="adjustResize" shrinks
 *   the window itself (plus the disabled provider's margin path when the
 *   lib is bundled) — a plain view is all that's needed.
 * - Android E2E: nothing resizes the window, so RN's own
 *   KeyboardAvoidingView (height) lifts the composer. Its Keyboard
 *   events are emitted by RN's global layout listener — independent of
 *   the keyboard-controller event pipeline entirely.
 * - iOS: classic padding behavior.
 */
export const KeyboardSafeView: React.FC<KeyboardSafeViewProps> = ({
  children,
  style,
  extraOffset = 4,
  onKeyboardVisibleChange,
}) => {
  useEffect(() => {
    if (!onKeyboardVisibleChange || Platform.OS === 'web') return;
    const showSub = Keyboard.addListener('keyboardDidShow', () =>
      onKeyboardVisibleChange(true)
    );
    const hideSub = Keyboard.addListener('keyboardDidHide', () =>
      onKeyboardVisibleChange(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [onKeyboardVisibleChange]);

  if (Platform.OS === 'android' && !IS_EDGE_TO_EDGE) {
    // adjustResize (or the provider's margin path) lifts the content.
    return <View style={[styles.root, style]}>{children}</View>;
  }

  return (
    <RNKeyboardAvoidingView
      style={[styles.root, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={extraOffset}
    >
      {children}
    </RNKeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});
