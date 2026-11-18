import React, { useEffect } from 'react';
import { Keyboard, Platform, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

interface KeyboardSafeViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  extraOffset?: number;
  onKeyboardVisibleChange?: (visible: boolean) => void;
}

/**
 * Keyboard-safe wrapper backed by react-native-keyboard-controller.
 *
 * Unlike measuring layout changes in JS (which always trails the keyboard
 * by a frame or more), this drives the lift from the platform's own
 * WindowInsetsAnimation on Android and keyboard notifications on iOS, so
 * the content moves in the same frames as the keyboard itself.
 *
 * `behavior="padding"` shrinks the content area exactly the way
 * adjustResize would — message lists and inputs rise together — and the
 * library only applies the portion of the keyboard not already absorbed
 * by a system resize, so there is no double lift on any soft-input mode.
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
    <KeyboardAvoidingView
      style={[styles.root, style]}
      behavior="padding"
      keyboardVerticalOffset={extraOffset}
      automaticOffset
    >
      {children}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});
