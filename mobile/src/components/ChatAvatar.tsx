import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { avatarSrc } from '../services/media';
import { Conversation } from '../types/crm';

interface ChatAvatarProps {
  conversation: Pick<Conversation, 'id' | 'contact_jid' | 'contact_avatar'>;
  title: string;
  size?: number;
  badge?: boolean;
}

/** Conversation profile picture — resolves through the backend avatar
 *  endpoint (token-authed, serves the cached local copy so expired CDN
 *  links never flicker) and falls back to the letter/group placeholder. */
const ChatAvatarComponent: React.FC<ChatAvatarProps> = ({
  conversation,
  title,
  size = 48,
  badge = false,
}) => {
  const { token } = useAuth();
  const [failed, setFailed] = useState(false);
  const uri = avatarSrc(conversation, token);

  const isGroup = conversation.contact_jid?.includes('@g.us');
  const initial = (title || ' ').trim().charAt(0).toUpperCase();
  const radius = size / 2;
  const badgeSize = Math.max(13, Math.round(size * 0.31));

  return (
    <View style={styles.wrap}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius, backgroundColor: '#E9EDEF' }}
          onError={() => setFailed(true)}
        />
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: radius,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isGroup ? '#00A884' : '#6C757D',
          }}
        >
          {isGroup ? (
            <MaterialCommunityIcons name="account-group" size={size * 0.44} color="#FFFFFF" />
          ) : (
            <Text style={[styles.letter, { fontSize: size * 0.38 }]}>{initial}</Text>
          )}
        </View>
      )}

      {badge ? (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2 + 1,
            },
          ]}
        >
          <FontAwesome name="whatsapp" size={badgeSize * 0.62} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  letter: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    backgroundColor: '#25D366',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const ChatAvatar = React.memo(ChatAvatarComponent);
