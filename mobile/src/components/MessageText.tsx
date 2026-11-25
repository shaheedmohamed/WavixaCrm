import React, { useCallback } from 'react';
import { Text, StyleSheet, Linking } from 'react-native';
import { MentionRef } from '../types/crm';

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const IS_URL_RE = /^(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)$/i;
const TOKEN_RE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g;
const MENTION_RE = /(@\d{5,20})/g;

interface Props {
  text: string;
  isOutgoing?: boolean;
  style?: object;
  mentions?: MentionRef[] | null;
  onPressMention?: (m: MentionRef) => void;
}

/** Renders message text with tappable links and WhatsApp-style formatting
 *  (*bold*, _italic_, ~strike~, ```mono```). */
const MessageTextComponent: React.FC<Props> = ({ text, isOutgoing = false, style, mentions, onPressMention }) => {
  const openUrl = useCallback((url: string) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(href).catch(() => {});
  }, []);

  if (!text) return null;

  // WhatsApp writes mentions as bare "@digits" (PN or LID); the backend ships
  // the resolved list so a token only becomes a chip when it matches a real
  // mention, never a random "@12345" in ordinary text.
  const mentionByDigits = new Map<string, MentionRef>();
  for (const m of mentions || []) {
    const d = (m.jid || '').split('@')[0].replace(/\D/g, '');
    if (d) mentionByDigits.set(d, m);
  }

  const linkColor = '#027EB5';

  // First pass: split on URLs so links never get mangled by markdown parsing.
  const parts = text.split(URL_RE);
  const nodes: React.ReactNode[] = [];

  const renderFormatted = (segment: string, keyPrefix: string) => {
    const chunks = segment.split(TOKEN_RE);
    return chunks.map((chunk, i) => {
      const key = `${keyPrefix}-${i}`;
      if (!chunk) return null;

      if (chunk.length > 2 && chunk.startsWith('*') && chunk.endsWith('*')) {
        return (
          <Text key={key} style={styles.bold}>
            {chunk.slice(1, -1)}
          </Text>
        );
      }
      if (chunk.length > 2 && chunk.startsWith('_') && chunk.endsWith('_')) {
        return (
          <Text key={key} style={styles.italic}>
            {chunk.slice(1, -1)}
          </Text>
        );
      }
      if (chunk.length > 2 && chunk.startsWith('~') && chunk.endsWith('~')) {
        return (
          <Text key={key} style={styles.strike}>
            {chunk.slice(1, -1)}
          </Text>
        );
      }
      if (chunk.length > 5 && chunk.startsWith('```') && chunk.endsWith('```')) {
        return (
          <Text key={key} style={styles.mono}>
            {chunk.slice(3, -3)}
          </Text>
        );
      }
      if (mentionByDigits.size === 0) {
        return <Text key={key}>{chunk}</Text>;
      }
      return chunk.split(MENTION_RE).map((piece, j) => {
        const mkey = `${key}-${j}`;
        if (!piece) return null;
        const mt = piece.match(/^@(\d{5,20})$/);
        const mention = mt ? mentionByDigits.get(mt[1]) : undefined;
        if (!mention) return <Text key={mkey}>{piece}</Text>;
        const label = mention.name
          ? `@${mention.name}`
          : mention.phone
            ? `@⁦+${mention.phone}⁩`
            : `⁦${piece}⁩`;
        return (
          <Text key={mkey} style={styles.mention} onPress={() => onPressMention?.(mention)}>
            {label}
          </Text>
        );
      });
    });
  };

  parts.forEach((part, idx) => {
    if (!part) return;
    if (IS_URL_RE.test(part)) {
      nodes.push(
        <Text
          key={`url-${idx}`}
          style={[styles.link, { color: linkColor }]}
          onPress={() => openUrl(part)}
          suppressHighlighting={false}
        >
          {part}
        </Text>
      );
    } else {
      nodes.push(...renderFormatted(part, `seg-${idx}`));
    }
  });

  return (
    <Text style={[styles.text, style]} selectable>
      {nodes}
    </Text>
  );
};

const styles = StyleSheet.create({
  text: {
    fontSize: 13,
    color: '#111B21',
    lineHeight: 18.5,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  link: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  mention: {
    color: '#1C86C8',
    fontWeight: '700',
  },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  mono: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.06)',
    color: '#111B21',
    fontSize: 12,
  },
});

export const MessageText = React.memo(MessageTextComponent);
