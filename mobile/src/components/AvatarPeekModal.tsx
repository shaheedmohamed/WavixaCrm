import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { avatarSrc } from '../services/media';
import { Conversation } from '../types/crm';

interface AvatarPeekModalProps {
  conversation: Conversation | null;
  title: string;
  onClose: () => void;
  onExpand: () => void;
  onOpenChat: () => void;
  onOpenInfo: () => void;
}

const CARD_W = Math.min(Dimensions.get('window').width - 56, 360);

/** WhatsApp-style avatar peek: tapping a chat's profile picture opens the
 *  photo in a floating card with quick actions underneath, and tapping the
 *  photo again jumps to the full-screen viewer. */
export const AvatarPeekModal: React.FC<AvatarPeekModalProps> = ({
  conversation,
  title,
  onClose,
  onExpand,
  onOpenChat,
  onOpenInfo,
}) => {
  const { token } = useAuth();
  if (!conversation) return null;

  const uri = avatarSrc(conversation, token);
  const isGroup = conversation.contact_jid?.includes('@g.us');
  const initial = (title || ' ').trim().charAt(0).toUpperCase();

  return (
    <Modal
      visible={!!conversation}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.scrim}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Photo — tap expands to the full-screen viewer */}
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={uri ? onExpand : undefined}
                style={styles.photoBox}
              >
                {uri ? (
                  <Image source={{ uri }} style={styles.photo} />
                ) : (
                  <View
                    style={[
                      styles.photo,
                      styles.photoFallback,
                      { backgroundColor: isGroup ? '#00A884' : '#6C757D' },
                    ]}
                  >
                    {isGroup ? (
                      <MaterialCommunityIcons
                        name="account-group"
                        size={CARD_W * 0.4}
                        color="#FFFFFF"
                      />
                    ) : (
                      <Text style={styles.fallbackLetter}>{initial}</Text>
                    )}
                  </View>
                )}

                {/* Name strip over the photo, like WhatsApp */}
                <View style={styles.nameStrip}>
                  <Text style={styles.nameText} numberOfLines={1}>
                    {title}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Quick actions */}
              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={onOpenChat}>
                  <MaterialCommunityIcons name="chat" size={24} color="#00A884" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={onOpenInfo}>
                  <Ionicons name="information-circle-outline" size={26} color="#00A884" />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: CARD_W,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  photoBox: {
    width: CARD_W,
    height: CARD_W,
    backgroundColor: '#111B21',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackLetter: {
    color: '#FFFFFF',
    fontSize: CARD_W * 0.38,
    fontWeight: '700',
  },
  nameStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 8,
  },
  actionBtn: {
    padding: 8,
  },
});
