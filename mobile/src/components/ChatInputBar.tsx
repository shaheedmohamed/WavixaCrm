import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  I18nManager,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Colors } from '../constants/theme';
import { drafts } from '../services/drafts';
import { chatService } from '../services/chatService';

export interface ChatInputBarHandle {
  focus: () => void;
  appendText: (snippet: string) => void;
  setText: (value: string) => void;
  getText: () => string;
}

interface ChatInputBarProps {
  bottomInset: number;
  isKeyboardVisible: boolean;
  onSendText: (text: string) => void;
  onSendVoice: (uri: string, durationSec: number) => void;
  onOpenAttach: () => void;
  onOpenCameraQuick: () => void;
  onOpenQuickReplies: () => void;
  /** Long-press the send button → scheduled-message picker. */
  onSchedule?: () => void;
  // Enables per-chat drafts + the outbound "typing…" chatstate relay.
  conversationId?: number;
}

type RecMode = 'off' | 'hold' | 'lock';

const LOCK_DIST = 64;
const CANCEL_DIST = 64;

const recVibrate = () => {
  try {
    Vibration.vibrate(10);
  } catch {}
};

export const ChatInputBar = forwardRef<ChatInputBarHandle, ChatInputBarProps>(
  function ChatInputBar(
    {
      bottomInset,
      isKeyboardVisible,
      onSendText,
      onSendVoice,
      onOpenAttach,
      onOpenCameraQuick,
      onOpenQuickReplies,
      onSchedule,
      conversationId,
    },
    ref
  ) {
    const [text, setText] = useState('');
    // 'off' = idle | 'hold' = finger still down, release sends | 'lock' =
    // hands-free (swipe-up or a plain tap) with trash + send buttons.
    const [recMode, setRecModeState] = useState<RecMode>('off');
    const [recordSecs, setRecordSecs] = useState(0);
    const [willCancel, setWillCancel] = useState(false);
    const [recPaused, setRecPaused] = useState(false);

    const recModeRef = useRef<RecMode>('off');
    const didStartRef = useRef(false);
    const lockedSV = useSharedValue(false);
    const willCancelSV = useSharedValue(false);

    const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);

    // ── Draft restore + outbound typing relay ────────────────────────
    // Draft text is hydrated once per conversation (the store warms from
    // AsyncStorage on the chat list, so by the time a room opens the map
    // is usually populated already).
    const draftLoadedForRef = useRef<number | null>(null);
    const lastTypingSentRef = useRef(0);
    const typingHadTextRef = useRef(false);

    useEffect(() => {
      if (conversationId == null || draftLoadedForRef.current === conversationId) return;
      draftLoadedForRef.current = conversationId;
      const saved = drafts.get(conversationId);
      if (saved && !text) setText(saved);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId]);

    useEffect(() => {
      if (conversationId != null) drafts.set(conversationId, text);
      // Customer should see composing while the agent types; 'paused'
      // clears their indicator when the box is emptied.
      if (conversationId != null) {
        const now = Date.now();
        if (text.length > 0) {
          typingHadTextRef.current = true;
          if (now - lastTypingSentRef.current > 3000) {
            lastTypingSentRef.current = now;
            chatService.sendTyping(conversationId, 'composing');
          }
        } else if (typingHadTextRef.current) {
          typingHadTextRef.current = false;
          chatService.sendTyping(conversationId, 'paused');
        }
      }
    }, [text, conversationId]);

    // Leaving the room mid-draft → stop the peer's typing indicator.
    useEffect(
      () => () => {
        if (conversationId != null && typingHadTextRef.current) {
          chatService.sendTyping(conversationId, 'paused');
        }
      },
      [conversationId],
    );
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recorderState = useAudioRecorderState(recorder, 250);

    const setRecMode = (m: RecMode) => {
      recModeRef.current = m;
      setRecModeState(m);
    };

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
        setTimeout(() => {
          inputRef.current?.focus();
        }, 45);
      },
      appendText: (snippet: string) => {
        setText((prev) => (prev ? `${prev} ${snippet}` : snippet));
        setTimeout(() => {
          inputRef.current?.focus();
        }, 40);
      },
      setText: (value: string) => {
        setText(value);
        setTimeout(() => {
          inputRef.current?.focus();
        }, 40);
      },
      getText: () => text,
    }));

    useEffect(() => {
      let t: ReturnType<typeof setInterval> | null = null;
      if (recMode !== 'off' && !recPaused) {
        t = setInterval(() => setRecordSecs((s) => s + 1), 1000);
      }
      return () => {
        if (t) clearInterval(t);
      };
    }, [recMode, recPaused]);

    const formatRecTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handlePressSend = () => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setText('');
      if (conversationId != null) {
        drafts.clear(conversationId);
        typingHadTextRef.current = false;
        chatService.sendTyping(conversationId, 'paused');
      }
      onSendText(trimmed);
    };

    const togglePauseRecording = () => {
      try {
        if (recPaused) {
          recorder.record();
        } else {
          recorder.pause();
        }
        recVibrate();
        setRecPaused(!recPaused);
      } catch {}
    };

    const startRecording = async (mode: RecMode) => {
      setRecMode(mode);
      setRecordSecs(0);
      setRecPaused(false);
      didStartRef.current = false;
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setRecMode('off');
          Alert.alert(
            'الصلاحية مطلوبة',
            'اسمح للتطبيق باستخدام الميكروفون لتسجيل الرسائل الصوتية'
          );
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        didStartRef.current = true;
      } catch (err: any) {
        setRecMode('off');
        Alert.alert('خطأ', err.message || 'تعذر بدء التسجيل');
      }
    };

    const cancelRecording = async () => {
      try {
        if (didStartRef.current) await recorder.stop();
      } catch {}
      didStartRef.current = false;
      setRecMode('off');
      setWillCancel(false);
      setRecPaused(false);
      setRecordSecs(0);
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };

    const finishAndSendRecording = async () => {
      const capturedSecs = recordSecs;
      const didStart = didStartRef.current;
      didStartRef.current = false;
      setRecMode('off');
      setWillCancel(false);
      setRecPaused(false);
      setRecordSecs(0);
      if (!didStart) return;
      try {
        await recorder.stop();
      } catch {}
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

      const uri = recorder.uri || recorderState.url;
      if (!uri) {
        Alert.alert('خطأ', 'لم يتم حفظ التسجيل الصوتي');
        return;
      }
      if (capturedSecs < 1) return;
      onSendVoice(uri, capturedSecs);
    };

    // Hold-to-record lifecycle, driven by the mic pan gesture below.
    const beginHoldRecord = () => {
      recVibrate();
      setWillCancel(false);
      startRecording('hold');
    };

    const lockHoldRecord = () => {
      if (recModeRef.current === 'hold') {
        recVibrate();
        setRecMode('lock');
      }
    };

    const setWillCancelJS = (v: boolean) => {
      if (v) recVibrate();
      setWillCancel(v);
    };

    const endHoldRecord = (locked: boolean, cancel: boolean) => {
      if (locked || recModeRef.current !== 'hold') return;
      if (cancel) cancelRecording();
      else finishAndSendRecording();
    };

    // The mic sits at the screen edge: sliding inward cancels. With an RTL
    // layout the fab lands on the right so inward is negative X; with LTR it
    // lands on the left so inward is positive X.
    const cancelSign = I18nManager.isRTL ? -1 : 1;
    const hasText = text.trim().length > 0;

    const micPan = Gesture.Pan()
      // Stays enabled while holding — disabling mid-gesture would kill the
      // drag and lose the release event. 'lock' only disables it once the
      // recording is already hands-free and no longer needs tracking.
      .enabled(recMode !== 'lock' && !hasText)
      .activateAfterLongPress(200)
      .onStart(() => {
        'worklet';
        // Flags may outlive a cancelled gesture — always start clean.
        lockedSV.value = false;
        willCancelSV.value = false;
        runOnJS(beginHoldRecord)();
      })
      .onUpdate((e) => {
        'worklet';
        if (lockedSV.value) return;
        if (e.translationY < -LOCK_DIST) {
          lockedSV.value = true;
          runOnJS(lockHoldRecord)();
          return;
        }
        const c = e.translationX * cancelSign > CANCEL_DIST;
        if (c !== willCancelSV.value) {
          willCancelSV.value = c;
          runOnJS(setWillCancelJS)(c);
        }
      })
      .onEnd(() => {
        'worklet';
        runOnJS(endHoldRecord)(lockedSV.value, willCancelSV.value);
      })
      .onFinalize(() => {
        'worklet';
        lockedSV.value = false;
        willCancelSV.value = false;
      });

    const padBottom = isKeyboardVisible ? 6 : Math.max(bottomInset, 8);

    // One render tree for every mode: the GestureDetector wrapper must stay
    // mounted while a hold-to-record drag is live — unmounting it mid-gesture
    // would destroy the handler and lose the release/lock/cancel events.
    return (
      <View style={[styles.barWrap, { paddingBottom: padBottom }]}>
        <GestureDetector gesture={micPan}>
          <View collapsable={false}>
            {recMode === 'lock' ? (
              <TouchableOpacity
                style={styles.sendFab}
                onPress={finishAndSendRecording}
                activeOpacity={0.82}
              >
                <Ionicons
                  name="send"
                  size={18}
                  color="#FFFFFF"
                  style={{ transform: [{ scaleX: -1 }] }}
                />
              </TouchableOpacity>
            ) : recMode === 'hold' ? (
              <View style={styles.sendFab}>
                <Ionicons name="mic" size={21} color="#FFFFFF" />
              </View>
            ) : (
              <TouchableOpacity
                style={styles.sendFab}
                onPress={hasText ? handlePressSend : () => startRecording('lock')}
                onLongPress={hasText ? onSchedule : undefined}
                delayLongPress={450}
                activeOpacity={0.82}
              >
                {hasText ? (
                  <Ionicons
                    name="send"
                    size={18}
                    color="#FFFFFF"
                    style={{ transform: [{ scaleX: -1 }] }}
                  />
                ) : (
                  <Ionicons name="mic" size={21} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
          </View>
        </GestureDetector>

        {recMode !== 'off' ? (
          <View style={styles.recordingPill}>
            {recMode === 'lock' ? (
              <>
                <TouchableOpacity onPress={cancelRecording} style={styles.trashRecBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color="#EF4444" />
                </TouchableOpacity>

                <TouchableOpacity onPress={togglePauseRecording} style={styles.pauseRecBtn} hitSlop={8}>
                  <Ionicons
                    name={recPaused ? 'play' : 'pause'}
                    size={19}
                    color={recPaused ? Colors.primary : '#54656F'}
                  />
                </TouchableOpacity>

                <View style={styles.recordingInfo}>
                  <Text style={[styles.recordingHint, recPaused && styles.recordingHintPaused]}>
                    {recPaused ? 'متوقف مؤقتاً' : 'جاري تسجيل مقطع صوتي...'}
                  </Text>
                  <Text style={styles.recordingTimer}>{formatRecTime(recordSecs)}</Text>
                  {!recPaused && <View style={styles.recordingBlinkDot} />}
                </View>
              </>
            ) : (
              <View style={styles.holdRow}>
                <View style={styles.lockHint}>
                  <Ionicons name="chevron-up" size={14} color="#8696A0" />
                  <MaterialCommunityIcons name="lock-outline" size={13} color="#8696A0" />
                </View>

                <View style={styles.recordingInfo}>
                  <Text
                    style={[styles.cancelHint, willCancel && styles.cancelHintActive]}
                    numberOfLines={1}
                  >
                    {willCancel ? 'اتركه للإلغاء' : 'اسحب للإلغاء'}
                  </Text>
                  <Ionicons
                    name={cancelSign > 0 ? 'arrow-forward' : 'arrow-back'}
                    size={14}
                    color={willCancel ? '#EF4444' : '#8696A0'}
                  />
                </View>

                <View style={styles.recordingInfo}>
                  <Text style={styles.recordingTimer}>{formatRecTime(recordSecs)}</Text>
                  <View style={styles.recordingBlinkDot} />
                </View>
              </View>
            )}
          </View>
        ) : (
        <View style={styles.composerPill}>
          <View style={styles.leftInsideIcons}>
            <TouchableOpacity
              onPress={onOpenAttach}
              style={styles.insideIconBtn}
              hitSlop={6}
            >
              <Ionicons
                name="attach"
                size={23}
                color="#667781"
                style={{ transform: [{ rotate: '-45deg' }] }}
              />
            </TouchableOpacity>

            {!hasText && (
              <TouchableOpacity
                onPress={onOpenCameraQuick}
                style={styles.insideIconBtn}
                hitSlop={6}
              >
                <Ionicons name="camera-outline" size={21} color="#667781" />
              </TouchableOpacity>
            )}
          </View>

          <TextInput
            ref={inputRef}
            style={styles.textInput}
            placeholder="اكتب رسالة..."
            placeholderTextColor="#8696A0"
            value={text}
            onChangeText={setText}
            multiline
            textAlign="right"
          />

          <TouchableOpacity
            onPress={onOpenQuickReplies}
            style={styles.insideIconBtn}
            hitSlop={6}
          >
            <MaterialCommunityIcons name="flash-outline" size={21} color={Colors.primaryDark} />
          </TouchableOpacity>
        </View>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  barWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingTop: 6,
    gap: 6,
    backgroundColor: 'transparent',
  },
  composerPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 44,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  leftInsideIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 2,
  },
  insideIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    color: '#111B21',
    fontSize: 15,
    maxHeight: 112,
    paddingHorizontal: 6,
    paddingTop: 7,
    paddingBottom: 7,
    writingDirection: 'rtl',
  },
  sendFab: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.18,
    shadowRadius: 2.5,
  },
  recordingPill: {
    flex: 1,
    height: 45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 23,
    paddingHorizontal: 12,
    elevation: 2,
  },
  trashRecBtn: {
    padding: 4,
  },
  pauseRecBtn: {
    padding: 4,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingHintPaused: {
    color: '#B45309',
    fontWeight: '700',
  },
  recordingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recordingBlinkDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#EF4444',
  },
  recordingTimer: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111B21',
  },
  recordingHint: {
    fontSize: 12.5,
    color: '#667781',
  },
  holdRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  lockHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    opacity: 0.9,
  },
  cancelHint: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#8696A0',
  },
  cancelHintActive: {
    color: '#EF4444',
  },
});
