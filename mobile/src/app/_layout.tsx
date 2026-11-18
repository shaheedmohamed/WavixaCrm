import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { HAS_KEYBOARD_SYNC } from '../components/KeyboardSafeView';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MaybeKeyboardProvider>
          <AuthProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="index" />
          </Stack>
          </AuthProvider>
        </MaybeKeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// KeyboardProvider renders a native view that does not exist in Expo Go —
// skip it there while keeping full keyboard-sync in real builds.
const MaybeKeyboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) =>
  HAS_KEYBOARD_SYNC ? (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
      {children}
    </KeyboardProvider>
  ) : (
    <>{children}</>
  );
