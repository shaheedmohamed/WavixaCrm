import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  Pressable,
  ScrollView,
  Dimensions,
  Linking,
  TouchableOpacity,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface GalleryMediaItem {
  id: string | number;
  uri: string;
  kind: 'image' | 'video';
  caption?: string | null;
  senderName?: string | null;
  timestamp?: string | null;
}

interface MediaViewerModalProps {
  visible: boolean;
  items: GalleryMediaItem[];
  initialIndex: number;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  visible,
  items,
  initialIndex,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const filmstripRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
    }
  }, [visible, initialIndex, items.length]);

  useEffect(() => {
    if (visible && filmstripRef.current && items.length > 0) {
      // Scroll filmstrip to center active thumbnail
      const itemWidth = 56;
      const screenWidth = Dimensions.get('window').width;
      const offset = Math.max(0, currentIndex * itemWidth - screenWidth / 2 + itemWidth / 2);
      filmstripRef.current.scrollTo({ x: offset, animated: true });
    }
  }, [currentIndex, visible, items.length]);

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex] || items[0];
  if (!currentItem) return null;

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const handleDownload = () => {
    if (currentItem?.uri) {
      Linking.openURL(currentItem.uri).catch(() => {});
    }
  };

  const formatTime = (ts?: string | null) => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        {/* Top Header Bar */}
        <View style={[styles.headerBar, { top: Math.max(insets.top, 12) }]}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {currentItem.senderName || 'الوسائط'}
            </Text>
            <Text style={styles.headerSub}>
              {formatTime(currentItem.timestamp)}{' '}
              {items.length > 1 ? `• (${currentIndex + 1} من ${items.length})` : ''}
            </Text>
          </View>

          <TouchableOpacity onPress={handleDownload} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="download-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Media Stage */}
        <View style={styles.stage}>
          {currentItem.kind === 'image' ? (
            <Image
              source={{ uri: currentItem.uri }}
              style={styles.mediaImage}
              resizeMode="contain"
            />
          ) : (
            <FullscreenVideo key={currentItem.uri} uri={currentItem.uri} />
          )}

          {/* Previous Arrow Button */}
          {currentIndex > 0 && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnPrev]}
              onPress={handlePrev}
              hitSlop={8}
            >
              <Ionicons name="chevron-forward" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          {/* Next Arrow Button */}
          {currentIndex < items.length - 1 && (
            <TouchableOpacity
              style={[styles.navBtn, styles.navBtnNext]}
              onPress={handleNext}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Caption Bar */}
        {currentItem.caption ? (
          <View style={styles.captionBar}>
            <Text style={styles.captionText}>{currentItem.caption}</Text>
          </View>
        ) : null}

        {/* Bottom Filmstrip Carousel */}
        {items.length > 1 && (
          <View style={[styles.filmstripContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <ScrollView
              ref={filmstripRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filmstripScroll}
            >
              {items.map((it, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <TouchableOpacity
                    key={`${it.id}-${idx}`}
                    onPress={() => setCurrentIndex(idx)}
                    activeOpacity={0.8}
                    style={[
                      styles.thumbnailWrap,
                      isActive && styles.thumbnailActive,
                    ]}
                  >
                    <Image
                      source={{ uri: it.uri }}
                      style={styles.thumbnail}
                      resizeMode="cover"
                    />
                    {it.kind === 'video' && (
                      <View style={styles.thumbVideoBadge}>
                        <Ionicons name="play" size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

const FullscreenVideo: React.FC<{ uri: string }> = ({ uri }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  return <VideoView player={player} style={styles.mediaVideo} contentFit="contain" nativeControls />;
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#0C1317',
    justifyContent: 'space-between',
  },
  headerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(12, 19, 23, 0.75)',
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 12,
  },
  headerTitle: {
    color: '#E9EDEF',
    fontSize: 14,
    fontWeight: '700',
  },
  headerSub: {
    color: '#8696A0',
    fontSize: 11,
    marginTop: 2,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginTop: 60,
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaVideo: {
    width: '100%',
    height: '100%',
  },
  navBtn: {
    position: 'absolute',
    top: '46%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  navBtnPrev: {
    right: 14,
  },
  navBtnNext: {
    left: 14,
  },
  captionBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(12, 19, 23, 0.85)',
  },
  captionText: {
    color: '#E9EDEF',
    fontSize: 13,
    textAlign: 'center',
  },
  filmstripContainer: {
    backgroundColor: 'rgba(12, 19, 23, 0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#202C33',
    paddingTop: 8,
  },
  filmstripScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  thumbnailWrap: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.6,
    position: 'relative',
  },
  thumbnailActive: {
    borderColor: '#00A884',
    opacity: 1,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbVideoBadge: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
});
