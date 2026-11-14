import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

interface VideoMessageBubbleProps {
  uri: string;
  onPress: () => void;
}

/** Inline video preview inside the chat bubble — paused on the first frame
 *  like WhatsApp Web's preload=metadata; tapping opens the fullscreen player. */
export const VideoMessageBubble: React.FC<VideoMessageBubbleProps> = ({ uri, onPress }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
  });

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View style={styles.overlay}>
        <View style={styles.playCircle}>
          <Ionicons name="play" size={24} color="#FFFFFF" style={{ marginLeft: 3 }} />
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: 220,
    height: 170,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0B141A',
    marginBottom: 4,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
