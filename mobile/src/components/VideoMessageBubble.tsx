import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { formatAudioSeconds } from '../services/media';

interface VideoMessageBubbleProps {
  uri: string;
  durationSeconds?: number | null;
  fileName?: string | null;
  onPress: () => void;
  disabled?: boolean;
}

const VideoMessageBubbleComponent: React.FC<VideoMessageBubbleProps> = ({
  durationSeconds,
  fileName,
  onPress,
  disabled = false,
}) => {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.wrap}>
      <View style={styles.CinemaBackdrop}>
        <MaterialCommunityIcons
          name="movie-open-play-outline"
          size={44}
          color="rgba(255,255,255,0.16)"
        />
      </View>

      <View style={styles.overlay}>
        <View style={styles.playCircle}>
          <Ionicons name="play" size={24} color="#FFFFFF" style={{ marginLeft: 3 }} />
        </View>
      </View>

      <View style={styles.bottomStrip}>
        <View style={styles.durationPill}>
          <Ionicons name="videocam" size={12} color="#FFFFFF" />
          <Text style={styles.durationText}>
            {durationSeconds && durationSeconds > 0
              ? formatAudioSeconds(durationSeconds)
              : 'فيديو'}
          </Text>
        </View>
        {fileName ? (
          <Text style={styles.nameText} numberOfLines={1}>
            {fileName}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    width: 226,
    height: 162,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#131F26',
    marginBottom: 4,
    justifyContent: 'space-between',
  },
  CinemaBackdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#182730',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 168, 132, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  bottomStrip: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 7,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  durationPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  durationText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '700',
  },
  nameText: {
    flex: 1,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    textAlign: 'left',
  },
});

export const VideoMessageBubble = React.memo(VideoMessageBubbleComponent);
