import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

/** Three pulsing dots — WhatsApp's "typing…" bubble animation. */
const TypingDotsComponent: React.FC = () => {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0.35)));

  useEffect(() => {
    const loops = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.35, duration: 300, useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [dots]);

  return (
    <View style={styles.row}>
      {dots.map((opacity, i) => (
        <Animated.View key={i} style={[styles.dot, { opacity }]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#8696A0',
  },
});

export const TypingDots = React.memo(TypingDotsComponent);
