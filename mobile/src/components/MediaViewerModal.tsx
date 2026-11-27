import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  ScrollView,
  Dimensions,
  Linking,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { ZoomableImage } from './ZoomableImage';
import { useSwipeDownDismiss } from '../hooks/useSwipeDownDismiss';

export interface GalleryMediaItem {
  id: string | number;
  uri: string;
  downloadUri?: string | null;
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

const { width: SCREEN_W } = Dimensions.get('window');

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({
  visible,
  items,
  initialIndex,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const filmstripRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const pagerRef = useRef<FlatList<GalleryMediaItem>>(null);
  // 1 while the visible page's image is zoomed — veto on pull-to-dismiss so
  // a vertical drag pans the photo instead of closing the viewer.
  const zoomedSV = useSharedValue(0);
  // JS mirror of zoomedSV — disables horizontal paging while a photo is
  // zoomed so drags pan the image instead of flipping pages.
  const [isZoomed, setIsZoomed] = useState(false);
  const { pan, containerStyle, reset } = useSwipeDownDismiss(onClose, {
    blockedSV: zoomedSV,
  });

  useEffect(() => {
    if (visible) {
      Promise.resolve().then(() => {
        setCurrentIndex(Math.max(0, Math.min(initialIndex, items.length - 1)));
        setIsZoomed(false);
      });
      zoomedSV.value = 0;
      reset();
    }
  }, [visible, initialIndex, items.length, reset, zoomedSV]);

  useEffect(() => {
    if (visible && filmstripRef.current && items.length > 0) {
      const itemWidth = 56;
      const screenWidth = Dimensions.get('window').width;
      const offset = Math.max(0, currentIndex * itemWidth - screenWidth / 2 + itemWidth / 2);
      filmstripRef.current.scrollTo({ x: offset, animated: true });
    }
  }, [currentIndex, visible, items.length]);

  /* eslint-disable react-hooks/immutability -- shared-value writes from JS
     callbacks are the standard reanimated bridge, not render mutation. */
  const handleScaleChange = useCallback(
    (scale: number) => {
      const z = scale > 1.03;
      zoomedSV.value = z ? 1 : 0;
      setIsZoomed(z);
    },
    [zoomedSV]
  );

  const handlePageSettled = useCallback(
    (e: { nativeEvent: { contentOffset: { x: number } } }) => {
      const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
      if (idx !== currentIndex) {
        zoomedSV.value = 0;
        setIsZoomed(false);
        setCurrentIndex(Math.max(0, Math.min(idx, items.length - 1)));
      }
    },
    [currentIndex, items.length, zoomedSV]
  );

  const jumpToPage = useCallback(
    (idx: number) => {
      pagerRef.current?.scrollToIndex({ index: idx, animated: true });
      zoomedSV.value = 0;
      setIsZoomed(false);
      setCurrentIndex(idx);
    },
    [zoomedSV]
  );
  /* eslint-enable react-hooks/immutability */

  const renderPage = useCallback(
    ({ item, index }: { item: GalleryMediaItem; index: number }) => (
      <View style={styles.page}>
        {item.kind === 'image' ? (
          <ZoomableImage uri={item.uri} showControls onScaleChange={handleScaleChange} />
        ) : (
          <FullscreenVideo uri={item.uri} active={index === currentIndex} />
        )}
      </View>
    ),
    [handleScaleChange, currentIndex]
  );

  const getPageLayout = useCallback(
    (_: ArrayLike<GalleryMediaItem> | null | undefined, index: number) => ({
      length: SCREEN_W,
      offset: SCREEN_W * index,
      index,
    }),
    []
  );

  if (!items || items.length === 0) return null;

  const clampedIndex = Math.max(0, Math.min(currentIndex, items.length - 1));
  const currentItem = items[clampedIndex] || items[0];
  if (!currentItem) return null;

  const handleDownload = () => {
    const dl = currentItem.downloadUri || currentItem.uri;
    if (dl) {
      Linking.openURL(dl).catch(() => {});
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
      {/* Android modals sit in a separate view hierarchy — gestures inside
          need their own root view. */}
      <GestureHandlerRootView style={styles.gestureRoot}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.backdrop, containerStyle]}>
          <View style={[styles.headerBar, { paddingTop: Math.max(insets.top + 8, 18) }]}>
            <TouchableOpacity onPress={onClose} style={styles.headerBtn} hitSlop={12}>
              <Ionicons name="arrow-forward" size={23} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerInfo}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {currentItem.senderName || 'الوسائط'}
              </Text>
              <Text style={styles.headerSub}>
                {formatTime(currentItem.timestamp)}{' '}
                {items.length > 1 ? `• (${clampedIndex + 1} من ${items.length})` : ''}
              </Text>
            </View>

            <TouchableOpacity onPress={handleDownload} style={styles.headerBtn} hitSlop={12}>
              <Ionicons name="download-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.stage}>
            {/* Page order is the gallery order: items run old → new, and the
                pager flips itself under RTL so "next" always follows the
                reading direction — no buttons needed. */}
            <FlatList
              ref={pagerRef}
              key={`pager-${initialIndex}-${items.length}`}
              data={items}
              horizontal
              pagingEnabled
              initialScrollIndex={clampedIndex}
              getItemLayout={getPageLayout}
              keyExtractor={(it, idx) => `${it.id}-${idx}`}
              showsHorizontalScrollIndicator={false}
              scrollEnabled={!isZoomed}
              windowSize={3}
              maxToRenderPerBatch={1}
              initialNumToRender={1}
              onMomentumScrollEnd={handlePageSettled}
              onScrollToIndexFailed={(info) => {
                pagerRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: false,
                });
              }}
              renderItem={renderPage}
            />
          </View>

          {currentItem.caption ? (
            <View style={styles.captionBar}>
              <Text style={styles.captionText}>{currentItem.caption}</Text>
            </View>
          ) : null}

          {items.length > 1 && (
            <View style={[styles.filmstripContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <ScrollView
                ref={filmstripRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filmstripScroll}
              >
                {items.map((it, idx) => {
                  const isActive = idx === clampedIndex;
                  return (
                    <TouchableOpacity
                      key={`${it.id}-${idx}`}
                      onPress={() => jumpToPage(idx)}
                      activeOpacity={0.8}
                      style={[
                        styles.thumbnailWrap,
                        isActive && styles.thumbnailActive,
                      ]}
                    >
                      {it.kind === 'image' ? (
                        <Image
                          source={{ uri: it.uri }}
                          style={styles.thumbnail}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.videoThumbBox}>
                          <Ionicons name="videocam" size={18} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
};

const FullscreenVideo: React.FC<{ uri: string; active: boolean }> = ({ uri, active }) => {
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  // Off-screen pages stay mounted inside the pager window — pause them so a
  // neighbouring clip doesn't keep playing audio while hidden.
  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [player, active]);
  return <VideoView player={player} style={styles.mediaVideo} contentFit="contain" nativeControls />;
};

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#0C1317',
    justifyContent: 'space-between',
  },
  headerBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    backgroundColor: 'rgba(12, 19, 23, 0.85)',
    zIndex: 20,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'flex-end',
    marginHorizontal: 12,
  },
  headerTitle: {
    color: '#E9EDEF',
    fontSize: 14.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  headerSub: {
    color: '#8696A0',
    fontSize: 11,
    marginTop: 1,
    textAlign: 'right',
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  page: {
    width: SCREEN_W,
    flex: 1,
  },
  mediaVideo: {
    width: '100%',
    height: '100%',
  },
  captionBar: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'rgba(12, 19, 23, 0.88)',
  },
  captionText: {
    color: '#E9EDEF',
    fontSize: 13.5,
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
  videoThumbBox: {
    flex: 1,
    backgroundColor: '#1F2C34',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
