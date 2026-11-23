import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { HAS_KEYBOARD_SYNC } from '../components/KeyboardSafeView';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { CallScreen } from '../components/CallScreen';
import { realtime } from '../services/realtime';
import { callService } from '../services/callService';
import {
  initCallChannel,
  handleInitialCallNotification,
  cancelCallNotificationOnIdle,
} from '../services/callPush';

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
          <RealtimeGate />
          <CallScreen />
          </AuthProvider>
        </MaybeKeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// KeyboardProvider renders a native view that does not exist in Expo Go —
// skip it there while keeping full keyboard-sync in real builds.
// enabled={false}: with an active provider the lib suppresses the window's
// own adjustResize margins and leaves lifting to its animated hooks — on
// devices where those events misbehave the composer ends up buried under
// the keyboard. Disabled, the view applies resize margins itself (native
// WindowInsets path) so the input is always above the keyboard.
// Keeps the Reverb channel alive while signed in and funnels call events
// (incoming WhatsApp calls) into the call manager.
const RealtimeGate: React.FC = () => {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      realtime.stop();
      return;
    }
    const off = realtime.on((ev) => {
      if (ev.type === 'call.event') callService.handleRealtimeEvent(ev.data);
    });
    realtime.start(user);
    initCallChannel();
    handleInitialCallNotification();
    // Cold-launched by the full-screen intent? Hydrate the live bridge state
    // so the incoming CallScreen shows even without a notification event.
    callService.syncFromBridge();
    const offCall = callService.subscribe((s) => cancelCallNotificationOnIdle(s.phase));
    return () => {
      off();
      offCall();
      realtime.stop();
    };
  }, [user]);

  return null;
};

const MaybeKeyboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) =>
  HAS_KEYBOARD_SYNC ? (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent enabled={false}>
      {children}
    </KeyboardProvider>
  ) : (
    <>{children}</>
  );
