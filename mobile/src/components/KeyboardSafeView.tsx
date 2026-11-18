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
import { KeyboardAvoidingView as SyncedKeyboardAvoidingView } from 'react-native-keyboard-controller';

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
 * With the native module present, the lift is driven by the platform's
 * own WindowInsetsAnimation so content moves in the same frames as the
 * keyboard (no chasing, no double-lift — it measures the real overlap).
 * In Expo Go it degrades to RN's JS-driven avoiding view, which still
 * lifts the input above the keyboard.
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

  if (HAS_KEYBOARD_SYNC) {
    return (
      <SyncedKeyboardAvoidingView
        style={[styles.root, style]}
        behavior="padding"
        keyboardVerticalOffset={extraOffset}
        automaticOffset
      >
        {children}
      </SyncedKeyboardAvoidingView>
    );
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
