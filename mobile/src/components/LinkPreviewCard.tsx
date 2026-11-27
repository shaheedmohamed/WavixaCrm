import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchLinkPreview, firstUrl, LinkPreview } from '../services/linkPreview';

/**
 * WhatsApp-style OG card rendered under a message bubble's text — lazy
 * fetches once mounted (bubbles are already windowed by the FlatList).
 * Renders nothing while loading or when the URL has no OG data.
 */
export const LinkPreviewCard: React.FC<{
  text: string | null | undefined;
  outgoing?: boolean;
}> = ({ text, outgoing }) => {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const url = firstUrl(text);

  useEffect(() => {
    let alive = true;
    if (url) {
      fetchLinkPreview(url).then((p) => {
        if (alive) {
          setPreview(p);
          setLoaded(true);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url || !loaded || !preview) return null;

  const open = () => Linking.openURL(preview.url).catch(() => {});

  return (
    <TouchableOpacity
      style={[styles.card, outgoing && styles.cardOutgoing]}
      activeOpacity={0.8}
      onPress={open}
    >
      {preview.image ? (
        <Image source={{ uri: preview.image }} style={styles.image} resizeMode="cover" />
      ) : null}
      <View style={styles.body}>
        {preview.title ? (
          <Text style={styles.title} numberOfLines={2}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
        <View style={styles.domainRow}>
          <Ionicons name="link" size={11} color={outgoing ? '#5C8B69' : '#8696A0'} />
          <Text style={[styles.domain, outgoing && styles.domainOutgoing]} numberOfLines={1}>
            {preview.domain}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 6,
    borderRadius: 10,
    backgroundColor: '#F0F2F5',
    overflow: 'hidden',
    borderLeftWidth: 3,
    borderLeftColor: '#8696A0',
  },
  cardOutgoing: {
    backgroundColor: '#C4E8B2',
    borderLeftColor: '#21A45B',
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: '#E2E8F0',
  },
  body: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  title: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
    lineHeight: 19,
  },
  desc: {
    fontSize: 12.5,
    color: '#54656F',
    textAlign: 'right',
    lineHeight: 17,
    marginTop: 2,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  domain: {
    fontSize: 11,
    color: '#8696A0',
    flex: 1,
    textAlign: 'left',
  },
  domainOutgoing: { color: '#5C8B69' },
});
