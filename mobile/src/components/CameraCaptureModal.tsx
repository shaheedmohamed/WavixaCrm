import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CameraView,
  useCameraPermissions,
  useMicrophonePermissions,
  type CameraType,
  type FlashMode,
} from 'expo-camera';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PendingMedia } from './MediaComposerModal';

interface RecentItem {
  id: string;
  thumbUri: string;
  isVideo: boolean;
  durationSec?: number;
  pending: PendingMedia;
}

interface CameraCaptureModalProps {
  visible: boolean;
  paused?: boolean;
  onClose: () => void;
  onCaptured: (media: PendingMedia) => void;
}

const MAX_VIDEO_SEC = 300;

const formatRecTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const needsFileResolve = (uri: string) =>
  uri.startsWith('ph://') || uri.startsWith('assets-library://');

/** Single filmstrip cell — generates a video poster lazily. */
const RecentThumb = React.memo(function RecentThumb({
  item,
  onPress,
}: {
  item: RecentItem;
  onPress: () => void;
}) {
    const [thumb, setThumb] = useState(item.isVideo ? null : item.thumbUri);

    useEffect(() => {
      let alive = true;
      if (item.isVideo) {
        VideoThumbnails.getThumbnailAsync(item.thumbUri, { time: 0 })
          .then((r) => {
            if (alive) setThumb(r.uri);
          })
          .catch(() => {});
      }
      return () => {
        alive = false;
      };
    }, [item]);

    return (
      <TouchableOpacity style={styles.thumb} onPress={onPress} activeOpacity={0.85}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumbImg} />
        ) : (
          <View style={[styles.thumbImg, styles.thumbPlaceholder]}>
            <Ionicons name="videocam" size={18} color="#8696A0" />
          </View>
        )}
        {item.isVideo && (
          <View style={styles.thumbVideoBadge}>
            <Ionicons name="videocam" size={10} color="#FFF" />
            <Text style={styles.thumbVideoText}>
              {item.durationSec ? formatRecTime(Math.round(item.durationSec)) : ''}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }
);

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  visible,
  paused = false,
  onClose,
  onCaptured,
}) => {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && (
        <CameraCaptureBody paused={paused} onClose={onClose} onCaptured={onCaptured} />
      )}
    </Modal>
  );
};

const CameraCaptureBody: React.FC<{
  paused: boolean;
  onClose: () => void;
  onCaptured: (media: PendingMedia) => void;
}> = ({ paused, onClose, onCaptured }) => {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const camGranted = camPerm?.granted === true;
  const [, requestMicPerm] = useMicrophonePermissions();

  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [camReady, setCamReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [recents, setRecents] = useState<RecentItem[]>([]);

  const recordingRef = useRef(false);
  const holdingRef = useRef(false);
  const holdFlipRef = useRef(false);
  const fromHoldRef = useRef(false);
  const kickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const loadRecents = useCallback(async () => {
    try {
      let perm = await MediaLibrary.getPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) {
        perm = await MediaLibrary.requestPermissionsAsync();
      }
      if (!perm.granted) return;

      const page = await MediaLibrary.getAssetsAsync({
        first: 24,
        mediaType: ['photo', 'video'],
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });

      const items: RecentItem[] = await Promise.all(
        page.assets.map(async (a) => {
          let fileUri = a.uri;
          if (needsFileResolve(a.uri)) {
            try {
              const info = await MediaLibrary.getAssetInfoAsync(a);
              if (info.localUri) fileUri = info.localUri;
            } catch {}
          }
          const isVideo = a.mediaType === 'video';
          const durationSec = isVideo && a.duration > 0 ? a.duration : undefined;
          return {
            id: a.id,
            thumbUri: fileUri,
            isVideo,
            durationSec,
            pending: {
              uri: fileUri,
              name:
                a.filename ||
                (isVideo ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`),
              mimeType: isVideo ? 'video/mp4' : 'image/jpeg',
              type: isVideo ? 'video' : 'image',
              width: a.width,
              height: a.height,
              durationSec,
            } as PendingMedia,
          };
        })
      );
      setRecents(items);
    } catch {}
  }, []);

  useEffect(() => {
    if (!camPerm?.granted && camPerm?.canAskAgain !== false) {
      requestCamPerm();
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async media-library sync
    loadRecents();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (kickRef.current) clearTimeout(kickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Freeze the live preview while the composer sits on top — resumes the
  // instant it closes, so returning feels instant like WhatsApp.
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam) return;
    if (paused) cam.pausePreview().catch(() => {});
    else cam.resumePreview().catch(() => {});
  }, [paused]);

  const emitCaptured = useCallback(
    (media: PendingMedia) => {
      onCaptured(media);
    },
    [onCaptured]
  );

  const takePhoto = useCallback(async () => {
    if (!camReady || recordingRef.current) return;
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 1 });
      if (!pic?.uri) return;
      emitCaptured({
        uri: pic.uri,
        name: `photo_${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        type: 'image',
        width: pic.width,
        height: pic.height,
      });
    } catch {}
  }, [camReady, emitCaptured]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    if (!camReady || recordingRef.current) return false;
    const mic = await requestMicPerm();
    if (!mic.granted) return false;

    recordingRef.current = true;
    setRecording(true);
    setRecSec(0);
    timerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);

    let ok = false;
    try {
      // Rejects fast while the video use case is still binding.
      const res = await cameraRef.current?.recordAsync({
        maxDuration: MAX_VIDEO_SEC,
      });
      if (res?.uri) {
        emitCaptured({
          uri: res.uri,
          name: `video_${Date.now()}.mp4`,
          mimeType: 'video/mp4',
          type: 'video',
        });
        ok = true;
      }
    } catch {}
    recordingRef.current = false;
    setRecording(false);
    stopTimer();
    if (fromHoldRef.current) {
      fromHoldRef.current = false;
      setMode('photo');
    }
    return ok;
  }, [camReady, emitCaptured, requestMicPerm]);

  const stopRecording = useCallback(() => {
    if (recordingRef.current) {
      cameraRef.current?.stopRecording();
    }
  }, []);

  // Hold-to-record from photo mode: flip the camera to video mode, then
  // retry recordAsync until the rebound video use case accepts it or the
  // finger lifts.
  const beginHoldRecord = useCallback(async () => {
    if (!camGranted || recordingRef.current) return;
    const mic = await requestMicPerm();
    if (!mic.granted) return;
    holdingRef.current = true;
    holdFlipRef.current = true;
    fromHoldRef.current = true;
    setMode('video');
    let attempts = 0;
    const tryStart = () => {
      kickRef.current = null;
      if (!holdingRef.current || recordingRef.current || attempts++ > 15) return;
      startRecording().then(() => {
        // Settles when the recording ends OR rejects while still binding.
        if (!recordingRef.current && holdingRef.current) {
          kickRef.current = setTimeout(tryStart, 120);
        }
      });
    };
    kickRef.current = setTimeout(tryStart, 80);
  }, [camGranted, requestMicPerm, startRecording]);

  const endHoldRecord = useCallback(() => {
    holdingRef.current = false;
    if (kickRef.current) {
      clearTimeout(kickRef.current);
      kickRef.current = null;
    }
    if (recordingRef.current) {
      stopRecording();
    } else {
      fromHoldRef.current = false;
      if (holdFlipRef.current) setMode('photo');
    }
    holdFlipRef.current = false;
  }, [stopRecording]);

  const toggleRecording = useCallback(() => {
    if (recordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  const openGallery = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      emitCaptured({
        uri: asset.uri,
        name:
          asset.fileName ||
          asset.uri.split('/').pop() ||
          (isVideo ? `video_${Date.now()}.mp4` : `photo_${Date.now()}.jpg`),
        mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        type: isVideo ? 'video' : 'image',
        width: asset.width,
        height: asset.height,
        durationSec: asset.duration
          ? asset.duration > 1000
            ? asset.duration / 1000
            : asset.duration
          : undefined,
        fileSize: asset.fileSize,
      });
    } catch {}
  }, [emitCaptured]);

  const flashIcon =
    flash === 'on' ? 'flash' : flash === 'auto' ? 'flash-outline' : 'flash-off';
  const nextFlash: FlashMode = flash === 'off' ? 'on' : flash === 'on' ? 'auto' : 'off';

  return (
    <View style={styles.root}>
      {camGranted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode={mode === 'video' ? 'video' : 'picture'}
            flash={flash}
            mirror={facing === 'front'}
            enableTorch={flash === 'on' && mode === 'video'}
            onCameraReady={() => setCamReady(true)}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.permFallback]}>
            <Ionicons name="camera-outline" size={56} color="#8696A0" />
            <Text style={styles.permText}>الكاميرا محتاجة إذن عشان تشتغل</Text>
            {camPerm?.canAskAgain !== false && (
              <TouchableOpacity style={styles.permBtn} onPress={() => requestCamPerm()}>
                <Text style={styles.permBtnText}>السماح بالكاميرا</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.topBtn} onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          {recording ? (
            <View style={styles.recPill}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>{formatRecTime(recSec)}</Text>
            </View>
          ) : (
            camGranted && (
              <TouchableOpacity
                style={styles.topBtn}
                onPress={() => setFlash(nextFlash)}
                hitSlop={10}
              >
                <Ionicons name={flashIcon as any} size={24} color="#FFF" />
              </TouchableOpacity>
            )
          )}
        </View>

        {/* Bottom controls */}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
          {recents.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filmstrip}
            >
              {recents.map((item) => (
                <RecentThumb
                  key={item.id}
                  item={item}
                  onPress={() => emitCaptured(item.pending)}
                />
              ))}
            </ScrollView>
          )}

          <View style={styles.controlsRow}>
            <TouchableOpacity style={styles.sideBtn} onPress={openGallery} hitSlop={8}>
              <Ionicons name="images" size={26} color="#FFF" />
            </TouchableOpacity>

            <Pressable
              style={[styles.shutter, recording && styles.shutterRecording]}
              onPress={mode === 'photo' ? takePhoto : toggleRecording}
              onLongPress={mode === 'photo' ? beginHoldRecord : undefined}
              onPressOut={mode === 'photo' ? endHoldRecord : undefined}
              delayLongPress={250}
              disabled={!camGranted}
            >
              <View
                style={[styles.shutterInner, recording && styles.shutterInnerRecording]}
              />
            </Pressable>

            <TouchableOpacity
              style={styles.sideBtn}
              onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              hitSlop={8}
              disabled={!camGranted}
            >
              <MaterialCommunityIcons name="camera-flip-outline" size={26} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.modeRow}>
            {(['video', 'photo'] as const).map((m) => (
              <TouchableOpacity key={m} onPress={() => setMode(m)} activeOpacity={0.7}>
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                  {m === 'photo' ? 'صورة' : 'فيديو'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
    </View>
  );
};

const THUMB = 54;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  permFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  permText: { color: '#E9EDEF', fontSize: 15, fontWeight: '600' },
  permBtn: {
    backgroundColor: '#00A884',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  permBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  topBtn: { padding: 6 },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 6,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' },
  recText: { color: '#FFF', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  filmstrip: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1F2C34',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbVideoBadge: {
    position: 'absolute',
    bottom: 2,
    left: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  thumbVideoText: { color: '#FFF', fontSize: 9, fontWeight: '700' },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    marginTop: 14,
  },
  sideBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRecording: { borderColor: '#EF4444' },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF',
  },
  shutterInnerRecording: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  modeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 26,
    marginTop: 12,
  },
  modeText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  modeTextActive: { color: '#FFF', fontWeight: '800' },
});
