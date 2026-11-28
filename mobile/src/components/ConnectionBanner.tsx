import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { realtime, RealtimeStatus } from '../services/realtime';

/**
 * Thin WhatsApp-style connectivity strip pinned to the very top of the app.
 * Hidden while the realtime socket is subscribed; slides in the moment it
 * drops so a silent gap never reads as "no new messages".
 */
export const ConnectionBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<RealtimeStatus>(realtime.getStatus());
  // -1 hidden, 0 shown — useState keeps the Animated.Value identity stable.
  const [slide] = useState(() => new Animated.Value(-1));

  useEffect(() => realtime.onStatus(setStatus), []);

  const visible = status === 'connecting' || status === 'disconnected';
  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : -1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const top = insets.top;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { paddingTop: top, transform: [{ translateY: slide.interpolate({
            inputRange: [-1, 0],
            outputRange: [-(top + 30), 0],
          }) }] },
        status === 'disconnected' ? styles.off : styles.busy,
      ]}
    >
      <Text style={styles.text}>
        {status === 'disconnected' ? 'مفيش اتصال — بيحاول تاني…' : 'بيجهّز الاتصال…'}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    paddingBottom: 4,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  busy: { backgroundColor: '#C98A00' },
  off: { backgroundColor: '#C0392B' },
  text: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
});
