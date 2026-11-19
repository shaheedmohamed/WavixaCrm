import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TextInput,
  TouchableOpacity,
  GestureResponderEvent,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardSafeView } from './KeyboardSafeView';
import { Colors } from '../constants/theme';
import { docInfo, formatAudioSeconds, formatBytes } from '../services/media';
import {
  CropRect,
  DrawStroke,
  MediaEditSpec,
  TextOverlayItem,
} from '../types/crm';

export interface PendingMedia {
  uri: string;
  name?: string;
  mimeType?: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';
  width?: number;
  height?: number;
  durationSec?: number;
  fileSize?: number;
}

interface MediaComposerModalProps {
  media: PendingMedia | null;
  recipientName?: string;
  /** 0-based position inside a multi-pick batch (0 when single). */
  queueIndex?: number;
  /** Total items in the batch (0/1 when single). */
  queueLength?: number;
  onClose: () => void;
  onSend: (caption: string, editSpec: MediaEditSpec | null) => void;
}

const PALETTE = [
  '#FFFFFF',
  '#00A884',
  '#EF4444',
  '#F59E0B',
  '#3B82F6',
  '#EC4899',
  '#A855F7',
  '#111B21',
];

const BRUSH_WIDTHS: { label: string; ratio: number; dot: number }[] = [
  { label: 'رفيع', ratio: 0.008, dot: 6 },
  { label: 'متوسط', ratio: 0.015, dot: 10 },
  { label: 'عريض', ratio: 0.026, dot: 15 },
];

type EditorTool = 'none' | 'crop' | 'draw' | 'text';

const DEFAULT_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

export const MediaComposerModal: React.FC<MediaComposerModalProps> = ({
  media,
  recipientName,
  queueIndex = 0,
  queueLength = 0,
  onClose,
  onSend,
}) => {
  if (!media) return null;
  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <MediaComposerBody
        key={media.uri}
        media={media}
        recipientName={recipientName}
        queueIndex={queueIndex}
        queueLength={queueLength}
        onClose={onClose}
        onSend={onSend}
      />
    </Modal>
  );
};

const MediaComposerBody: React.FC<{
  media: PendingMedia;
  recipientName?: string;
  queueIndex?: number;
  queueLength?: number;
  onClose: () => void;
  onSend: (caption: string, editSpec: MediaEditSpec | null) => void;
}> = ({ media, recipientName, queueIndex = 0, queueLength = 0, onClose, onSend }) => {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  const [activeTool, setActiveTool] = useState<EditorTool>('none');

  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number }>(() => ({
    w: media.width && media.width > 0 ? media.width : 1000,
    h: media.height && media.height > 0 ? media.height : 1000,
  }));
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>(() => {
    const { width, height } = Dimensions.get('window');
    return { w: width, h: Math.max(300, height - 200) };
  });

  const [rotation, setRotation] = useState(0);
  const [appliedCrop, setAppliedCrop] = useState<CropRect>(DEFAULT_CROP);
  const [draftCrop, setDraftCrop] = useState<CropRect>(DEFAULT_CROP);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [liveStroke, setLiveStroke] = useState<DrawStroke | null>(null);
  const [brushColor, setBrushColor] = useState('#00A884');
  const [brushWidthIdx, setBrushWidthIdx] = useState(1);

  const [texts, setTexts] = useState<TextOverlayItem[]>([]);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftTextColor, setDraftTextColor] = useState('#FFFFFF');
  const [draftTextBg, setDraftTextBg] = useState<'none' | 'dark' | 'solid'>('dark');
  const [draftTextSize, setDraftTextSize] = useState(0.055);

  const [videoDuration, setVideoDuration] = useState(() =>
    media.durationSec && media.durationSec > 0 ? media.durationSec : 0
  );
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(() =>
    media.durationSec && media.durationSec > 0 ? media.durationSec : 0
  );
  const [muteVideoAudio, setMuteVideoAudio] = useState(false);

  useEffect(() => {
    if (media.type === 'image' && (!media.width || !media.height)) {
      Image.getSize(
        media.uri,
        (w, h) => {
          if (w > 0 && h > 0) setNaturalSize({ w, h });
        },
        () => {}
      );
    }
  }, [media.type, media.uri, media.width, media.height]);

  const rotatedFullDims = useMemo(() => {
    const swapped = rotation % 180 !== 0;
    return swapped
      ? { w: naturalSize.h, h: naturalSize.w }
      : { w: naturalSize.w, h: naturalSize.h };
  }, [naturalSize, rotation]);

  const activeCropForView = activeTool === 'crop' ? DEFAULT_CROP : appliedCrop;

  const displayedAspect = useMemo(() => {
    const cw = Math.max(0.05, activeCropForView.w) * rotatedFullDims.w;
    const ch = Math.max(0.05, activeCropForView.h) * rotatedFullDims.h;
    return cw / Math.max(1, ch);
  }, [activeCropForView, rotatedFullDims]);

  const imgBox = useMemo(() => {
    const maxW = Math.max(120, stageSize.w - 20);
    const maxH = Math.max(120, stageSize.h - 20);
    let w = maxW;
    let h = w / Math.max(0.1, displayedAspect);
    if (h > maxH) {
      h = maxH;
      w = h * displayedAspect;
    }
    return {
      left: (stageSize.w - w) / 2,
      top: (stageSize.h - h) / 2,
      width: w,
      height: h,
    };
  }, [stageSize, displayedAspect]);

  const drawStateRef = useRef({
    activeTool,
    brushColor,
    brushRatio: BRUSH_WIDTHS[brushWidthIdx].ratio,
    imgW: imgBox.width,
    imgH: imgBox.height,
    livePts: [] as [number, number][],
  });

  useEffect(() => {
    drawStateRef.current.activeTool = activeTool;
    drawStateRef.current.brushColor = brushColor;
    drawStateRef.current.brushRatio = BRUSH_WIDTHS[brushWidthIdx].ratio;
    drawStateRef.current.imgW = imgBox.width;
    drawStateRef.current.imgH = imgBox.height;
  }, [activeTool, brushColor, brushWidthIdx, imgBox.width, imgBox.height]);

  const handleDrawGrant = (evt: GestureResponderEvent) => {
    const { imgW, imgH, brushColor: col, brushRatio } = drawStateRef.current;
    if (!imgW || !imgH) return;
    const nx = Math.max(0, Math.min(1, evt.nativeEvent.locationX / imgW));
    const ny = Math.max(0, Math.min(1, evt.nativeEvent.locationY / imgH));
    drawStateRef.current.livePts = [[nx, ny]];
    setLiveStroke({ color: col, widthRatio: brushRatio, points: [[nx, ny]] });
  };

  const handleDrawMove = (evt: GestureResponderEvent) => {
    const { imgW, imgH, brushColor: col, brushRatio } = drawStateRef.current;
    if (!imgW || !imgH) return;
    const nx = Math.max(0, Math.min(1, evt.nativeEvent.locationX / imgW));
    const ny = Math.max(0, Math.min(1, evt.nativeEvent.locationY / imgH));
    const pts = drawStateRef.current.livePts;
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(nx - last[0], ny - last[1]) > 0.004) {
      pts.push([nx, ny]);
      setLiveStroke({ color: col, widthRatio: brushRatio, points: pts.slice() });
    }
  };

  const handleDrawRelease = () => {
    const pts = drawStateRef.current.livePts;
    const { brushColor: col, brushRatio } = drawStateRef.current;
    if (pts.length > 0) {
      setStrokes((prev) => [
        ...prev,
        { color: col, widthRatio: brushRatio, points: pts.slice() },
      ]);
    }
    drawStateRef.current.livePts = [];
    setLiveStroke(null);
  };

  const openNewTextEditor = () => {
    setEditingTextId(null);
    setDraftText('');
    setDraftTextColor('#FFFFFF');
    setDraftTextBg('dark');
    setDraftTextSize(0.055);
    setActiveTool('text');
  };

  const openExistingTextEditor = (item: TextOverlayItem) => {
    setEditingTextId(item.id);
    setDraftText(item.text);
    setDraftTextColor(item.color);
    setDraftTextBg(item.bgStyle);
    setDraftTextSize(item.fontSizeRatio);
    setActiveTool('text');
  };

  const confirmTextModal = () => {
    const trimmed = draftText.trim();
    if (!trimmed) {
      if (editingTextId) {
        setTexts((prev) => prev.filter((t) => t.id !== editingTextId));
      }
      setEditingTextId(null);
      setActiveTool('none');
      return;
    }

    if (editingTextId) {
      setTexts((prev) =>
        prev.map((t) =>
          t.id === editingTextId
            ? {
                ...t,
                text: trimmed,
                color: draftTextColor,
                bgStyle: draftTextBg,
                fontSizeRatio: draftTextSize,
              }
            : t
        )
      );
    } else {
      setTexts((prev) => [
        ...prev,
        {
          id: `txt_${Date.now()}_${prev.length}`,
          text: trimmed,
          x: 0.5,
          y: 0.5,
          color: draftTextColor,
          bgStyle: draftTextBg,
          fontSizeRatio: draftTextSize,
        },
      ]);
    }
    setEditingTextId(null);
    setDraftText('');
    setActiveTool('none');
  };

  const handleRotate90 = () => {
    setRotation((r) => (r + 90) % 360);
    setAppliedCrop(DEFAULT_CROP);
    setDraftCrop(DEFAULT_CROP);
  };

  const applyAspectPreset = (ratio: number | null) => {
    if (!ratio) {
      setDraftCrop(DEFAULT_CROP);
      return;
    }
    const fullRatio = rotatedFullDims.w / Math.max(1, rotatedFullDims.h);
    let w = 0.88;
    let h = (w * fullRatio) / ratio;
    if (h > 0.88) {
      h = 0.88;
      w = (h * ratio) / fullRatio;
    }
    setDraftCrop({
      x: (1 - w) / 2,
      y: (1 - h) / 2,
      w,
      h,
    });
  };

  const buildEditSpec = (): MediaEditSpec | null => {
    if (media.type === 'image') {
      const hasCrop =
        appliedCrop.x > 0.005 ||
        appliedCrop.y > 0.005 ||
        appliedCrop.w < 0.995 ||
        appliedCrop.h < 0.995;
      if (rotation === 0 && !hasCrop && strokes.length === 0 && texts.length === 0) {
        return null;
      }
      return {
        rotation,
        crop: appliedCrop,
        strokes,
        texts,
      };
    }
    if (media.type === 'video') {
      const hasTrim =
        trimStart > 0.15 ||
        (videoDuration > 0 && trimEnd > 0 && videoDuration - trimEnd > 0.25);
      if (!hasTrim && !muteVideoAudio) return null;
      return {
        trimStart: Number(trimStart.toFixed(2)),
        trimEnd: Number((trimEnd || videoDuration).toFixed(2)),
        duration: Number(videoDuration.toFixed(2)),
        muteAudio: muteVideoAudio,
      };
    }
    return null;
  };

  const handleSend = () => {
    const spec = buildEditSpec();
    const cleanCaption = caption.trim();
    onSend(cleanCaption, spec);
  };

  const allStrokes = liveStroke ? [...strokes, liveStroke] : strokes;
  const minDim = Math.min(imgBox.width, imgBox.height);

  return (
    <KeyboardSafeView style={styles.root}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top + 6, 18) }]}>
        <TouchableOpacity onPress={onClose} style={styles.topCircleBtn} hitSlop={8}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>

        {queueLength > 1 && (
          <View style={styles.queueBadge}>
            <Text style={styles.queueBadgeText}>
              {queueIndex + 1} من {queueLength}
            </Text>
          </View>
        )}

        {media.type === 'image' && activeTool !== 'text' && (
          <View style={styles.toolsRow}>
            {activeTool === 'crop' ? (
              <>
                <TouchableOpacity
                  style={[styles.toolPill, styles.toolPillConfirm]}
                  onPress={() => {
                    setAppliedCrop(draftCrop);
                    setStrokes([]);
                    setTexts([]);
                    setActiveTool('none');
                  }}
                >
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text style={styles.toolPillText}>تطبيق القص</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.topCircleBtn} onPress={handleRotate90}>
                  <MaterialCommunityIcons name="rotate-right" size={21} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.topCircleBtn}
                  onPress={() => {
                    setDraftCrop(appliedCrop);
                    setActiveTool('none');
                  }}
                >
                  <Ionicons name="arrow-undo" size={19} color="#FFFFFF" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.topCircleBtn}
                  onPress={() => {
                    setDraftCrop(appliedCrop);
                    setActiveTool('crop');
                  }}
                >
                  <MaterialCommunityIcons name="crop-rotate" size={21} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.topCircleBtn,
                    activeTool === 'draw' && styles.topCircleBtnActive,
                  ]}
                  onPress={() => setActiveTool(activeTool === 'draw' ? 'none' : 'draw')}
                >
                  <MaterialCommunityIcons name="pencil" size={21} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.topCircleBtn} onPress={openNewTextEditor}>
                  <MaterialCommunityIcons name="format-text" size={22} color="#FFFFFF" />
                </TouchableOpacity>

                {(strokes.length > 0 ||
                  texts.length > 0 ||
                  rotation !== 0 ||
                  appliedCrop.w < 0.999) && (
                  <TouchableOpacity
                    style={styles.topCircleBtn}
                    onPress={() => {
                      if (strokes.length > 0) {
                        setStrokes((prev) => prev.slice(0, -1));
                      } else if (texts.length > 0) {
                        setTexts((prev) => prev.slice(0, -1));
                      } else {
                        setAppliedCrop(DEFAULT_CROP);
                        setRotation(0);
                      }
                    }}
                  >
                    <Ionicons name="arrow-undo" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        )}

        {media.type === 'video' && (
          <View style={styles.toolsRow}>
            <TouchableOpacity
              style={[styles.toolPill, muteVideoAudio && styles.toolPillMuted]}
              onPress={() => setMuteVideoAudio((m) => !m)}
            >
              <Ionicons
                name={muteVideoAudio ? 'volume-mute' : 'volume-high'}
                size={17}
                color="#FFFFFF"
              />
              <Text style={styles.toolPillText}>
                {muteVideoAudio ? 'الصوت مكتوم' : 'صوت الفيديو مفعل'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {media.type === 'image' && activeTool === 'crop' && (
        <View style={styles.subToolbar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.subToolbarScroll}
          >
            {[
              { label: 'حر', ratio: null },
              { label: '1:1 مربع', ratio: 1 },
              { label: '4:3', ratio: 4 / 3 },
              { label: '16:9', ratio: 16 / 9 },
              { label: '9:16', ratio: 9 / 16 },
            ].map((preset) => (
              <TouchableOpacity
                key={preset.label}
                style={styles.aspectChip}
                onPress={() => applyAspectPreset(preset.ratio)}
              >
                <Text style={styles.aspectChipText}>{preset.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {media.type === 'image' && activeTool === 'draw' && (
        <View style={styles.drawToolbar}>
          <View style={styles.brushSizeRow}>
            {BRUSH_WIDTHS.map((bw, idx) => (
              <TouchableOpacity
                key={bw.label}
                style={[
                  styles.brushSizeBtn,
                  brushWidthIdx === idx && styles.brushSizeBtnActive,
                ]}
                onPress={() => setBrushWidthIdx(idx)}
              >
                <View
                  style={{
                    width: bw.dot,
                    height: bw.dot,
                    borderRadius: bw.dot / 2,
                    backgroundColor: brushColor,
                  }}
                />
              </TouchableOpacity>
            ))}
            {strokes.length > 0 && (
              <TouchableOpacity
                style={styles.clearStrokesBtn}
                onPress={() => setStrokes([])}
              >
                <Text style={styles.clearStrokesText}>مسح الكل</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.paletteRow}
          >
            {PALETTE.map((col) => (
              <TouchableOpacity
                key={col}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: col },
                  brushColor === col && styles.colorSwatchActive,
                ]}
                onPress={() => setBrushColor(col)}
              />
            ))}
          </ScrollView>
        </View>
      )}

      <View
        style={styles.stage}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) {
            setStageSize({ w: width, h: height });
          }
        }}
      >
        {media.type === 'image' && (
          <View
            style={[
              styles.imageViewport,
              {
                width: imgBox.width,
                height: imgBox.height,
              },
            ]}
          >
            <CroppedRotatedImage
              uri={media.uri}
              rotation={rotation}
              crop={activeCropForView}
              viewportWidth={imgBox.width}
              viewportHeight={imgBox.height}
            />

            {activeTool !== 'crop' && (
              <View
                style={StyleSheet.absoluteFill}
                pointerEvents={activeTool === 'draw' ? 'auto' : 'box-none'}
                onStartShouldSetResponder={() => activeTool === 'draw'}
                onMoveShouldSetResponder={() => activeTool === 'draw'}
                onResponderGrant={handleDrawGrant}
                onResponderMove={handleDrawMove}
                onResponderRelease={handleDrawRelease}
              >
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {allStrokes.map((st, sIdx) => (
                    <StrokeRenderer
                      key={`st-${sIdx}`}
                      stroke={st}
                      width={imgBox.width}
                      height={imgBox.height}
                      minDim={minDim}
                    />
                  ))}
                </View>

                {texts.map((item) => (
                  <DraggableTextSticker
                    key={item.id}
                    item={item}
                    boxWidth={imgBox.width}
                    boxHeight={imgBox.height}
                    minDim={minDim}
                    disabled={activeTool === 'draw'}
                    onMove={(nx, ny) => {
                      setTexts((prev) =>
                        prev.map((t) => (t.id === item.id ? { ...t, x: nx, y: ny } : t))
                      );
                    }}
                    onTap={() => openExistingTextEditor(item)}
                  />
                ))}
              </View>
            )}

            {activeTool === 'crop' && (
              <InteractiveCropOverlay
                crop={draftCrop}
                boxWidth={imgBox.width}
                boxHeight={imgBox.height}
                onChange={setDraftCrop}
              />
            )}
          </View>
        )}

        {media.type === 'video' && (
          <VideoTrimPreview
            uri={media.uri}
            fileSize={media.fileSize}
            muted={muteVideoAudio}
            duration={videoDuration}
            trimStart={trimStart}
            trimEnd={trimEnd}
            onDurationLoaded={(dur) => {
              if (dur > 0) {
                setVideoDuration(dur);
                setTrimEnd((prev) => (prev > 0 && prev <= dur ? prev : dur));
              }
            }}
            onChangeTrim={(s, e) => {
              setTrimStart(s);
              setTrimEnd(e);
            }}
          />
        )}

        {media.type !== 'image' && media.type !== 'video' && (
          <DocumentPreviewCard media={media} />
        )}
      </View>

      {activeTool === 'text' && (
        <View style={styles.textEditorOverlay}>
          <View style={[styles.textEditorHeader, { paddingTop: Math.max(insets.top + 8, 20) }]}>
            <TouchableOpacity style={styles.textDoneBtn} onPress={confirmTextModal}>
              <Text style={styles.textDoneLabel}>تم</Text>
            </TouchableOpacity>

            <View style={styles.textStyleControls}>
              <TouchableOpacity
                style={styles.bgStyleToggle}
                onPress={() =>
                  setDraftTextBg((prev) =>
                    prev === 'dark' ? 'solid' : prev === 'solid' ? 'none' : 'dark'
                  )
                }
              >
                <MaterialCommunityIcons name="format-color-highlight" size={20} color="#FFFFFF" />
                <Text style={styles.bgStyleToggleText}>
                  {draftTextBg === 'dark'
                    ? 'خلفية داكنة'
                    : draftTextBg === 'solid'
                      ? 'خلفية ملونة'
                      : 'بدون خلفية'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bgStyleToggle}
                onPress={() =>
                  setDraftTextSize((prev) =>
                    prev < 0.05 ? 0.06 : prev < 0.07 ? 0.085 : 0.042
                  )
                }
              >
                <MaterialCommunityIcons name="format-size" size={19} color="#FFFFFF" />
              </TouchableOpacity>

              {editingTextId && (
                <TouchableOpacity
                  style={[styles.bgStyleToggle, { backgroundColor: 'rgba(239,68,68,0.85)' }]}
                  onPress={() => {
                    setTexts((prev) => prev.filter((t) => t.id !== editingTextId));
                    setEditingTextId(null);
                    setDraftText('');
                    setActiveTool('none');
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <View style={styles.textEditorCenter}>
            <View
              style={[
                styles.textDraftPreviewBox,
                draftTextBg === 'dark' && { backgroundColor: 'rgba(17,27,33,0.78)' },
                draftTextBg === 'solid' && {
                  backgroundColor:
                    draftTextColor === '#FFFFFF' ? Colors.primary : draftTextColor,
                },
              ]}
            >
              <TextInput
                style={[
                  styles.textDraftInput,
                  {
                    color:
                      draftTextBg === 'solid' && draftTextColor !== '#FFFFFF'
                        ? '#FFFFFF'
                        : draftTextColor,
                    fontSize: Math.round(draftTextSize * 460),
                  },
                ]}
                placeholder="اكتب نصاً على الصورة..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={draftText}
                onChangeText={setDraftText}
                multiline
                autoFocus
                textAlign="center"
              />
            </View>
          </View>

          <View style={styles.textPaletteWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.paletteRow}
            >
              {PALETTE.map((col) => (
                <TouchableOpacity
                  key={col}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: col },
                    draftTextColor === col && styles.colorSwatchActive,
                  ]}
                  onPress={() => setDraftTextColor(col)}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {activeTool !== 'text' && (
        <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {recipientName ? (
            <View style={styles.recipientRow}>
              <View style={styles.recipientChip}>
                <Ionicons name="person" size={11} color="#00A884" />
                <Text style={styles.recipientText} numberOfLines={1}>
                  {recipientName}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={styles.captionBar}>
            <TextInput
              style={styles.captionInput}
              placeholder="أضف تعليقاً..."
              placeholderTextColor="#94A3B8"
              value={caption}
              onChangeText={setCaption}
              multiline
              textAlign="right"
            />
            <TouchableOpacity style={styles.sendFab} onPress={handleSend} activeOpacity={0.85}>
              <Ionicons
                name="send"
                size={19}
                color="#FFFFFF"
                style={{ transform: [{ scaleX: -1 }] }}
              />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardSafeView>
  );
};

const CroppedRotatedImage: React.FC<{
  uri: string;
  rotation: number;
  crop: CropRect;
  viewportWidth: number;
  viewportHeight: number;
}> = ({ uri, rotation, crop, viewportWidth, viewportHeight }) => {
  const fullRotW = viewportWidth / Math.max(0.05, crop.w);
  const fullRotH = viewportHeight / Math.max(0.05, crop.h);
  const swapped = rotation % 180 !== 0;
  const rawImgW = swapped ? fullRotH : fullRotW;
  const rawImgH = swapped ? fullRotW : fullRotH;

  return (
    <View style={{ width: viewportWidth, height: viewportHeight, overflow: 'hidden' }}>
      <View
        style={{
          position: 'absolute',
          left: -crop.x * fullRotW,
          top: -crop.y * fullRotH,
          width: fullRotW,
          height: fullRotH,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={{ uri }}
          style={{
            width: rawImgW,
            height: rawImgH,
            transform: [{ rotate: `${rotation}deg` }],
          }}
          resizeMode="stretch"
        />
      </View>
    </View>
  );
};

const StrokeRenderer: React.FC<{
  stroke: DrawStroke;
  width: number;
  height: number;
  minDim: number;
}> = React.memo(function StrokeRenderer({ stroke, width, height, minDim }) {
  const thickness = Math.max(2.5, stroke.widthRatio * minDim);
  const pts = stroke.points;
  if (pts.length === 0) return null;

  if (pts.length === 1) {
    const x = pts[0][0] * width;
    const y = pts[0][1] * height;
    return (
      <View
        style={{
          position: 'absolute',
          left: x - thickness / 2,
          top: y - thickness / 2,
          width: thickness,
          height: thickness,
          borderRadius: thickness / 2,
          backgroundColor: stroke.color,
        }}
      />
    );
  }

  return (
    <>
      {pts.slice(1).map((pt, idx) => {
        const prev = pts[idx];
        const x1 = prev[0] * width;
        const y1 = prev[1] * height;
        const x2 = pt[0] * width;
        const y2 = pt[1] * height;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;

        return (
          <View
            key={idx}
            style={{
              position: 'absolute',
              left: cx - (len + thickness) / 2,
              top: cy - thickness / 2,
              width: len + thickness,
              height: thickness,
              borderRadius: thickness / 2,
              backgroundColor: stroke.color,
              transform: [{ rotate: `${angle}rad` }],
            }}
          />
        );
      })}
    </>
  );
});

const DraggableTextSticker: React.FC<{
  item: TextOverlayItem;
  boxWidth: number;
  boxHeight: number;
  minDim: number;
  disabled: boolean;
  onMove: (nx: number, ny: number) => void;
  onTap: () => void;
}> = ({ item, boxWidth, boxHeight, minDim, disabled, onMove, onTap }) => {
  const ctxRef = useRef({
    item,
    boxWidth,
    boxHeight,
    onMove,
    onTap,
    disabled,
    startX: 0.5,
    startY: 0.5,
    grantX: 0,
    grantY: 0,
    moved: false,
  });

  useEffect(() => {
    ctxRef.current.item = item;
    ctxRef.current.boxWidth = boxWidth;
    ctxRef.current.boxHeight = boxHeight;
    ctxRef.current.onMove = onMove;
    ctxRef.current.onTap = onTap;
    ctxRef.current.disabled = disabled;
  }, [item, boxWidth, boxHeight, onMove, onTap, disabled]);

  const fontSize = Math.max(14, item.fontSizeRatio * minDim);
  const bgStyle =
    item.bgStyle === 'dark'
      ? { backgroundColor: 'rgba(17, 27, 33, 0.75)' }
      : item.bgStyle === 'solid'
        ? { backgroundColor: item.color === '#FFFFFF' ? Colors.primary : item.color }
        : { backgroundColor: 'transparent' };
  const txtColor =
    item.bgStyle === 'solid' && item.color !== '#FFFFFF' ? '#FFFFFF' : item.color;

  return (
    <View
      style={{
        position: 'absolute',
        left: item.x * boxWidth,
        top: item.y * boxHeight,
        transform: [{ translateX: -90 }, { translateY: -22 }],
        width: 180,
        alignItems: 'center',
      }}
      onStartShouldSetResponder={() => !ctxRef.current.disabled}
      onMoveShouldSetResponder={() => !ctxRef.current.disabled}
      onResponderGrant={(e) => {
        ctxRef.current.startX = ctxRef.current.item.x;
        ctxRef.current.startY = ctxRef.current.item.y;
        ctxRef.current.grantX = e.nativeEvent.pageX;
        ctxRef.current.grantY = e.nativeEvent.pageY;
        ctxRef.current.moved = false;
      }}
      onResponderMove={(e) => {
        const dx = e.nativeEvent.pageX - ctxRef.current.grantX;
        const dy = e.nativeEvent.pageY - ctxRef.current.grantY;
        if (Math.hypot(dx, dy) > 4) {
          ctxRef.current.moved = true;
        }
        const { boxWidth: bw, boxHeight: bh, onMove: moveCb } = ctxRef.current;
        if (!bw || !bh) return;
        const nx = Math.max(0.08, Math.min(0.92, ctxRef.current.startX + dx / bw));
        const ny = Math.max(0.08, Math.min(0.92, ctxRef.current.startY + dy / bh));
        moveCb(nx, ny);
      }}
      onResponderRelease={() => {
        if (!ctxRef.current.moved) {
          ctxRef.current.onTap();
        }
      }}
    >
      <View style={[styles.stickerPill, bgStyle]}>
        <Text
          style={[
            styles.stickerText,
            {
              fontSize,
              color: txtColor,
              textShadowColor: item.bgStyle === 'none' ? 'rgba(0,0,0,0.75)' : 'transparent',
              textShadowRadius: item.bgStyle === 'none' ? 4 : 0,
            },
          ]}
        >
          {item.text}
        </Text>
      </View>
    </View>
  );
};

const InteractiveCropOverlay: React.FC<{
  crop: CropRect;
  boxWidth: number;
  boxHeight: number;
  onChange: (next: CropRect) => void;
}> = ({ crop, boxWidth, boxHeight, onChange }) => {
  const cropCtxRef = useRef({
    crop,
    boxWidth,
    boxHeight,
    onChange,
    startCrop: crop,
    grantX: 0,
    grantY: 0,
  });

  useEffect(() => {
    cropCtxRef.current.crop = crop;
    cropCtxRef.current.boxWidth = boxWidth;
    cropCtxRef.current.boxHeight = boxHeight;
    cropCtxRef.current.onChange = onChange;
  }, [crop, boxWidth, boxHeight, onChange]);

  const grantCorner = (e: GestureResponderEvent) => {
    cropCtxRef.current.startCrop = { ...cropCtxRef.current.crop };
    cropCtxRef.current.grantX = e.nativeEvent.pageX;
    cropCtxRef.current.grantY = e.nativeEvent.pageY;
  };

  const moveCorner = (corner: 'tl' | 'tr' | 'bl' | 'br' | 'move', e: GestureResponderEvent) => {
    const { boxWidth: bw, boxHeight: bh, onChange: cb, startCrop: s, grantX, grantY } = cropCtxRef.current;
    if (!bw || !bh) return;
    const dx = (e.nativeEvent.pageX - grantX) / bw;
    const dy = (e.nativeEvent.pageY - grantY) / bh;
    const minS = 0.14;

    if (corner === 'move') {
      const nx = Math.max(0, Math.min(1 - s.w, s.x + dx));
      const ny = Math.max(0, Math.min(1 - s.h, s.y + dy));
      cb({ x: nx, y: ny, w: s.w, h: s.h });
      return;
    }

    let left = s.x;
    let top = s.y;
    let right = s.x + s.w;
    let bottom = s.y + s.h;

    if (corner === 'tl' || corner === 'bl') {
      left = Math.max(0, Math.min(right - minS, s.x + dx));
    }
    if (corner === 'tr' || corner === 'br') {
      right = Math.min(1, Math.max(left + minS, s.x + s.w + dx));
    }
    if (corner === 'tl' || corner === 'tr') {
      top = Math.max(0, Math.min(bottom - minS, s.y + dy));
    }
    if (corner === 'bl' || corner === 'br') {
      bottom = Math.min(1, Math.max(top + minS, s.y + s.h + dy));
    }
    cb({ x: left, y: top, w: right - left, h: bottom - top });
  };

  const cx = crop.x * boxWidth;
  const cy = crop.y * boxHeight;
  const cw = crop.w * boxWidth;
  const ch = crop.h * boxHeight;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        style={[styles.cropShade, { left: 0, top: 0, right: 0, height: cy }]}
        pointerEvents="none"
      />
      <View
        style={[styles.cropShade, { left: 0, top: cy + ch, right: 0, bottom: 0 }]}
        pointerEvents="none"
      />
      <View
        style={[styles.cropShade, { left: 0, top: cy, width: cx, height: ch }]}
        pointerEvents="none"
      />
      <View
        style={[styles.cropShade, { left: cx + cw, top: cy, right: 0, height: ch }]}
        pointerEvents="none"
      />

      <View
        style={[styles.cropBox, { left: cx, top: cy, width: cw, height: ch }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={grantCorner}
        onResponderMove={(e) => moveCorner('move', e)}
      >
        <View style={[styles.gridLineV, { left: '33.33%' }]} pointerEvents="none" />
        <View style={[styles.gridLineV, { left: '66.66%' }]} pointerEvents="none" />
        <View style={[styles.gridLineH, { top: '33.33%' }]} pointerEvents="none" />
        <View style={[styles.gridLineH, { top: '66.66%' }]} pointerEvents="none" />
      </View>

      <View
        style={[styles.cornerHandle, { left: cx - 14, top: cy - 14 }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={grantCorner}
        onResponderMove={(e) => moveCorner('tl', e)}
      >
        <View style={[styles.cornerVisual, styles.cornerTL]} />
      </View>
      <View
        style={[styles.cornerHandle, { left: cx + cw - 14, top: cy - 14 }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={grantCorner}
        onResponderMove={(e) => moveCorner('tr', e)}
      >
        <View style={[styles.cornerVisual, styles.cornerTR]} />
      </View>
      <View
        style={[styles.cornerHandle, { left: cx - 14, top: cy + ch - 14 }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={grantCorner}
        onResponderMove={(e) => moveCorner('bl', e)}
      >
        <View style={[styles.cornerVisual, styles.cornerBL]} />
      </View>
      <View
        style={[styles.cornerHandle, { left: cx + cw - 14, top: cy + ch - 14 }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={grantCorner}
        onResponderMove={(e) => moveCorner('br', e)}
      >
        <View style={[styles.cornerVisual, styles.cornerBR]} />
      </View>
    </View>
  );
};

const seekVideoPlayer = (player: any, timeSec: number) => {
  try {
    player.currentTime = timeSec;
  } catch {}
};

const setVideoPlayerMuted = (player: any, isMuted: boolean) => {
  try {
    player.muted = isMuted;
  } catch {}
};

const VideoTrimPreview: React.FC<{
  uri: string;
  fileSize?: number;
  muted: boolean;
  duration: number;
  trimStart: number;
  trimEnd: number;
  onDurationLoaded: (dur: number) => void;
  onChangeTrim: (start: number, end: number) => void;
}> = ({
  uri,
  fileSize,
  muted,
  duration,
  trimStart,
  trimEnd,
  onDurationLoaded,
  onChangeTrim,
}) => {
  const [playing, setPlaying] = useState(true);
  const [currentSec, setCurrentSec] = useState(0);
  const [barWidth, setBarWidth] = useState(280);

  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
    p.play();
  });

  useEffect(() => {
    setVideoPlayerMuted(player, muted);
  }, [muted, player]);

  const boundsRef = useRef({
    duration,
    trimStart,
    trimEnd,
    barWidth,
    onChangeTrim,
    player,
    dragStart: 0,
    dragEnd: 0,
    grantX: 0,
  });

  useEffect(() => {
    boundsRef.current.duration = duration;
    boundsRef.current.trimStart = trimStart;
    boundsRef.current.trimEnd = trimEnd;
    boundsRef.current.barWidth = barWidth;
    boundsRef.current.onChangeTrim = onChangeTrim;
    boundsRef.current.player = player;
  }, [duration, trimStart, trimEnd, barWidth, onChangeTrim, player]);

  useEffect(() => {
    const timer = setInterval(() => {
      try {
        const p = boundsRef.current.player;
        const d = p.duration;
        if (d && d > 0 && Math.abs(d - boundsRef.current.duration) > 0.25) {
          onDurationLoaded(d);
        }
        const cur = p.currentTime || 0;
        setCurrentSec(cur);
        setPlaying(Boolean(p.playing));
        const { trimStart: ts, trimEnd: te } = boundsRef.current;
        if (te > ts + 0.3 && cur >= te) {
          seekVideoPlayer(p, ts);
        }
      } catch {}
    }, 180);
    return () => clearInterval(timer);
  }, [onDurationLoaded]);

  const grantTrim = (e: GestureResponderEvent) => {
    boundsRef.current.dragStart = boundsRef.current.trimStart;
    boundsRef.current.dragEnd = boundsRef.current.trimEnd || boundsRef.current.duration;
    boundsRef.current.grantX = e.nativeEvent.pageX;
  };

  const moveStartHandle = (e: GestureResponderEvent) => {
    const { duration: dur, barWidth: bw, onChangeTrim: cb, player: p, dragStart, dragEnd, grantX } =
      boundsRef.current;
    if (!dur || !bw) return;
    const delta = ((e.nativeEvent.pageX - grantX) / bw) * dur;
    const maxStart = Math.max(0, dragEnd - 1);
    const nextStart = Math.max(0, Math.min(maxStart, dragStart + delta));
    cb(nextStart, dragEnd);
    seekVideoPlayer(p, nextStart);
  };

  const moveEndHandle = (e: GestureResponderEvent) => {
    const { duration: dur, barWidth: bw, onChangeTrim: cb, player: p, dragStart, dragEnd, grantX } =
      boundsRef.current;
    if (!dur || !bw) return;
    const delta = ((e.nativeEvent.pageX - grantX) / bw) * dur;
    const minEnd = Math.min(dur, dragStart + 1);
    const nextEnd = Math.min(dur, Math.max(minEnd, dragEnd + delta));
    cb(dragStart, nextEnd);
    seekVideoPlayer(p, Math.max(dragStart, nextEnd - 0.3));
  };

  const effectiveEnd = trimEnd > 0 ? trimEnd : duration;
  const clipLen = Math.max(0, effectiveEnd - trimStart);
  const leftRatio = duration > 0 ? trimStart / duration : 0;
  const rightRatio = duration > 0 ? effectiveEnd / duration : 1;
  const playheadRatio = duration > 0 ? Math.min(1, Math.max(0, currentSec / duration)) : 0;

  const estimatedBytes =
    fileSize && duration > 0 ? Math.round(fileSize * (clipLen / duration)) : fileSize;

  return (
    <View style={styles.videoStageWrap}>
      {duration > 0 && (
        <View style={styles.trimContainer}>
          <View
            style={styles.trimTrack}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 40) setBarWidth(w);
            }}
          >
            <View style={styles.trimFrameTicks}>
              {Array.from({ length: 16 }).map((_, i) => (
                <View key={i} style={styles.trimTickBar} />
              ))}
            </View>

            <View
              style={[
                styles.trimShadeOutside,
                { left: 0, width: leftRatio * barWidth },
              ]}
            />
            <View
              style={[
                styles.trimShadeOutside,
                { left: rightRatio * barWidth, right: 0 },
              ]}
            />

            <View
              style={[
                styles.trimActiveWindow,
                {
                  left: leftRatio * barWidth,
                  width: Math.max(18, (rightRatio - leftRatio) * barWidth),
                },
              ]}
              pointerEvents="none"
            />

            <View
              style={[styles.playheadLine, { left: playheadRatio * barWidth }]}
              pointerEvents="none"
            />

            <View
              style={[styles.trimHandle, { left: Math.max(0, leftRatio * barWidth - 10) }]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={grantTrim}
              onResponderMove={moveStartHandle}
            >
              <View style={styles.trimHandleGrip} />
            </View>

            <View
              style={[
                styles.trimHandle,
                { left: Math.min(barWidth - 18, Math.max(14, rightRatio * barWidth - 8)) },
              ]}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={grantTrim}
              onResponderMove={moveEndHandle}
            >
              <View style={styles.trimHandleGrip} />
            </View>
          </View>

          <View style={styles.trimMetaRow}>
            <Text style={styles.trimMetaText}>
              {formatAudioSeconds(trimStart)} - {formatAudioSeconds(effectiveEnd)}
            </Text>
            <Text style={styles.trimMetaHighlight}>
              المدة المحددة: {formatAudioSeconds(clipLen)}
              {estimatedBytes ? ` • ${formatBytes(estimatedBytes)}` : ''}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.videoPlayerArea}>
        <VideoView
          player={player}
          style={styles.videoElement}
          contentFit="contain"
          nativeControls={false}
        />

        <TouchableOpacity
          style={styles.videoPlayToggle}
          activeOpacity={0.85}
          onPress={() => {
            try {
              if (player.playing) {
                player.pause();
                setPlaying(false);
              } else {
                if (player.currentTime >= effectiveEnd || player.currentTime < trimStart) {
                  seekVideoPlayer(player, trimStart);
                }
                player.play();
                setPlaying(true);
              }
            } catch {}
          }}
        >
          {!playing && (
            <View style={styles.bigPlayCircle}>
              <Ionicons name="play" size={30} color="#FFFFFF" style={{ marginLeft: 3 }} />
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const DocumentPreviewCard: React.FC<{ media: PendingMedia }> = ({ media }) => {
  const info = docInfo({
    media_meta: { fileName: media.name },
    media_mime_type: media.mimeType,
    media_url: null,
    media_size: media.fileSize ?? null,
    message: null,
  });

  return (
    <View style={styles.docStageCard}>
      <View style={[styles.docHeroBadge, { backgroundColor: info.color }]}>
        <MaterialCommunityIcons name="file-document-outline" size={44} color="#FFFFFF" />
        <Text style={styles.docHeroExt}>{info.ext}</Text>
      </View>
      <Text style={styles.docHeroName} numberOfLines={2}>
        {media.name || 'مستند'}
      </Text>
      <Text style={styles.docHeroSub}>
        {info.ext}
        {media.fileSize ? ` • ${formatBytes(media.fileSize)}` : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  queueBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center',
    paddingTop: 14,
  },
  queueBadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  topBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 10,
    zIndex: 20,
  },
  topCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCircleBtnActive: {
    backgroundColor: Colors.primary,
  },
  toolsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  toolPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
  },
  toolPillConfirm: {
    backgroundColor: Colors.primary,
  },
  toolPillMuted: {
    backgroundColor: 'rgba(239, 68, 68, 0.78)',
  },
  toolPillText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  subToolbar: {
    paddingBottom: 8,
    zIndex: 18,
  },
  subToolbarScroll: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 14,
    gap: 8,
  },
  aspectChip: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  aspectChipText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  drawToolbar: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
    zIndex: 18,
  },
  brushSizeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  brushSizeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brushSizeBtnActive: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  clearStrokesBtn: {
    backgroundColor: 'rgba(239,68,68,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  clearStrokesText: {
    color: '#FCA5A5',
    fontSize: 11.5,
    fontWeight: '700',
  },
  paletteRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  colorSwatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  colorSwatchActive: {
    transform: [{ scale: 1.2 }],
    borderColor: '#FFFFFF',
    borderWidth: 2.5,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  imageViewport: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 4,
  },
  stickerPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  stickerText: {
    fontWeight: '800',
    textAlign: 'center',
  },
  cropShade: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
  },
  cropBox: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  cornerHandle: {
    position: 'absolute',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerVisual: {
    width: 18,
    height: 18,
    borderColor: '#00A884',
  },
  cornerTL: {
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  videoStageWrap: {
    flex: 1,
    width: '100%',
  },
  trimContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  trimTrack: {
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1F2C34',
    position: 'relative',
    overflow: 'visible',
    justifyContent: 'center',
  },
  trimFrameTicks: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    borderRadius: 8,
    overflow: 'hidden',
  },
  trimTickBar: {
    width: 2,
    height: 22,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  trimShadeOutside: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  trimActiveWindow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderTopWidth: 2.5,
    borderBottomWidth: 2.5,
    borderColor: '#00A884',
  },
  playheadLine: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2.5,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  trimHandle: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 18,
    borderRadius: 6,
    backgroundColor: '#00A884',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  trimHandleGrip: {
    width: 3,
    height: 18,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  trimMetaRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  trimMetaText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '600',
  },
  trimMetaHighlight: {
    color: '#25D366',
    fontSize: 11.5,
    fontWeight: '700',
  },
  videoPlayerArea: {
    flex: 1,
    position: 'relative',
  },
  videoElement: {
    width: '100%',
    height: '100%',
  },
  videoPlayToggle: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigPlayCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  docStageCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18242B',
    borderRadius: 22,
    paddingVertical: 34,
    paddingHorizontal: 28,
    width: '84%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#263842',
  },
  docHeroBadge: {
    width: 84,
    height: 96,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  docHeroExt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  docHeroName: {
    color: '#F1F5F9',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  docHeroSub: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 6,
  },
  textEditorOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 20, 26, 0.86)',
    zIndex: 40,
    justifyContent: 'space-between',
  },
  textEditorHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  textDoneBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  textDoneLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  textStyleControls: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  bgStyleToggle: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
  },
  bgStyleToggleText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  textEditorCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  textDraftPreviewBox: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 160,
    maxWidth: '92%',
  },
  textDraftInput: {
    fontWeight: '800',
    minWidth: 140,
    padding: 0,
  },
  textPaletteWrap: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    alignItems: 'center',
  },
  bottomArea: {
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: 'rgba(11, 20, 26, 0.92)',
    gap: 6,
  },
  recipientRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 4,
  },
  recipientChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1F2C34',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: '75%',
  },
  recipientText: {
    color: '#CBD5E1',
    fontSize: 11.5,
    fontWeight: '600',
  },
  captionBar: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: 8,
  },
  captionInput: {
    flex: 1,
    backgroundColor: '#1F2C34',
    borderRadius: 22,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14.5,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: '#2A3942',
  },
  sendFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});
