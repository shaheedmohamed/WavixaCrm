import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatAvatar } from './ChatAvatar';
import { Conversation, Message, MessageReaction } from '../types/crm';
import { Colors } from '../constants/theme';

interface ReactionDetailsSheetProps {
  conversation: Conversation | null;
  message: Message | null;
  contactTitle: string;
  selfName?: string;
  onClose: () => void;
  onRemoveMine: (message: Message) => void;
}

const digits = (v?: string | null) => (v || '').replace(/\D/g, '');

/** WhatsApp-style "who reacted" sheet: emoji filter chips on top, one row
 *  per reactor; your own reaction offers a tap-to-remove action. */
export const ReactionDetailsSheet: React.FC<ReactionDetailsSheetProps> = ({
  conversation,
  message,
  contactTitle,
  selfName,
  onClose,
  onRemoveMine,
}) => {
  const insets = useSafeAreaInsets();
  const [emojiFilter, setEmojiFilter] = useState<string | null>(null);

  const reactions = useMemo(
    () => (Array.isArray(message?.reactions) ? message!.reactions! : []),
    [message]
  );
  const sessionDigits = digits(conversation?.session?.phone_number);
  const contactDigits = digits(conversation?.contact_phone || conversation?.contact_jid);

  const rows = useMemo(() => {
    return reactions
      .filter((r): r is MessageReaction & { emoji: string } => !!r?.emoji)
      .map((r) => {
        const fromDigits = digits(r.from);
        const isMine = !!sessionDigits && fromDigits === sessionDigits;
        const isContact =
          !isMine && !!contactDigits && (contactDigits.endsWith(fromDigits) || fromDigits === contactDigits);
        const name = isMine
          ? 'أنت'
          : isContact || !conversation?.is_group
            ? contactTitle
            : fromDigits
              ? `+${fromDigits}`
              : 'مشارك';
        return { reaction: r, isMine, name };
      })
      .filter((row) => !emojiFilter || row.reaction.emoji === emojiFilter)
      .sort((a, b) => (b.reaction.timestamp || 0) - (a.reaction.timestamp || 0));
  }, [reactions, emojiFilter, sessionDigits, contactDigits, conversation?.is_group, contactTitle]);

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    reactions.forEach((r) => {
      if (r?.emoji) counts.set(r.emoji, (counts.get(r.emoji) || 0) + 1);
    });
    return Array.from(counts.entries());
  }, [reactions]);

  const open = !!message && reactions.length > 0;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 6 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>
              {reactions.length === 1 ? 'تفاعل واحد' : `${reactions.length} تفاعلات`}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#667781" />
            </TouchableOpacity>
          </View>

          {/* Emoji filter chips — "الكل" then one per emoji, like WhatsApp. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            <TouchableOpacity
              style={[styles.chip, !emojiFilter && styles.chipActive]}
              onPress={() => setEmojiFilter(null)}
            >
              <Text style={[styles.chipText, !emojiFilter && styles.chipTextActive]}>
                الكل {reactions.length}
              </Text>
            </TouchableOpacity>
            {chips.map(([emoji, count]) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.chip, emojiFilter === emoji && styles.chipActive]}
                onPress={() => setEmojiFilter(emojiFilter === emoji ? null : emoji)}
              >
                <Text style={styles.chipEmoji}>{emoji}</Text>
                <Text style={[styles.chipText, emojiFilter === emoji && styles.chipTextActive]}>
                  {count}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.list}>
            {rows.map((row, idx) => (
              <TouchableOpacity
                key={`${row.reaction.from}-${idx}`}
                style={styles.row}
                activeOpacity={row.isMine ? 0.7 : 1}
                onPress={() => row.isMine && message && onRemoveMine(message)}
              >
                {row.isMine ? (
                  <View style={styles.selfAvatar}>
                    <Text style={styles.selfAvatarLetter}>
                      {(selfName || 'أ').trim().charAt(0)}
                    </Text>
                  </View>
                ) : conversation ? (
                  <ChatAvatar conversation={conversation} title={contactTitle} size={40} />
                ) : (
                  <View style={styles.selfAvatar}>
                    <Text style={styles.selfAvatarLetter}>{row.name.charAt(0)}</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  {row.isMine ? (
                    <Text style={styles.rowHint}>اضغط للإزالة</Text>
                  ) : null}
                </View>
                <Text style={styles.rowEmoji}>{row.reaction.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingTop: 8,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D7DB',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  closeBtn: {
    padding: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
  },
  chipActive: {
    backgroundColor: '#D9FDD3',
  },
  chipEmoji: {
    fontSize: 15,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667781',
  },
  chipTextActive: {
    color: Colors.primary,
  },
  list: {
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selfAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8AA0A9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selfAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#111B21',
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  rowHint: {
    fontSize: 11.5,
    color: '#8696A0',
    marginTop: 1,
    textAlign: 'left',
    writingDirection: 'rtl',
  },
  rowEmoji: {
    fontSize: 22,
  },
});
