import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Image } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { createAudioPlayer, AudioPlayer, AudioStatus } from 'expo-audio';
import { Message } from '../types/crm';
import { Colors } from '../constants/theme';
import { formatAudioSeconds, waveformBars } from '../services/media';

// Only one voice note plays at a time — starting one pauses the previous.
let activePlayer: { key: string; pause: () => void } | null = null;

const SPEEDS = [1, 1.5, 2];
const MAX_BARS = 72;

interface AudioMessageBubbleProps {
  message: Message;
  uri: string;
  isOutgoing: boolean;
  avatarUri?: string | null;
  avatarFallback?: string;
}

/** WhatsApp voice-note look: play control on one end of the bubble, the
 *  sender avatar on the other end (it swaps to a 1×/1.5×/2× speed control
 *  while playing), and a dense seekable waveform filling the middle. */
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
  const rateRef = useRef(1);
  const [rate, setRate] = useState(1);
  const [status, setStatus] = useState<Pick<AudioStatus, 'playing' | 'currentTime' | 'duration' | 'isLoaded' | 'didJustFinish'>>({
    playing: false,
    currentTime: 0,
    duration: 0,
    isLoaded: false,
    didJustFinish: false,
  });

  const bars = useMemo(() => waveformBars(key, MAX_BARS), [key]);

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
      try {
        p.shouldCorrectPitch = true;
        p.setPlaybackRate(rateRef.current, 'high');
      } catch {}
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

  const cycleRate = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rateRef.current) + 1) % SPEEDS.length];
    rateRef.current = next;
    setRate(next);
    try {
      playerRef.current?.setPlaybackRate(next, 'high');
    } catch {}
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
  const accent = Colors.primary;
  const dimColor = isOutgoing ? '#9FCDAA' : '#B9C6CC';
  const iconColor = '#54656F';

  // While the note plays, the avatar spot turns into the speed control.
  const showSpeed = status.playing || (status.currentTime > 0 && !status.didJustFinish);

  const label =
    status.currentTime > 0 && !status.didJustFinish
      ? formatAudioSeconds(status.currentTime)
      : duration > 0
        ? formatAudioSeconds(duration)
        : 'تسجيل صوتي';

  const avatarOrSpeed = showSpeed ? (
    <Pressable
      onPress={cycleRate}
      style={[styles.speedCircle, { borderColor: accent }]}
      hitSlop={5}
    >
      <Text style={[styles.speedText, { color: accent }]}>{rate}×</Text>
    </Pressable>
  ) : (
    <View style={styles.avatarWrap}>
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarLetter}>
            {(avatarFallback || ' ').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={[styles.micBadge, { borderColor: isOutgoing ? '#D9FDD3' : '#FFFFFF' }]}>
        <MaterialCommunityIcons name="microphone" size={8} color="#FFFFFF" />
      </View>
    </View>
  );

  const playBtn = (
    <Pressable onPress={toggle} style={styles.playBtn} hitSlop={6}>
      {status.playing ? (
        <Ionicons name="pause" size={26} color={iconColor} />
      ) : (
        <Ionicons name="play" size={26} color={iconColor} style={{ marginLeft: 3 }} />
      )}
    </Pressable>
  );

  const wave = (
    <View style={styles.mid}>
      <WaveBars
        bars={bars}
        playedRatio={playedRatio}
        played={accent}
        dim={dimColor}
        onSeek={seek}
      />
      <View style={styles.metaRow}>
        <MaterialCommunityIcons name="microphone" size={10} color="#8696A0" />
        <Text style={styles.durationText}>{label}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.row}>
      {/* Play on one end, avatar/speed on the other — waveform fills
          the middle like WhatsApp. */}
      {isOutgoing ? (
        <>
          {playBtn}
          {wave}
          {avatarOrSpeed}
        </>
      ) : (
        <>
          {avatarOrSpeed}
          {wave}
          {playBtn}
        </>
      )}
    </View>
  );
};

const BAR_W = 2.5;
const BAR_GAP = 2;

const WaveBars: React.FC<{
  bars: number[];
  playedRatio: number;
  played: string;
  dim: string;
  onSeek: (evt: any, width: number) => void;
}> = ({ bars, playedRatio, played, dim, onSeek }) => {
  const [width, setWidth] = useState(0);
  // Fit as many bars as the real width allows — dense, even spacing,
  // never stretched apart.
  const count = Math.max(14, Math.min(bars.length, Math.floor((width + BAR_GAP) / (BAR_W + BAR_GAP))));
  const shown = bars.slice(0, count);
  const thumbX = Math.max(0, Math.min(1, playedRatio)) * width;
  return (
    <Pressable
      style={styles.barsTrack}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onPress={(e) => onSeek(e, width)}
    >
      {shown.map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: h, backgroundColor: i / count < playedRatio ? played : dim },
          ]}
        />
      ))}
      {width > 0 && playedRatio > 0 ? (
        <View
          style={[
            styles.thumb,
            {
              left: Math.min(width - 11, Math.max(0, thumbX - 5.5)),
              backgroundColor: '#53BDEB',
            },
          ]}
        />
      ) : null}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 230,
    maxWidth: 290,
    gap: 10,
    paddingVertical: 3,
  },
  playBtn: {
    width: 32,
    height: 40,
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
    gap: BAR_GAP,
    height: 24,
    position: 'relative',
  },
  bar: {
    width: BAR_W,
    borderRadius: 2,
  },
  thumb: {
    position: 'absolute',
    top: 6.5,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    elevation: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  durationText: {
    fontSize: 10.5,
    color: '#667781',
    fontVariant: ['tabular-nums'],
  },
  speedCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  speedText: {
    fontSize: 13,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C4CDD1',
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8AA0A9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  micBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#53BDEB',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});

export const AudioMessageBubble = React.memo(AudioMessageBubbleComponent);
