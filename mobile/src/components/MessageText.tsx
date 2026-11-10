import React, { useCallback } from 'react';
import { Text, StyleSheet, Linking } from 'react-native';

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
const TOKEN_RE = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g;

interface Props {
  text: string;
  isOutgoing?: boolean;
  style?: object;
}

/** Renders message text with tappable links and WhatsApp-style formatting
 *  (*bold*, _italic_, ~strike~, ```mono```). */
export const MessageText: React.FC<Props> = ({ text, isOutgoing = false, style }) => {
  const openUrl = useCallback((url: string) => {
    const href = url.startsWith('http') ? url : `https://${url}`;
    Linking.openURL(href).catch(() => {});
  }, []);

  if (!text) return null;

  const linkColor = isOutgoing ? '#0B57A4' : '#027EB5';

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
      return <Text key={key}>{chunk}</Text>;
    });
  };

  parts.forEach((part, idx) => {
    if (!part) return;
    if (URL_RE.test(part)) {
      URL_RE.lastIndex = 0;
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
      URL_RE.lastIndex = 0;
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
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  strike: { textDecorationLine: 'line-through' },
  mono: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(0,0,0,0.06)',
    fontSize: 12,
  },
});
