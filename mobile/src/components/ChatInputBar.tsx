import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { Colors } from '../constants/theme';

export interface ChatInputBarHandle {
  focus: () => void;
  appendText: (snippet: string) => void;
}

interface ChatInputBarProps {
  bottomInset: number;
  isKeyboardVisible: boolean;
  onSendText: (text: string) => void;
  onSendVoice: (uri: string, durationSec: number) => void;
  onOpenAttach: () => void;
  onOpenCameraQuick: () => void;
  onOpenQuickReplies: () => void;
}

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
    },
    ref
  ) {
    const [text, setText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [recordSecs, setRecordSecs] = useState(0);

    const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const recorderState = useAudioRecorderState(recorder, 250);

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
    }));

    useEffect(() => {
      let t: ReturnType<typeof setInterval> | null = null;
      if (isRecording) {
        t = setInterval(() => setRecordSecs((s) => s + 1), 1000);
      }
      return () => {
        if (t) clearInterval(t);
      };
    }, [isRecording]);

    const formatRecTime = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handlePressSend = () => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setText('');
      onSendText(trimmed);
    };

    const startRecording = async () => {
      try {
        const perm = await requestRecordingPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'الصلاحية مطلوبة',
            'اسمح للتطبيق باستخدام الميكروفون لتسجيل الرسائل الصوتية'
          );
          return;
        }
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setIsRecording(true);
        setRecordSecs(0);
      } catch (err: any) {
        Alert.alert('خطأ', err.message || 'تعذر بدء التسجيل');
      }
    };

    const cancelRecording = async () => {
      try {
        await recorder.stop();
      } catch {}
      setIsRecording(false);
      setRecordSecs(0);
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    };

    const finishAndSendRecording = async () => {
      const capturedSecs = recordSecs;
      try {
        await recorder.stop();
      } catch {}
      setIsRecording(false);
      setRecordSecs(0);
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

      const uri = recorder.uri || recorderState.url;
      if (!uri) {
        Alert.alert('خطأ', 'لم يتم حفظ التسجيل الصوتي');
        return;
      }
      if (capturedSecs < 1) return;
      onSendVoice(uri, capturedSecs);
    };

    const padBottom = isKeyboardVisible ? 6 : Math.max(bottomInset, 8);

    if (isRecording) {
      return (
        <View style={[styles.barWrap, { paddingBottom: padBottom }]}>
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

          <View style={styles.recordingPill}>
            <TouchableOpacity onPress={cancelRecording} style={styles.trashRecBtn} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color="#EF4444" />
            </TouchableOpacity>

            <View style={styles.recordingInfo}>
              <Text style={styles.recordingHint}>جاري تسجيل مقطع صوتي...</Text>
              <Text style={styles.recordingTimer}>{formatRecTime(recordSecs)}</Text>
              <View style={styles.recordingBlinkDot} />
            </View>
          </View>
        </View>
      );
    }

    const hasText = text.trim().length > 0;

    return (
      <View style={[styles.barWrap, { paddingBottom: padBottom }]}>
        <TouchableOpacity
          style={styles.sendFab}
          onPress={hasText ? handlePressSend : startRecording}
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
});
