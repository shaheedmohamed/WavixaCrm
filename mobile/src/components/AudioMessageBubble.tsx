import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createAudioPlayer, AudioPlayer, AudioStatus } from 'expo-audio';
import { Message } from '../types/crm';
import { Colors } from '../constants/theme';
import { formatAudioSeconds, waveformBars } from '../services/media';

// Only one voice note plays at a time — starting one pauses the previous.
let activePlayer: { key: string; pause: () => void } | null = null;

interface AudioMessageBubbleProps {
  message: Message;
  uri: string;
  isOutgoing: boolean;
  avatarUri?: string | null;
  avatarFallback?: string;
}

/** WhatsApp-web-style audio/voice-note bubble: round play button, waveform
 *  bars you can tap to seek, duration label and an avatar with a mic badge. */
const AudioMessageBubbleComponent: React.FC<AudioMessageBubbleProps> = ({
  message,
  uri,
  isOutgoing,
  avatarUri,
  avatarFallback,
}) => {
  const key = String(message.id || message.message_id);
  const playerRef = useRef<AudioPlayer | null>(null);
  const subRef = useRef<{ remove: () => void } | null>(null);
  const [status, setStatus] = useState<Pick<AudioStatus, 'playing' | 'currentTime' | 'duration' | 'isLoaded' | 'didJustFinish'>>({
    playing: false,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
    didJustFinish: false,
  });

  const bars = useMemo(() => waveformBars(key), [key]);

  useEffect(() => {
    return () => {
      subRef.current?.remove();
      subRef.current = null;
      try {
        playerRef.current?.release();
      } catch {}
      playerRef.current = null;
      if (activePlayer?.key === key) activePlayer = null;
    };
  }, [key]);

  const ensurePlayer = (): AudioPlayer => {
    if (!playerRef.current) {
      const p = createAudioPlayer({ uri }, { updateInterval: 120 });
      playerRef.current = p;
      subRef.current = p.addListener('playbackStatusUpdate', (s: AudioStatus) => {
        setStatus({
          playing: s.playing,
          currentTime: s.currentTime,
          duration: s.duration,
          isLoaded: s.isLoaded,
          didJustFinish: s.didJustFinish,
        });
      });
    }
    return playerRef.current;
  };

  const toggle = () => {
    const p = ensurePlayer();
    if (status.playing) {
      p.pause();
      return;
    }
    if (activePlayer && activePlayer.key !== key) {
      try { activePlayer.pause(); } catch {}
    }
    activePlayer = { key, pause: () => p.pause() };
    if (status.didJustFinish) p.seekTo(0);
    p.play();
  };

  const seek = (evt: any, width: number) => {
    const p = playerRef.current;
    const total = status.duration || message.media_meta?.seconds || 0;
    if (!p || !width || !total) return;
    const ratio = Math.min(1, Math.max(0, evt.nativeEvent.locationX / width));
    p.seekTo(ratio * total);
    setStatus((prev) => ({ ...prev, currentTime: ratio * total }));
  };

  const duration = status.duration || message.media_meta?.seconds || 0;
  const playedRatio = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const playedBars = Math.floor(playedRatio * bars.length);
  const accent = isOutgoing ? Colors.primaryDark : Colors.primary;

  const label = status.playing || status.currentTime > 0
    ? `${formatAudioSeconds(status.currentTime)} / ${formatAudioSeconds(duration)}`
    : duration > 0
      ? formatAudioSeconds(duration)
      : 'تسجيل صوتي';

  return (
    <View style={styles.row}>
      {/* Play / pause */}
      <Pressable
        onPress={toggle}
        style={[styles.playBtn, { backgroundColor: accent }]}
        hitSlop={4}
      >
        {status.playing ? (
          <Ionicons name="pause" size={17} color="#FFFFFF" />
        ) : (
          <Ionicons name="play" size={17} color="#FFFFFF" style={{ marginLeft: 2 }} />
        )}
      </Pressable>

      {/* Waveform + duration */}
      <View style={styles.mid}>
        <WaveBars
          bars={bars}
          playedBars={playedBars}
          played={accent}
          onSeek={seek}
        />
        <Text style={styles.durationText}>{label}</Text>
      </View>

      {/* Avatar + mic badge */}
      <View style={styles.avatarWrap}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarLetter}>{(avatarFallback || ' ').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.micBadge}>
          <MaterialCommunityIcons name="microphone" size={8} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
};

const WaveBars: React.FC<{
  bars: number[];
  playedBars: number;
  played: string;
  onSeek: (evt: any, width: number) => void;
}> = ({ bars, playedBars, played, onSeek }) => {
  const [width, setWidth] = useState(0);
  return (
    <Pressable
      style={styles.barsTrack}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => onSeek(e, width)}
    >
      {bars.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: h, backgroundColor: i < playedBars ? played : '#B6C3C9' },
          ]}
        />
      ))}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 225,
    maxWidth: 280,
    gap: 8,
    paddingVertical: 2,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: {
    flex: 1,
    justifyContent: 'center',
  },
  barsTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  bar: {
    width: 2.5,
    borderRadius: 2,
  },
  durationText: {
    fontSize: 10,
    color: '#667781',
    marginTop: 1,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#C4CDD1',
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#8AA0A9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  micBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#53BDEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const AudioMessageBubble = React.memo(AudioMessageBubbleComponent);
