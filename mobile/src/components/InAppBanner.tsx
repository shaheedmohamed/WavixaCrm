import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { realtime } from '../services/realtime';
import { playIncomingMessage } from '../services/notifySound';
import { Colors } from '../constants/theme';

interface BannerData {
  conversationId: number;
  name: string;
  preview: string;
}

const TYPE_LABEL: Record<string, string> = {
  image: '📷 صورة',
  video: '🎥 فيديو',
  audio: '🎵 تسجيل صوتي',
  voice: '🎵 تسجيل صوتي',
  document: '📄 ملف',
  sticker: 'ملصق',
  location: '📍 موقع',
  contact: '👤 جهة اتصال',
};

const AUTO_HIDE_MS = 4200;

/**
 * WhatsApp-style in-app heads-up: an incoming message for a chat you're
 * NOT looking at slides down from the top — tap to jump into that chat,
 * swipe up to dismiss early. Suppressed for the currently open room (the
 * bubble just appears there) and for outgoing echoes.
 */
export const InAppBanner: React.FC<{
  activeConversationId: number | null;
  onOpen: (conversationId: number) => void;
}> = ({ activeConversationId, onOpen }) => {
  const insets = useSafeAreaInsets();
  const [banner, setBanner] = useState<BannerData | null>(null);
  const translateY = useSharedValue(-140);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeConvRef = useRef<number | null>(activeConversationId);

  useEffect(() => {
    activeConvRef.current = activeConversationId;
  }, [activeConversationId]);

  const hide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are mutated by design
    translateY.value = withTiming(-140, { duration: 200, easing: Easing.in(Easing.cubic) });
    setBanner(null);
  }, [translateY]);

  const show = useCallback(
    (data: BannerData) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setBanner(data);
      // eslint-disable-next-line react-hooks/immutability -- reanimated shared values are mutated by design
      translateY.value = withSpring(0, { damping: 16, stiffness: 220 });
      hideTimer.current = setTimeout(hide, AUTO_HIDE_MS);
    },
    [translateY, hide]
  );

  useEffect(() => {
    const off = realtime.on((ev) => {
      if (ev.type !== 'message.new') return;
      const d = ev.data || {};
      const convId = d.conversation_id;
      const m = d.message || {};
      if (!convId || m.direction !== 'incoming') return;
      if (convId === activeConvRef.current) return;

      const conv = d.conversation || {};
      const name =
        conv.contact_name ||
        (conv.contact_phone ? `+${conv.contact_phone}` : 'رسالة جديدة');
      const preview =
        m.message && String(m.message).trim()
          ? String(m.message)
          : TYPE_LABEL[String(m.message_type)] || 'رسالة جديدة';

      show({ conversationId: convId, name, preview });
      playIncomingMessage();
    });
    return off;
  }, [show]);

  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const open = useCallback(() => {
    if (banner) onOpen(banner.conversationId);
    hide();
  }, [banner, onOpen, hide]);

  /* eslint-disable react-hooks/refs -- gesture callbacks execute on the UI
     thread via runOnJS, never during render. */
  const swipeUp = Gesture.Pan()
    .onEnd((e) => {
      'worklet';
      if (e.velocityY < -250 || e.translationY < -30) runOnJS(hide)();
    });

  const tap = Gesture.Tap().onEnd(() => { 'worklet'; runOnJS(open)(); });
  /* eslint-enable react-hooks/refs */

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!banner) return null;

  return (
    <GestureDetector gesture={Gesture.Exclusive(swipeUp, tap)}>
      <Animated.View
        style={[
          styles.wrap,
          { top: insets.top + 6 },
          animStyle,
        ]}
      >
        <TouchableOpacity activeOpacity={0.95} onPress={open} style={styles.card}>
          <Animated.View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(banner.name || '؟').trim().charAt(0)}
            </Text>
          </Animated.View>
          <Animated.View style={styles.texts}>
            <Text style={styles.name} numberOfLines={1}>{banner.name}</Text>
            <Text style={styles.preview} numberOfLines={2}>{banner.preview}</Text>
          </Animated.View>
          <Ionicons name="chevron-down" size={16} color="#8696A0" />
        </TouchableOpacity>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 8000,
    elevation: 8000,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2C34',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  texts: { flex: 1 },
  name: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  preview: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 2,
    textAlign: 'right',
    lineHeight: 18,
  },
});
