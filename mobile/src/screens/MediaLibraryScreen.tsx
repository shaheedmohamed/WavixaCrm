import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Linking,
  RefreshControl,
  SectionList,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { chatService } from '../services/chatService';
import {
  docInfo,
  formatAudioSeconds,
  formatBytes,
  isAudioMessage,
  isPlaceholderText,
  mediaSrc,
  videoThumbSrc,
} from '../services/media';
import { Config } from '../constants/config';
import { useAuth } from '../context/AuthContext';
import { ChatAvatar } from '../components/ChatAvatar';
import { ForwardModal } from '../components/ForwardModal';
import { MediaViewerModal, GalleryMediaItem } from '../components/MediaViewerModal';
import { Conversation, MediaLibraryItem, MediaLibraryKind } from '../types/crm';
import { Colors } from '../constants/theme';

interface MediaLibraryScreenProps {
  onBack: () => void;
  // Opens the owning conversation centered on this exact message.
  onOpenConversation: (conversation: Conversation, messageId: number | string) => void;
}

const SCREEN_W = Dimensions.get('window').width;
const GRID_COLS = 3;
const GRID_GAP = 2;
const CELL_SIZE = (SCREEN_W - GRID_GAP * (GRID_COLS + 1)) / GRID_COLS;
const PAGE_LIMIT = 90;

const TABS: { key: MediaLibraryKind; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'media', label: 'الوسائط', icon: 'images-outline' },
  { key: 'docs', label: 'المستندات', icon: 'document-text-outline' },
  { key: 'links', label: 'الروابط', icon: 'link-outline' },
];

/* ------------------------------ helpers ------------------------------ */

const convTitle = (conv?: MediaLibraryItem['conversation'] | null): string => {
  if (!conv) return 'محادثة';
  return (
    conv.contact_name ||
    (conv.contact_username ? `@${conv.contact_username}` : null) ||
    (conv.contact_phone ? `+${conv.contact_phone}` : 'عميل')
  );
};

// Who handled this item — shown on every row/cell.
// outgoing + sent_by → the teammate; outgoing without → the WhatsApp phone
// app itself; incoming → the contact (group sender name when present).
const attributionOf = (item: MediaLibraryItem): { icon: 'up' | 'down' | 'wa'; label: string } => {
  if (item.direction === 'outgoing') {
    if (item.sent_by?.name) return { icon: 'up', label: item.sent_by.name };
    return { icon: 'wa', label: 'واتساب' };
  }
  const conv = item.conversation;
  const label =
    item.sender_name ||
    (item.sender_phone ? `+${item.sender_phone}` : null) ||
    convTitle(conv);
  return { icon: 'down', label };
};

const dayKey = (ts?: string | null): string => {
  if (!ts) return 'nodate';
  try {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  } catch {
    return 'nodate';
  }
};

const dayTitle = (ts?: string | null): string => {
  if (!ts) return 'بدون تاريخ';
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    if (sameDay) return 'اليوم';
    const yesterday = new Date(now.getTime() - 86400000);
    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return 'أمس';
    }
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return '';
  }
};

const formatTime = (ts?: string | null): string => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  } catch {
    return '';
  }
};

const firstUrl = (item: MediaLibraryItem): string | null => {
  const text = `${item.message || ''} ${item.media_caption || ''}`;
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0] : null;
};

const urlHost = (url: string): string => {
  try {
    return url.replace(/^https?:\/\//i, '').split('/')[0];
  } catch {
    return url;
  }
};

/* ------------------------ download/share helpers ------------------------ */

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/3gpp': '3gp',
  'audio/mpeg': 'mp3',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'application/pdf': 'pdf',
};

const extFor = (m: MediaLibraryItem): string => {
  const fn = m.media_meta?.fileName;
  if (fn && fn.includes('.')) {
    return fn.split('.').pop()!.toLowerCase();
  }
  const mime = m.media_mime_type || '';
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  const sub = mime.split('/')[1];
  if (sub && /^[a-z0-9]+$/.test(sub)) return sub;
  return m.message_type === 'video'
    ? 'mp4'
    : m.message_type === 'image' || m.message_type === 'sticker'
      ? 'jpg'
      : 'bin';
};

// Items the gallery/download flow can handle — anything with a resolvable
// media payload (photos, videos, stickers, docs, audio). Links have none.
const isFileItem = (m: MediaLibraryItem): boolean =>
  Boolean(m.media_url || m.media_meta?.mediaKey || m.local_uri);

// Pull a message's media into the app cache and return a local file:// uri —
// shared by the download-to-gallery and external-share actions.
const fetchToCache = async (
  m: MediaLibraryItem,
  token: string | null | undefined
): Promise<string | null> => {
  if (m.local_uri) return m.local_uri;
  const uri = mediaSrc(m, token);
  if (!uri) return null;
  try {
    const dest = new File(Paths.cache, `wavixa_lib_${m.id}_${Date.now()}.${extFor(m)}`);
    const f = await File.createDownloadTask(uri, dest).downloadAsync();
    return f?.uri || null;
  } catch {
    return null;
  }
};

/* --------------------------- data hook --------------------------- */

// Each tab fetches independently on first activation and keeps its loaded
// pages + scroll position when the user switches away and back.
const useLibraryData = (kind: MediaLibraryKind, active: boolean) => {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [started, setStarted] = useState(false);
  const itemsRef = useRef<MediaLibraryItem[]>([]);
  const busyRef = useRef(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more') => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (mode === 'refresh') setRefreshing(true);
      else if (mode === 'more') setLoadingMore(true);
      else setLoading(true);
      try {
        const beforeId =
          mode === 'more' ? itemsRef.current[itemsRef.current.length - 1]?.id : undefined;
        const res = await chatService.getMediaLibrary(kind, {
          before_id: beforeId,
          limit: PAGE_LIMIT,
        });
        if (res?.success && Array.isArray(res.items)) {
          setHasMore(Boolean(res.has_more));
          if (mode === 'more') {
            setItems((prev) => {
              const seen = new Set(prev.map((p) => p.id));
              const extra = res.items.filter((it) => !seen.has(it.id));
              const next = [...prev, ...extra];
              itemsRef.current = next;
              return next;
            });
          } else {
            itemsRef.current = res.items;
            setItems(res.items);
          }
        }
      } catch {
      } finally {
        busyRef.current = false;
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [kind]
  );

  useEffect(() => {
    if (active && !started) {
      // Deferred so the setState doesn't run synchronously inside the effect.
      Promise.resolve().then(() => {
        setStarted(true);
        load('initial');
      });
    }
  }, [active, started, load]);

  const loadMore = useCallback(() => {
    if (hasMore && !busyRef.current) load('more');
  }, [hasMore, load]);

  return { items, loading, refreshing, loadingMore, hasMore, started, load, loadMore };
};

/* --------------------------- shared bits --------------------------- */

const SectionHeader: React.FC<{ title: string }> = React.memo(({ title }) => (
  <View style={styles.dayHeader}>
    <Text style={styles.dayHeaderText}>{title}</Text>
  </View>
));
SectionHeader.displayName = 'SectionHeader';

// Compact attribution tag — the "who sent it" line the owner asked for on
// every item: ↓ contact for incoming, ↑ employee name for CRM sends,
// WhatsApp glyph when the message left from the phone app directly.
const SenderTag: React.FC<{ item: MediaLibraryItem; onDark?: boolean }> = React.memo(
  ({ item, onDark }) => {
    const a = attributionOf(item);
    const color = onDark ? '#E9EDEF' : '#54656F';
    return (
      <View style={styles.senderTag}>
        {a.icon === 'wa' ? (
          <FontAwesome5 name="whatsapp" size={9.5} color={onDark ? '#4ADE80' : Colors.secondary} />
        ) : (
          <Ionicons
            name={a.icon === 'up' ? 'arrow-up' : 'arrow-down'}
            size={10}
            color={a.icon === 'up' ? (onDark ? '#7DD3C8' : Colors.primary) : color}
          />
        )}
        <Text
          style={[styles.senderTagText, { color }]}
          numberOfLines={1}
        >
          {a.label}
        </Text>
      </View>
    );
  }
);
SenderTag.displayName = 'SenderTag';

const EmptyPane: React.FC<{ icon: keyof typeof Ionicons.glyphMap; title: string; sub: string }> = ({
  icon,
  title,
  sub,
}) => (
  <View style={styles.centerBox}>
    <View style={styles.emptyIconWrap}>
      <Ionicons name={icon} size={42} color="#C2C9CE" />
    </View>
    <Text style={styles.emptyTitle}>{title}</Text>
    <Text style={styles.emptySub}>{sub}</Text>
  </View>
);

const PaneFooter: React.FC<{ loadingMore: boolean; hasMore: boolean; count: number }> = ({
  loadingMore,
  hasMore,
  count,
}) => (
  <View style={styles.paneFooter}>
    {loadingMore ? (
      <ActivityIndicator size="small" color={Colors.primary} />
    ) : hasMore ? (
      <Text style={styles.paneFooterText}>اسحب للأسفل لتحميل المزيد</Text>
    ) : (
      <Text style={styles.paneFooterText}>
        {count > 0 ? 'وصلت لنهاية الوسائط المتاحة' : ''}
      </Text>
    )}
    <Text style={styles.hintText}>
      ضغطة مطولة للتحديد — وأثناء العرض زرار المحادثة ينقلك للرسالة
    </Text>
  </View>
);

/* ------------------------------ media grid ------------------------------ */

type GridEntry =
  | { type: 'header'; key: string; title: string }
  | { type: 'row'; key: string; cells: MediaLibraryItem[] };

const MediaGridPane: React.FC<{
  active: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (item: MediaLibraryItem) => void;
  onItems: (items: MediaLibraryItem[]) => void;
  onOpenViewer: (items: MediaLibraryItem[], index: number) => void;
}> = ({ active, selectedIds, onToggleSelect, onItems, onOpenViewer }) => {
  const { token } = useAuth();
  const { items, loading, refreshing, loadingMore, hasMore, started, load, loadMore } =
    useLibraryData('media', active);
  const selectionMode = selectedIds.size > 0;

  useEffect(() => {
    onItems(items);
  }, [items, onItems]);

  const gridData = useMemo(() => {
    const rows: GridEntry[] = [];
    let lastDay = '';
    let bucket: MediaLibraryItem[] = [];
    const flush = () => {
      for (let i = 0; i < bucket.length; i += GRID_COLS) {
        rows.push({
          type: 'row',
          key: `row-${bucket[i].id}`,
          cells: bucket.slice(i, i + GRID_COLS),
        });
      }
      bucket = [];
    };
    for (const it of items) {
      const dk = dayKey(it.timestamp);
      if (dk !== lastDay) {
        flush();
        rows.push({ type: 'header', key: `h-${dk}-${it.id}`, title: dayTitle(it.timestamp) });
        lastDay = dk;
      }
      bucket.push(it);
    }
    flush();
    return rows;
  }, [items]);

  const renderCell = useCallback(
    (m: MediaLibraryItem) => {
      const uri = mediaSrc(m, token);
      const isVid = m.message_type === 'video';
      const poster = isVid ? videoThumbSrc(m, token) : null;
      const imgUri = isVid ? poster || uri : uri;
      const a = attributionOf(m);
      const isSel = selectedIds.has(m.id);
      return (
        <TouchableOpacity
          key={m.id}
          style={styles.cell}
          activeOpacity={0.85}
          onPress={() =>
            selectionMode
              ? onToggleSelect(m)
              : onOpenViewer(
                  items,
                  items.findIndex((x) => x.id === m.id)
                )
          }
          onLongPress={() => onToggleSelect(m)}
          delayLongPress={240}
        >
          {imgUri ? (
            <Image source={{ uri: imgUri }} style={styles.cellImage} resizeMode="cover" />
          ) : (
            <View style={[styles.cellImage, styles.cellNoThumb]}>
              <Ionicons
                name={isVid ? 'videocam-outline' : 'image-outline'}
                size={22}
                color="#8696A0"
              />
            </View>
          )}

          {isVid ? (
            <View style={styles.cellVideoPill}>
              <Ionicons name="videocam" size={10} color="#FFFFFF" />
              <Text style={styles.cellVideoText}>
                {m.media_meta?.seconds ? formatAudioSeconds(m.media_meta.seconds) : 'فيديو'}
              </Text>
            </View>
          ) : null}

          {m.revoked_at ? (
            <View style={styles.cellRevokedBadge}>
              <MaterialCommunityIcons name="delete-outline" size={10} color="#FCA5A5" />
            </View>
          ) : null}

          <View style={styles.cellSenderStrip}>
            {a.icon === 'wa' ? (
              <FontAwesome5 name="whatsapp" size={8.5} color="#4ADE80" />
            ) : (
              <Ionicons
                name={a.icon === 'up' ? 'arrow-up' : 'arrow-down'}
                size={9}
                color={a.icon === 'up' ? '#7DD3C8' : '#E9EDEF'}
              />
            )}
            <Text style={styles.cellSenderText} numberOfLines={1}>
              {a.label}
            </Text>
          </View>

          {isSel ? (
            <View style={styles.cellSelectedOverlay}>
              <View style={styles.cellSelectedCheck}>
                <Ionicons name="checkmark" size={13} color="#FFFFFF" />
              </View>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [items, token, selectedIds, selectionMode, onToggleSelect, onOpenViewer]
  );

  const renderEntry = useCallback(
    ({ item }: { item: GridEntry }) => {
      if (item.type === 'header') return <SectionHeader title={item.title} />;
      return (
        <View style={styles.gridRow}>
          {item.cells.map(renderCell)}
          {item.cells.length < GRID_COLS
            ? Array.from({ length: GRID_COLS - item.cells.length }).map((_, i) => (
                <View key={`pad-${i}`} style={styles.cellPad} />
              ))
            : null}
        </View>
      );
    },
    [renderCell]
  );

  if (!started || (loading && items.length === 0)) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.centerText}>جاري تحميل الوسائط...</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyPane
        icon="images-outline"
        title="لا توجد وسائط"
        sub="أي صورة أو فيديو يوصل أو يتبعت في أي محادثة هيظهر هنا"
      />
    );
  }

  return (
    <FlatList
      data={gridData}
      keyExtractor={(e) => e.key}
      renderItem={renderEntry}
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      initialNumToRender={14}
      windowSize={9}
      removeClippedSubviews
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load('refresh')}
          colors={[Colors.primary]}
          tintColor={Colors.primary}
        />
      }
      ListFooterComponent={
        <PaneFooter loadingMore={loadingMore} hasMore={hasMore} count={items.length} />
      }
    />
  );
};

/* ------------------------------ docs pane ------------------------------ */

const DocsPane: React.FC<{
  active: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (item: MediaLibraryItem) => void;
  onItems: (items: MediaLibraryItem[]) => void;
  onOpenChat: (item: MediaLibraryItem) => void;
}> = ({ active, selectedIds, onToggleSelect, onItems, onOpenChat }) => {
  const { token } = useAuth();
  const { items, loading, refreshing, loadingMore, hasMore, started, load, loadMore } =
    useLibraryData('docs', active);
  const selectionMode = selectedIds.size > 0;

  useEffect(() => {
    onItems(items);
  }, [items, onItems]);

  const sections = useMemo(() => {
    const map = new Map<string, { title: string; data: MediaLibraryItem[] }>();
    for (const it of items) {
      const dk = dayKey(it.timestamp);
      if (!map.has(dk)) map.set(dk, { title: dayTitle(it.timestamp), data: [] });
      map.get(dk)!.data.push(it);
    }
    return [...map.values()];
  }, [items]);

  const openFile = useCallback(
    (m: MediaLibraryItem) => {
      const uri = mediaSrc(m, token);
      if (uri) Linking.openURL(uri).catch(() => {});
    },
    [token]
  );

  const renderItem = useCallback(
    ({ item }: { item: MediaLibraryItem }) => {
      // 'ptt' rows are voice notes too — isAudioMessage only covers
      // audio|voice, so a raw ptt type would render as a bare FILE card.
      const isAudio =
        isAudioMessage(item) || item.message_type === 'ptt';
      const doc = isAudio ? null : docInfo(item);
      const audioSub = item.media_meta?.seconds
        ? formatAudioSeconds(item.media_meta.seconds)
        : item.media_size
          ? formatBytes(item.media_size)
          : '';
      const conv = item.conversation;
      const isSel = selectedIds.has(item.id);
      return (
        <View style={[styles.docCardWrap, isSel && styles.docCardSelected]}>
          <TouchableOpacity
            style={styles.docRow}
            activeOpacity={0.75}
            onPress={() => (selectionMode ? onToggleSelect(item) : openFile(item))}
            onLongPress={() => onToggleSelect(item)}
            delayLongPress={240}
          >
            {selectionMode ? (
              <View style={[styles.selCircle, isSel && styles.selCircleOn]}>
                {isSel ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
              </View>
            ) : null}
            {isAudio ? (
              <View style={[styles.docIconBox, { backgroundColor: '#7C3AED' }]}>
                <Ionicons name="musical-notes" size={18} color="#FFFFFF" />
                <Text style={styles.docIconExt} numberOfLines={1}>
                  {item.media_meta?.seconds
                    ? formatAudioSeconds(item.media_meta.seconds)
                    : 'صوت'}
                </Text>
              </View>
            ) : (
              <View style={[styles.docIconBox, { backgroundColor: doc!.color }]}>
                <FontAwesome5 name="file-alt" size={16} color="#FFFFFF" />
                <Text style={styles.docIconExt} numberOfLines={1}>
                  {doc!.ext}
                </Text>
              </View>
            )}

            <View style={styles.docBody}>
              <Text style={styles.docName} numberOfLines={1}>
                {isAudio
                  ? item.media_meta?.fileName ||
                    (item.message_type === 'voice' || item.message_type === 'ptt'
                      ? 'رسالة صوتية'
                      : 'ملف صوتي')
                  : doc!.fileName}
              </Text>
              <Text style={styles.docSub} numberOfLines={1}>
                {isAudio ? `صوت${audioSub ? ` • ${audioSub}` : ''}` : doc!.sub}
              </Text>
            </View>

            <Ionicons name="download-outline" size={17} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.metaRow}>
            <ChatAvatar
              conversation={{
                id: conv?.id ?? 0,
                contact_jid: conv?.contact_jid ?? '',
                contact_avatar: conv?.contact_avatar ?? null,
              }}
              title={convTitle(conv)}
              size={22}
            />
            <Text style={styles.metaConv} numberOfLines={1}>
              {convTitle(conv)}
              {conv?.is_group ? ' (مجموعة)' : ''}
            </Text>
            <SenderTag item={item} />
            <Text style={styles.metaTime}>{formatTime(item.timestamp)}</Text>
            {!selectionMode ? (
              <TouchableOpacity
                onPress={() => onOpenChat(item)}
                hitSlop={8}
                style={styles.metaJumpBtn}
              >
                <Ionicons name="chatbox-ellipses-outline" size={15} color={Colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    },
    [openFile, onOpenChat, selectedIds, selectionMode, onToggleSelect]
  );

  if (!started || (loading && items.length === 0)) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.centerText}>جاري تحميل المستندات...</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyPane
        icon="document-text-outline"
        title="لا توجد مستندات"
        sub="الملفات والمستندات والمقاطع الصوتية المتبادلة هتتجمع هنا"
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(it) => String(it.id)}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      stickySectionHeadersEnabled
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      initialNumToRender={20}
      windowSize={9}
      removeClippedSubviews
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load('refresh')}
          colors={[Colors.primary]}
          tintColor={Colors.primary}
        />
      }
      ListFooterComponent={
        <PaneFooter loadingMore={loadingMore} hasMore={hasMore} count={items.length} />
      }
    />
  );
};

/* ------------------------------ links pane ------------------------------ */

const LinksPane: React.FC<{
  active: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (item: MediaLibraryItem) => void;
  onItems: (items: MediaLibraryItem[]) => void;
  onOpenChat: (item: MediaLibraryItem) => void;
}> = ({ active, selectedIds, onToggleSelect, onItems, onOpenChat }) => {
  const { items, loading, refreshing, loadingMore, hasMore, started, load, loadMore } =
    useLibraryData('links', active);
  const selectionMode = selectedIds.size > 0;

  useEffect(() => {
    onItems(items);
  }, [items, onItems]);

  const sections = useMemo(() => {
    const map = new Map<string, { title: string; data: MediaLibraryItem[] }>();
    for (const it of items) {
      const dk = dayKey(it.timestamp);
      if (!map.has(dk)) map.set(dk, { title: dayTitle(it.timestamp), data: [] });
      map.get(dk)!.data.push(it);
    }
    return [...map.values()];
  }, [items]);

  const renderItem = useCallback(
    ({ item }: { item: MediaLibraryItem }) => {
      const url = firstUrl(item);
      const conv = item.conversation;
      const preview = isPlaceholderText(item)
        ? ''
        : (item.message || '').replace(url || '', '').trim();
      const isSel = selectedIds.has(item.id);
      return (
        <View style={[styles.docCardWrap, isSel && styles.docCardSelected]}>
          <TouchableOpacity
            style={styles.docRow}
            activeOpacity={0.75}
            onPress={() =>
              selectionMode
                ? onToggleSelect(item)
                : url && Linking.openURL(url).catch(() => {})
            }
            onLongPress={() => onToggleSelect(item)}
            delayLongPress={240}
          >
            {selectionMode ? (
              <View style={[styles.selCircle, isSel && styles.selCircleOn]}>
                {isSel ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
              </View>
            ) : null}
            <View style={[styles.docIconBox, { backgroundColor: '#1F70C1' }]}>
              <Ionicons name="link" size={18} color="#FFFFFF" />
            </View>
            <View style={styles.docBody}>
              <Text style={styles.linkUrl} numberOfLines={1}>
                {url ? urlHost(url) : 'رابط'}
              </Text>
              {preview ? (
                <Text style={styles.docSub} numberOfLines={2}>
                  {preview}
                </Text>
              ) : url ? (
                <Text style={styles.docSub} numberOfLines={1}>
                  {url}
                </Text>
              ) : null}
            </View>
            <Ionicons name="open-outline" size={16} color="#94A3B8" />
          </TouchableOpacity>

          <View style={styles.metaRow}>
            <ChatAvatar
              conversation={{
                id: conv?.id ?? 0,
                contact_jid: conv?.contact_jid ?? '',
                contact_avatar: conv?.contact_avatar ?? null,
              }}
              title={convTitle(conv)}
              size={22}
            />
            <Text style={styles.metaConv} numberOfLines={1}>
              {convTitle(conv)}
              {conv?.is_group ? ' (مجموعة)' : ''}
            </Text>
            <SenderTag item={item} />
            <Text style={styles.metaTime}>{formatTime(item.timestamp)}</Text>
            {!selectionMode ? (
              <TouchableOpacity
                onPress={() => onOpenChat(item)}
                hitSlop={8}
                style={styles.metaJumpBtn}
              >
                <Ionicons name="chatbox-ellipses-outline" size={15} color={Colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      );
    },
    [onOpenChat, selectedIds, selectionMode, onToggleSelect]
  );

  if (!started || (loading && items.length === 0)) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.centerText}>جاري تحميل الروابط...</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyPane
        icon="link-outline"
        title="لا توجد روابط"
        sub="أي لينك اتشارك في أي محادثة — في نص أو مع صورة — هيظهر هنا"
      />
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(it) => String(it.id)}
      renderItem={renderItem}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      stickySectionHeadersEnabled
      onEndReached={loadMore}
      onEndReachedThreshold={0.4}
      initialNumToRender={20}
      windowSize={9}
      removeClippedSubviews
      contentContainerStyle={{ paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load('refresh')}
          colors={[Colors.primary]}
          tintColor={Colors.primary}
        />
      }
      ListFooterComponent={
        <PaneFooter loadingMore={loadingMore} hasMore={hasMore} count={items.length} />
      }
    />
  );
};

/* ------------------------------ screen ------------------------------ */

export const MediaLibraryScreen: React.FC<MediaLibraryScreenProps> = ({
  onBack,
  onOpenConversation,
}) => {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [tabIndex, setTabIndex] = useState(0);
  const [viewer, setViewer] = useState<{ items: GalleryMediaItem[]; index: number } | null>(null);

  // WhatsApp-style multi-select: long-press ticks the first item, taps add
  // or drop more — the header swaps to an action bar while anything is ticked.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [forwardVisible, setForwardVisible] = useState(false);
  // Snapshot taken when the forward icon is tapped — the modal can't call
  // getSelectedItems() inline because it would read a ref during render.
  const [forwardItems, setForwardItems] = useState<MediaLibraryItem[]>([]);
  const [actionBusy, setActionBusy] = useState(false);
  // Each pane pushes its loaded page here so the screen-level actions can
  // resolve selected ids back into full items (deduped — one message can
  // appear in more than one tab, e.g. a document whose caption has a link).
  const itemsByKind = useRef<Partial<Record<MediaLibraryKind, MediaLibraryItem[]>>>({});

  const selectionMode = selectedIds.size > 0;

  const toggleSelect = useCallback((m: MediaLibraryItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const onMediaItems = useCallback(
    (items: MediaLibraryItem[]) => {
      itemsByKind.current.media = items;
    },
    []
  );
  const onDocsItems = useCallback(
    (items: MediaLibraryItem[]) => {
      itemsByKind.current.docs = items;
    },
    []
  );
  const onLinksItems = useCallback(
    (items: MediaLibraryItem[]) => {
      itemsByKind.current.links = items;
    },
    []
  );

  const getSelectedItems = useCallback((): MediaLibraryItem[] => {
    const byId = new Map<number, MediaLibraryItem>();
    for (const list of Object.values(itemsByKind.current)) {
      for (const it of list || []) {
        if (!byId.has(it.id)) byId.set(it.id, it);
      }
    }
    return [...selectedIds]
      .map((id) => byId.get(id))
      .filter((x): x is MediaLibraryItem => Boolean(x));
  }, [selectedIds]);

  // Hardware back: clear the ticking first, leave screen exit to the host.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedIds.size > 0) {
        clearSelection();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [selectedIds.size, clearSelection]);

  const swipeStartX = useSharedValue(0);
  const swipeStartY = useSharedValue(0);

  const openChat = useCallback(
    (item: MediaLibraryItem) => {
      if (item.conversation) {
        onOpenConversation(item.conversation as Conversation, item.id);
      }
    },
    [onOpenConversation]
  );

  // From the fullscreen viewer — resolve the gallery id back to the library
  // row, close the modal and jump into that chat on the exact message.
  const openViewerItemChat = useCallback(
    (g: GalleryMediaItem) => {
      const all = Object.values(itemsByKind.current).flat() as MediaLibraryItem[];
      const m = all.find((x) => x.id === g.id);
      setViewer(null);
      if (m) openChat(m);
    },
    [openChat]
  );

  // Download every media-capable selected item into the device gallery —
  // the same cache-then-MediaLibrary path the in-chat viewer uses. Pure
  // link rows have no file, so they're skipped with a note in the summary.
  const handleDownloadSelected = useCallback(async () => {
    if (actionBusy) return;
    const items = getSelectedItems().filter(isFileItem);
    const skipped = selectedIds.size - items.length;
    if (items.length === 0) {
      Alert.alert('تحميل', 'العناصر المحددة روابط — مفيش ملفات تتحمل');
      return;
    }
    setActionBusy(true);
    let saved = 0;
    let failed = 0;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('تحميل', 'محتاجين إذن الوصول للمعرض عشان نحفظ الملفات');
        return;
      }
      for (const m of items) {
        const local = await fetchToCache(m, token);
        if (!local) {
          failed++;
          continue;
        }
        try {
          await MediaLibrary.saveToLibraryAsync(local);
          saved++;
        } catch {
          failed++;
        }
      }
      Alert.alert(
        'تحميل',
        `اتحفظ ${saved} ${saved === 1 ? 'عنصر' : 'عناصر'} في المعرض` +
          (failed ? `\nتعذر حفظ ${failed}` : '') +
          (skipped ? `\nاتخطى ${skipped} (روابط بدون ملف)` : '')
      );
      clearSelection();
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, getSelectedItems, selectedIds.size, token, clearSelection]);

  // External share — the system sheet. Files go out via expo-sharing (one
  // URI per sheet); link-only selections share their URLs as plain text.
  const handleShareSelected = useCallback(async () => {
    if (actionBusy) return;
    const items = getSelectedItems();
    if (items.length === 0) return;
    setActionBusy(true);
    try {
      const fileItems = items.filter(isFileItem);
      const linkItems = items.filter((m) => !isFileItem(m));

      const files: { uri: string; mime?: string }[] = [];
      for (const m of fileItems) {
        const local = await fetchToCache(m, token);
        if (local) files.push({ uri: local, mime: m.media_mime_type || undefined });
      }
      const linkUrls = linkItems.map(firstUrl).filter((u): u is string => Boolean(u));

      if (files.length === 0 && linkUrls.length === 0) {
        Alert.alert('مشاركة', 'تعذر تجهيز أي عنصر للمشاركة');
        return;
      }
      // expo-sharing hands one URI to the system sheet per call — multi-file
      // picks get sequential sheets; cancelling one stops the queue.
      for (const f of files) {
        try {
          await Sharing.shareAsync(f.uri, { mimeType: f.mime });
        } catch {
          break;
        }
      }
      // Links ride the OS text-share — always available, even for zero files.
      if (linkUrls.length > 0) {
        await Share.share({ message: linkUrls.join('\n') }).catch(() => {});
      }
      clearSelection();
    } catch {
      // User dismissed the sheet or a target app failed — nothing to report.
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, getSelectedItems, token, clearSelection]);

  // Gallery items mirror the grid order (newest first) — the viewer pages
  // the whole library, header shows "sender • chat" like the in-chat one.
  const openViewer = useCallback(
    (items: MediaLibraryItem[], index: number) => {
      const gallery: GalleryMediaItem[] = [];
      for (const m of items) {
        const uri = mediaSrc(m, token);
        if (!uri) continue;
        const a = attributionOf(m);
        gallery.push({
          id: m.id,
          uri,
          downloadUri: m.id > 0 && token ? Config.getMediaUrl(m.id, token, true) : uri,
          kind: m.message_type === 'video' ? 'video' : 'image',
          caption: m.media_caption || (!isPlaceholderText(m) ? m.message : null),
          senderName: `${a.label} • ${convTitle(m.conversation)}`,
          timestamp: m.timestamp,
        });
      }
      const target = items[index];
      const gi = gallery.findIndex((g) => g.id === target?.id);
      if (gallery.length === 0) return;
      setViewer({ items: gallery, index: gi >= 0 ? gi : 0 });
    },
    [token]
  );

  // Same manual-activation pan the chat list uses for scope tabs — vertical
  // scrolling always wins, a deliberate horizontal pull flips the tab.
  const stepTab = useCallback((dir: number) => {
    setTabIndex((i) => Math.max(0, Math.min(TABS.length - 1, i + dir)));
  }, []);

  const swipeGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      'worklet';
      const t = e.allTouches[0];
      if (t) {
        swipeStartX.value = t.absoluteX;
        swipeStartY.value = t.absoluteY;
      }
    })
    .onTouchesMove((e, state) => {
      'worklet';
      const t = e.allTouches[0];
      if (!t) return;
      const dx = t.absoluteX - swipeStartX.value;
      const dy = t.absoluteY - swipeStartY.value;
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx) * 1.1) {
        state.fail();
        return;
      }
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        state.activate();
      }
    })
    .onEnd((e) => {
      'worklet';
      if (e.translationX < -24) runOnJS(stepTab)(1);
      else if (e.translationX > 24) runOnJS(stepTab)(-1);
    });

  const activeTab = TABS[tabIndex].key;

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {selectionMode ? (
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
          <TouchableOpacity onPress={clearSelection} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="close" size={25} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>
              {selectedIds.size} {selectedIds.size === 1 ? 'محدد' : 'محددين'}
            </Text>
            <Text style={styles.headerSub}>اختر إجراء من الأيقونات</Text>
          </View>
          {actionBusy ? (
            <ActivityIndicator size="small" color="#FFFFFF" style={styles.headerAction} />
          ) : (
            <View style={styles.headerActions}>
              <TouchableOpacity
                onPress={() => {
                  setForwardItems(getSelectedItems());
                  setForwardVisible(true);
                }}
                style={styles.headerAction}
                hitSlop={8}
              >
                <Ionicons name="arrow-redo-outline" size={21} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDownloadSelected}
                style={styles.headerAction}
                hitSlop={8}
              >
                <Ionicons name="download-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShareSelected}
                style={styles.headerAction}
                hitSlop={8}
              >
                <Ionicons name="share-social-outline" size={21} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>مكتبة الوسائط</Text>
            <Text style={styles.headerSub}>كل الصور والملفات والروابط في مكان واحد</Text>
          </View>
          <MaterialCommunityIcons
            name="image-multiple-outline"
            size={22}
            color="rgba(255,255,255,0.85)"
            style={styles.headerIcon}
          />
        </View>
      )}

      <View style={styles.tabBar}>
        {TABS.map((t, i) => {
          const isActive = i === tabIndex;
          return (
            <TouchableOpacity
              key={t.key}
              style={styles.tabItem}
              onPress={() => setTabIndex(i)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={t.icon}
                size={15}
                color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.55)'}
              />
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{t.label}</Text>
              <View style={[styles.tabUnderline, isActive && styles.tabUnderlineActive]} />
            </TouchableOpacity>
          );
        })}
      </View>

      <GestureDetector gesture={swipeGesture}>
        <View style={styles.panesWrap}>
          <View style={activeTab === 'media' ? styles.pane : styles.paneHidden}>
            <MediaGridPane
              active={activeTab === 'media'}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onItems={onMediaItems}
              onOpenViewer={openViewer}
            />
          </View>
          <View style={activeTab === 'docs' ? styles.pane : styles.paneHidden}>
            <DocsPane
              active={activeTab === 'docs'}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onItems={onDocsItems}
              onOpenChat={openChat}
            />
          </View>
          <View style={activeTab === 'links' ? styles.pane : styles.paneHidden}>
            <LinksPane
              active={activeTab === 'links'}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onItems={onLinksItems}
              onOpenChat={openChat}
            />
          </View>
        </View>
      </GestureDetector>

      {viewer ? (
        <MediaViewerModal
          visible
          items={viewer.items}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
          onOpenItemContext={openViewerItemChat}
        />
      ) : null}

      <ForwardModal
        visible={forwardVisible}
        message={null}
        messages={forwardItems}
        onClose={() => {
          setForwardVisible(false);
          setForwardItems([]);
          clearSelection();
        }}
      />
    </View>
  );
};

/* ------------------------------ styles ------------------------------ */

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: Colors.headerBg,
    paddingBottom: 10,
    paddingHorizontal: 10,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  headerSub: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11.5,
    marginTop: 2,
  },
  headerIcon: {
    marginLeft: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row-reverse',
    backgroundColor: Colors.headerBg,
    paddingHorizontal: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  tabLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: {
    backgroundColor: '#25D366',
  },
  panesWrap: {
    flex: 1,
  },
  pane: {
    flex: 1,
  },
  // Hidden panes stay mounted — loaded pages and scroll offsets survive
  // tab switches instead of refetching every time.
  paneHidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'none',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 10,
  },
  centerText: {
    fontSize: 13,
    color: '#667781',
  },
  emptyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#111B21',
  },
  emptySub: {
    fontSize: 13,
    color: '#667781',
    textAlign: 'center',
    lineHeight: 20,
  },
  dayHeader: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: '#F0F2F5',
  },
  dayHeaderText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#54656F',
    textAlign: 'right',
  },
  gridRow: {
    flexDirection: 'row-reverse',
    paddingHorizontal: GRID_GAP,
    marginBottom: GRID_GAP,
    gap: GRID_GAP,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#DFE5E8',
  },
  cellPad: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  cellNoThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D6DBDF',
  },
  cellVideoPill: {
    position: 'absolute',
    top: 5,
    left: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 7,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  cellVideoText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
  cellRevokedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 7,
    padding: 3,
  },
  cellSenderStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    backgroundColor: 'rgba(0,0,0,0.46)',
  },
  cellSenderText: {
    flex: 1,
    color: '#E9EDEF',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'right',
  },
  cellSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 168, 132, 0.32)',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 4,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    padding: 5,
  },
  cellSelectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  selCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#B9C4CB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCircleOn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  docCardSelected: {
    borderColor: Colors.primary,
    borderWidth: 1.5,
    backgroundColor: '#F2FBF8',
  },
  docCardWrap: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 10,
    marginTop: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E9EDEF',
    overflow: 'hidden',
  },
  docRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 10,
  },
  docIconBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docIconExt: {
    color: '#FFFFFF',
    fontSize: 7,
    fontWeight: '800',
    marginTop: 1,
  },
  docBody: {
    flex: 1,
    gap: 2,
  },
  docName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  linkUrl: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1F70C1',
    textAlign: 'right',
  },
  docSub: {
    fontSize: 11.5,
    color: '#667781',
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F8FAFB',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEF1F3',
  },
  metaConv: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#111B21',
    textAlign: 'right',
  },
  senderTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 2.5,
    flexShrink: 1,
  },
  senderTagText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  metaTime: {
    fontSize: 10,
    color: '#8696A0',
    marginLeft: 'auto',
  },
  metaJumpBtn: {
    padding: 3,
  },
  paneFooter: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 6,
  },
  paneFooterText: {
    fontSize: 11.5,
    color: '#8696A0',
  },
  hintText: {
    fontSize: 10.5,
    color: '#A6AEB4',
  },
});
