import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ZoomableImageProps {
  uri: string;
  showControls?: boolean;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

const touchDistance = (touches: readonly { pageX: number; pageY: number }[]): number => {
  if (!touches || touches.length < 2) return 0;
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.hypot(dx, dy);
};

const clampPan = (x: number, y: number, scale: number) => {
  const { width, height } = Dimensions.get('window');
  const maxX = Math.max(0, ((scale - 1) * width) / 2);
  const maxY = Math.max(0, ((scale - 1) * height) / 2.2);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
};

export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  uri,
  showControls = true,
}) => {
  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [panXAnim] = useState(() => new Animated.Value(0));
  const [panYAnim] = useState(() => new Animated.Value(0));
  const [displayScale, setDisplayScale] = useState(1);

  const stRef = useRef({
    scale: 1,
    panX: 0,
    panY: 0,
    startScale: 1,
    startPanX: 0,
    startPanY: 0,
    grantX: 0,
    grantY: 0,
    initialPinchDist: 0,
    isPinching: false,
    lastTapAt: 0,
  });

  const animateTo = useCallback(
    (targetScale: number, targetX = 0, targetY = 0) => {
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
      const nx = clamped <= 1.02 ? 0 : targetX;
      const ny = clamped <= 1.02 ? 0 : targetY;
      stRef.current.scale = clamped;
      stRef.current.panX = nx;
      stRef.current.panY = ny;
      setDisplayScale(Number(clamped.toFixed(1)));

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: clamped,
          useNativeDriver: true,
          speed: 24,
          bounciness: 3,
        }),
        Animated.spring(panXAnim, {
          toValue: nx,
          useNativeDriver: true,
          speed: 24,
          bounciness: 3,
        }),
        Animated.spring(panYAnim, {
          toValue: ny,
          useNativeDriver: true,
          speed: 24,
          bounciness: 3,
        }),
      ]).start();
    },
    [scaleAnim, panXAnim, panYAnim]
  );

  useEffect(() => {
    stRef.current = {
      scale: 1,
      panX: 0,
      panY: 0,
      startScale: 1,
      startPanX: 0,
      startPanY: 0,
      grantX: 0,
      grantY: 0,
      initialPinchDist: 0,
      isPinching: false,
      lastTapAt: 0,
    };
    scaleAnim.setValue(1);
    panXAnim.setValue(0);
    panYAnim.setValue(0);
    Promise.resolve().then(() => setDisplayScale(1));
  }, [uri, scaleAnim, panXAnim, panYAnim]);

  const handleGrant = (evt: GestureResponderEvent) => {
    const touches = evt.nativeEvent.touches;
    const st = stRef.current;
    if (touches.length >= 2) {
      st.isPinching = true;
      st.initialPinchDist = touchDistance(touches);
      st.startScale = st.scale;
    } else {
      st.isPinching = false;
      st.startPanX = st.panX;
      st.startPanY = st.panY;
      st.grantX = evt.nativeEvent.pageX;
      st.grantY = evt.nativeEvent.pageY;

      const now = Date.now();
      if (now - st.lastTapAt < 280) {
        st.lastTapAt = 0;
        animateTo(st.scale > 1.2 ? 1 : 2.6, 0, 0);
      } else {
        st.lastTapAt = now;
      }
    }
  };

  const handleMove = (evt: GestureResponderEvent) => {
    const touches = evt.nativeEvent.touches;
    const st = stRef.current;

    if (touches.length >= 2) {
      const dist = touchDistance(touches);
      if (!st.isPinching || st.initialPinchDist <= 0) {
        st.isPinching = true;
        st.initialPinchDist = dist;
        st.startScale = st.scale;
        return;
      }
      const nextScale = Math.max(
        0.85,
        Math.min(MAX_SCALE, st.startScale * (dist / st.initialPinchDist))
      );
      st.scale = nextScale;
      scaleAnim.setValue(nextScale);
      setDisplayScale(Number(Math.max(1, nextScale).toFixed(1)));
    } else if (!st.isPinching && st.scale > 1.02) {
      const dx = evt.nativeEvent.pageX - st.grantX;
      const dy = evt.nativeEvent.pageY - st.grantY;
      const bounded = clampPan(st.startPanX + dx, st.startPanY + dy, st.scale);
      st.panX = bounded.x;
      st.panY = bounded.y;
      panXAnim.setValue(bounded.x);
      panYAnim.setValue(bounded.y);
    }
  };

  const handleRelease = () => {
    const st = stRef.current;
    st.isPinching = false;
    if (st.scale < 1.03) {
      animateTo(1, 0, 0);
    } else {
      const bounded = clampPan(st.panX, st.panY, st.scale);
      animateTo(st.scale, bounded.x, bounded.y);
    }
  };

  return (
    <View style={styles.container}>
      <View
        style={styles.touchStage}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={(evt) => {
          if (evt.nativeEvent.touches.length >= 2) return true;
          return stRef.current.scale > 1.03;
        }}
        onResponderGrant={handleGrant}
        onResponderMove={handleMove}
        onResponderRelease={handleRelease}
      >
        <Animated.Image
          source={{ uri }}
          style={[
            styles.image,
            {
              transform: [
                { translateX: panXAnim },
                { translateY: panYAnim },
                { scale: scaleAnim },
              ],
            },
          ]}
          resizeMode="contain"
        />
      </View>

      {showControls && (
        <View style={styles.zoomBar}>
          <TouchableOpacity
            style={styles.zoomBtn}
            onPress={() => animateTo(Math.max(MIN_SCALE, displayScale - 0.6))}
            disabled={displayScale <= 1}
          >
            <Ionicons
              name="remove"
              size={19}
              color={displayScale <= 1 ? 'rgba(255,255,255,0.35)' : '#FFFFFF'}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.scaleLabelBtn}
            onPress={() => animateTo(displayScale > 1.05 ? 1 : 2.2, 0, 0)}
          >
            <Text style={styles.scaleLabelText}>{Math.round(displayScale * 100)}%</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.zoomBtn}
            onPress={() => animateTo(Math.min(MAX_SCALE, displayScale + 0.75))}
            disabled={displayScale >= MAX_SCALE}
          >
            <Ionicons
              name="add"
              size={19}
              color={displayScale >= MAX_SCALE ? 'rgba(255,255,255,0.35)' : '#FFFFFF'}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchStage: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  zoomBar: {
    position: 'absolute',
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 27, 33, 0.82)',
    borderRadius: 22,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    gap: 4,
  },
  zoomBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleLabelBtn: {
    paddingHorizontal: 10,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleLabelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});
