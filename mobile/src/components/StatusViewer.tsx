import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  Dimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { StatusItem, StatusGroup } from '../types/crm';
import { statusMediaSrc, resolveUrl } from '../services/media';
import { chatService } from '../services/chatService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const IMAGE_DURATION = 5000;

// Full-screen story playback for ONE contact — every item plays in order,
// progress bars segment like WhatsApp, taps move forward/back, the whole
// thing exits when the ring finishes.
interface StatusViewerProps {
  visible: boolean;
  group: StatusGroup | null;
  token: string | null;
  onClose: () => void;
  // Fired once per item so the parent can flip it to the "viewed" bucket.
  onItemViewed?: (id: number) => void;
}

const fmtTime = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    const t = `${h}:${m} ${ap}`;
    if (sameDay) return `اليوم ${t}`;
    const yesterday = new Date(now.getTime() - 86400000);
    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return `أمس ${t}`;
    }
    return `${d.getDate()}/${d.getMonth() + 1} ${t}`;
  } catch {
    return '';
  }
};

const initials = (name?: string | null): string => {
  const n = (name || '').trim();
  if (!n) return '?';
  return n.replace(/^\+/, '').slice(0, 2);
};

const StatusVideo: React.FC<{ uri: string; onEnd: () => void }> = ({ uri, onEnd }) => {
  const ended = useRef(false);
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      if (!ended.current) {
        ended.current = true;
        onEnd();
      }
    });
    return () => sub.remove();
  }, [player, onEnd]);
  return (
    <VideoView
      player={player}
      style={styles.media}
      contentFit="contain"
      nativeControls={false}
      // textureView stays inside the RN view tree — surfaceView would punch
      // through on Android and bury the progress bars, header and tap zones.
      surfaceType="textureView"
    />
  );
};

export const StatusViewer: React.FC<StatusViewerProps> = ({
  visible,
  group,
  token,
  onClose,
  onItemViewed,
}) => {
  // WhatsApp plays a contact's ring oldest → newest; the API hands items
  // newest-first, so flip once.
  const items = useMemo(
    () => (group ? [...group.items].reverse() : []),
    [group]
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const current: StatusItem | undefined = items[index];

  const markViewed = useCallback(
    (item?: StatusItem) => {
      if (!item || item.viewed_at || item.is_mine) return;
      item.viewed_at = new Date().toISOString();
      chatService.viewStatus(item.id).catch(() => {});
      onItemViewed?.(item.id);
    },
    [onItemViewed]
  );

  const goNext = useCallback(() => {
    setIndex((i) => {
      if (i >= items.length - 1) {
        onClose();
        return i;
      }
      return i + 1;
    });
    setProgress(0);
  }, [items.length, onClose]);

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
    setProgress(0);
  }, []);

  // Reset playback when the modal opens — render-phase adjust avoids a
  // reset effect firing a frame late. Start like WhatsApp: the first
  // UNSEEN story; an all-watched ring replays from the NEWEST, not from a
  // months-old item.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const firstUnseen = items.findIndex((i) => !i.viewed_at && !i.deleted_at);
      setIndex(firstUnseen >= 0 ? firstUnseen : items.length - 1);
      setPaused(false);
      setProgress(0);
    }
  }

  useEffect(() => {
    markViewed(current);
  }, [current, markViewed]);

  // Auto-advance for text/image items — videos advance via playToEnd.
  useEffect(() => {
    if (!visible || !current || paused || current.type === 'video') return;
    let elapsed = 0;
    const step = 50;
    const timer = setInterval(() => {
      elapsed += step;
      setProgress(Math.min(elapsed / IMAGE_DURATION, 1));
      if (elapsed >= IMAGE_DURATION) {
        clearInterval(timer);
        goNext();
      }
    }, step);
    return () => clearInterval(timer);
  }, [visible, current, paused, goNext]);

  if (!group || items.length === 0) return null;

  const uri = statusMediaSrc(current, token);
  const isDeleted = !!current?.deleted_at;
  const isText = current?.type === 'text' || (!uri && !!current?.body);
  const isVideo = current?.type === 'video';
  const avatarUri = resolveUrl(group.poster_avatar);
  const name = group.poster_name || `+${group.poster_phone}`;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, isText && styles.rootText]}>
        <StatusBar barStyle="light-content" />

        {/* Content layer */}
        {isDeleted ? (
          <View style={styles.center}>
            <Ionicons name="trash-outline" size={46} color="rgba(255,255,255,0.5)" />
            <Text style={styles.deletedText}>تم حذف هذه الحالة</Text>
          </View>
        ) : isVideo && uri ? (
          <StatusVideo key={`v-${current.id}`} uri={uri} onEnd={goNext} />
        ) : uri && !isText ? (
          <Image
            key={`i-${current.id}`}
            source={{ uri }}
            style={styles.media}
            resizeMode="contain"
          />
        ) : isText ? (
          <View style={styles.center}>
            <Text style={styles.textBody}>{current?.body || ''}</Text>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}

        {/* Caption for image/video statuses */}
        {!isText && !isDeleted && !!current?.body && (
          <View style={styles.captionWrap}>
            <Text style={styles.captionText}>{current.body}</Text>
          </View>
        )}

        {/* Tap zones — right third goes back (RTL), left goes forward */}
        <Pressable
          style={styles.tapRight}
          onPress={goPrev}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />
        <Pressable
          style={styles.tapLeft}
          onPress={goNext}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />

        {/* Top overlay: progress + header */}
        <View style={styles.topOverlay}>
          <View style={styles.barsRow}>
            {items.map((it, i) => (
              <View key={it.id} style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width:
                        i < index
                          ? '100%'
                          : i === index
                            ? isVideo
                              ? '100%'
                              : `${progress * 100}%`
                            : '0%',
                    },
                  ]}
                />
              </View>
            ))}
          </View>

          <View style={styles.headerRow}>
            <Pressable onPress={onClose} hitSlop={12} style={styles.backBtn}>
              <Ionicons name="chevron-forward" size={26} color="#FFFFFF" />
            </Pressable>
            <View style={styles.avatar}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImg} />
              ) : (
                <Text style={styles.avatarText}>{initials(name)}</Text>
              )}
            </View>
            <View style={styles.headerText}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.time}>{fmtTime(current?.posted_at)}</Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  rootText: {
    backgroundColor: '#075E54',
  },
  media: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  textBody: {
    color: '#FFFFFF',
    fontSize: 26,
    textAlign: 'center',
    lineHeight: 40,
    fontWeight: '500',
  },
  deletedText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    marginTop: 14,
  },
  captionWrap: {
    position: 'absolute',
    bottom: 46,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  captionText: {
    color: '#FFFFFF',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 4,
  },
  tapRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: SCREEN_W * 0.35,
  },
  tapLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SCREEN_W * 0.65,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 14,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingBottom: 8,
  },
  barsRow: {
    flexDirection: 'row-reverse',
    gap: 4,
    marginBottom: 10,
  },
  barTrack: {
    flex: 1,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    padding: 2,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#54656F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 34,
    height: 34,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  headerText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
  },
  time: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    marginTop: 1,
  },
});
