import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';
import { docInfo } from '../services/media';

export interface PendingMedia {
  uri: string;
  name?: string;
  mimeType?: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';
}

interface MediaComposerModalProps {
  media: PendingMedia | null;
  sending: boolean;
  onClose: () => void;
  onSend: (caption: string) => void;
}

/** WhatsApp-style media composer — preview the picked file, type an optional
 *  caption, then send. */
export const MediaComposerModal: React.FC<MediaComposerModalProps> = ({
  media,
  sending,
  onClose,
  onSend,
}) => {
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');

  const close = () => {
    setCaption('');
    onClose();
  };

  const send = () => {
    const c = caption.trim();
    setCaption('');
    onSend(c);
  };

  const renderPreview = () => {
    if (!media) return null;
    if (media.type === 'image') {
      return <Image source={{ uri: media.uri }} style={styles.preview} resizeMode="contain" />;
    }
    if (media.type === 'video') {
      return (
        <View style={[styles.preview, styles.darkPreview]}>
          <Ionicons name="videocam" size={54} color="#FFFFFF" />
          <Text style={styles.fileLabel} numberOfLines={1}>{media.name || 'فيديو'}</Text>
        </View>
      );
    }
    const info = docInfo({
      media_meta: { fileName: media.name },
      media_mime_type: media.mimeType,
      media_url: null,
      media_size: null,
      message: null,
    });
    return (
      <View style={[styles.preview, styles.darkPreview]}>
        <View style={[styles.docIcon, { backgroundColor: info.color }]}>
          <MaterialCommunityIcons name="file-document" size={34} color="#FFFFFF" />
          <Text style={styles.docExt}>{info.ext}</Text>
        </View>
        <Text style={styles.fileLabel} numberOfLines={2}>{media.name || 'ملف'}</Text>
      </View>
    );
  };

  return (
    <Modal visible={!!media} animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.closeBtn} onPress={close} hitSlop={10}>
          <Ionicons name="close" size={28} color="#FFFFFF" />
        </Pressable>

        <View style={styles.previewArea}>{renderPreview()}</View>

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TextInput
            style={styles.input}
            placeholder="أضف تعليقاً..."
            placeholderTextColor="#8696A0"
            value={caption}
            onChangeText={setCaption}
            multiline
            textAlign="right"
          />
          <TouchableOpacity
            style={styles.sendBtn}
            onPress={send}
            disabled={sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  closeBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    left: 18,
    zIndex: 10,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewArea: {
    flex: 1,
    justifyContent: 'center',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  darkPreview: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 30,
  },
  fileLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  docIcon: {
    width: 78,
    height: 88,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docExt: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  inputBar: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#1F2C34',
    borderRadius: 22,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 110,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
