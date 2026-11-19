import React, { useEffect } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  StyleProp,
  StyleSheet,
  TurboModuleRegistry,
  ViewStyle,
} from 'react-native';

// react-native-keyboard-controller only exists in dev builds / release
// APKs — Expo Go does not bundle it. Probe the turbo module directly and
// fall back to React Native's own KeyboardAvoidingView so the input is
// never left buried under the keyboard there.
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
 * Keyboard-safe wrapper.
 *
 * Uses RN's own KeyboardAvoidingView (height on Android, padding on
 * iOS). RN's Keyboard events come from the global layout listener —
 * independent of the keyboard-controller event pipeline, so they fire
 * on every device. 'height' measures the real view-vs-keyboard overlap:
 * when the window is already resized (adjustResize, non-edge-to-edge)
 * the overlap is zero and it stays out of the way; under edge-to-edge
 * it shrinks the container by the IME height.
 *
 * The root KeyboardProvider stays mounted with enabled={false} so the
 * lib's animated pipeline can't suppress the resize margin path.
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
