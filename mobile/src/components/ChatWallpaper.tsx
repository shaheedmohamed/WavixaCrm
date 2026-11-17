import React from 'react';
import { View, Image, StyleSheet, Dimensions } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';

interface ChatWallpaperProps {
  customUri?: string | null;
}

type MotifSpec = {
  lib: 'mci' | 'ion';
  name: string;
  size: number;
  rot: string;
  tone: 'warm' | 'brand';
};

const MOTIFS: MotifSpec[] = [
  { lib: 'mci', name: 'message-text-outline', size: 20, rot: '-14deg', tone: 'brand' },
  { lib: 'ion', name: 'sparkles-outline', size: 17, rot: '12deg', tone: 'warm' },
  { lib: 'mci', name: 'send-outline', size: 19, rot: '-22deg', tone: 'warm' },
  { lib: 'mci', name: 'headset', size: 20, rot: '16deg', tone: 'brand' },
  { lib: 'ion', name: 'checkmark-done-outline', size: 19, rot: '-8deg', tone: 'brand' },
  { lib: 'mci', name: 'star-four-points-outline', size: 16, rot: '20deg', tone: 'warm' },
  { lib: 'mci', name: 'lightning-bolt-outline', size: 19, rot: '-15deg', tone: 'warm' },
  { lib: 'ion', name: 'chatbubbles-outline', size: 20, rot: '10deg', tone: 'brand' },
  { lib: 'mci', name: 'shield-check-outline', size: 18, rot: '-12deg', tone: 'warm' },
  { lib: 'ion', name: 'heart-outline', size: 17, rot: '18deg', tone: 'warm' },
  { lib: 'mci', name: 'tag-outline', size: 18, rot: '-20deg', tone: 'brand' },
  { lib: 'ion', name: 'mic-outline', size: 18, rot: '14deg', tone: 'warm' },
  { lib: 'mci', name: 'camera-outline', size: 18, rot: '-10deg', tone: 'warm' },
  { lib: 'mci', name: 'compass-outline', size: 19, rot: '22deg', tone: 'brand' },
  { lib: 'ion', name: 'document-text-outline', size: 18, rot: '-16deg', tone: 'warm' },
  { lib: 'mci', name: 'clock-outline', size: 17, rot: '8deg', tone: 'warm' },
  { lib: 'ion', name: 'bookmark-outline', size: 17, rot: '-18deg', tone: 'brand' },
  { lib: 'mci', name: 'Creation', size: 16, rot: '0deg', tone: 'warm' },
];

const SAFE_MOTIFS: MotifSpec[] = MOTIFS.map((m) =>
  m.name === 'Creation' ? { ...m, name: 'shape-outline' } : m
);

const ChatWallpaperComponent: React.FC<ChatWallpaperProps> = ({ customUri }) => {
  if (customUri) {
    return (
      <Image
        source={{ uri: customUri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
    );
  }

  const { width, height } = Dimensions.get('window');
  const cols = Math.max(5, Math.ceil(width / 68));
  const rows = Math.max(9, Math.ceil(height / 72));
  const cellW = width / cols;
  const cellH = height / rows;

  const elements: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * 7 + c * 3) % SAFE_MOTIFS.length;
      const spec = SAFE_MOTIFS[idx];
      const staggerX = r % 2 === 1 ? cellW * 0.42 : 0;
      const jitterX = (((r * 13 + c * 29) % 11) - 5) * 2.2;
      const jitterY = (((r * 19 + c * 17) % 11) - 5) * 2.2;
      const left = c * cellW + staggerX + jitterX + 10;
      const top = r * cellH + jitterY + 10;
      if (left > width - 16) continue;

      const color =
        spec.tone === 'brand'
          ? 'rgba(11, 77, 60, 0.085)'
          : 'rgba(110, 96, 80, 0.095)';

      elements.push(
        <View
          key={`m-${r}-${c}`}
          style={{
            position: 'absolute',
            left,
            top,
            transform: [{ rotate: spec.rot }],
          }}
        >
          {spec.lib === 'mci' ? (
            <MaterialCommunityIcons name={spec.name as any} size={spec.size} color={color} />
          ) : (
            <Ionicons name={spec.name as any} size={spec.size} color={color} />
          )}
        </View>
      );

      if ((r + c) % 2 === 0) {
        elements.push(
          <View
            key={`d-${r}-${c}`}
            style={{
              position: 'absolute',
              left: left + cellW * 0.44,
              top: top + cellH * 0.46,
              width: (r + c) % 4 === 0 ? 5 : 3.5,
              height: (r + c) % 4 === 0 ? 5 : 3.5,
              borderRadius: 3,
              borderWidth: (r + c) % 4 === 0 ? 1 : 0,
              borderColor: 'rgba(11, 77, 60, 0.08)',
              backgroundColor:
                (r + c) % 4 === 0 ? 'transparent' : 'rgba(110, 96, 80, 0.08)',
            }}
          />
        );
      }
    }
  }

  return (
    <View style={styles.patternCanvas} pointerEvents="none">
      {elements}
    </View>
  );
};

const styles = StyleSheet.create({
  patternCanvas: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ECE5DD',
    overflow: 'hidden',
  },
});

export const ChatWallpaper = React.memo(ChatWallpaperComponent);
