import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { chatService } from '../services/chatService';
import { realtime } from '../services/realtime';
import { resolveUrl } from '../services/media';
import { StatusGroup, StatusItem } from '../types/crm';
import { StatusViewer } from '../components/StatusViewer';
import { Colors } from '../constants/theme';

interface StatusesScreenProps {
  onBack: () => void;
}

const fmtTime = (iso?: string | null): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const sameDay =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'م' : 'ص';
    h = h % 12 || 12;
    const t = `${h}:${m} ${ap}`;
    if (sameDay) return `اليوم ${t}`;
    const yesterday = new Date(now.getTime() - 86400000);
    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return `أمس ${t}`;
    }
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  } catch {
    return '';
  }
};

const initials = (name?: string | null): string => {
  const n = (name || '').trim();
  if (!n) return '?';
  return n.replace(/^\+/, '').slice(0, 2);
};

// WhatsApp ring — segmented circle around the avatar, one arc per story.
const StatusRing: React.FC<{
  uri: string | null;
  name: string;
  count: number;
  seen: boolean;
  size?: number;
}> = ({ uri, name, count, seen, size = 56 }) => {
  const color = seen ? '#C4CCD1' : Colors.primary;
  const segments = Math.max(count, 1);
  // Draw a single bordered circle for 1 item, or fake segments with the
  // dashed look RN can't do natively — overlay small gaps is overkill; a
  // solid ring with a count badge reads the same at this size.
  return (
    <View
      style={[
        styles.ring,
        {
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          borderColor: color,
        },
      ]}
    >
      <View style={[styles.ringAvatar, { width: size, height: size, borderRadius: size / 2 }]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: size, height: size }} />
        ) : (
          <Text style={styles.ringInitials}>{initials(name)}</Text>
        )}
      </View>
      {segments > 1 && (
        <View style={styles.countPill}>
          <Text style={styles.countPillText}>{segments}</Text>
        </View>
      )}
    </View>
  );
};

type Row =
  | { kind: 'mine'; items: StatusItem[] }
  | { kind: 'group'; group: StatusGroup; seen: boolean };

export const StatusesScreen: React.FC<StatusesScreenProps> = ({ onBack }) => {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mine, setMine] = useState<StatusItem[]>([]);
  const [mineHasMore, setMineHasMore] = useState(false);
  const [recent, setRecent] = useState<StatusGroup[]>([]);
  const [viewed, setViewed] = useState<StatusGroup[]>([]);
  const [viewerGroup, setViewerGroup] = useState<StatusGroup | null>(null);
  const [viewerMine, setViewerMine] = useState(false);
  const [openingPhone, setOpeningPhone] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchStatuses = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await chatService.getStatuses();
      if (res?.success) {
        setMine(res.mine || []);
        setMineHasMore(!!res.mine_has_more);
        setRecent(res.recent || []);
        setViewed(res.viewed || []);
        setError('');
      }
    } catch {
      setError('تعذر تحميل الحالات');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => fetchStatuses());
  }, [fetchStatuses]);

  // New/deleted/media statuses land on the CRM channel — refresh silently so
  // a fresh story pops in without pulling the list.
  useEffect(() => {
    const off = realtime.on((ev) => {
      if (ev.type === 'status.new' || ev.type === 'status.deleted' || ev.type === 'status.media') {
        fetchStatuses(true);
      }
    });
    return off;
  }, [fetchStatuses]);

  // A finished ring moves Recent → Viewed without a refetch.
  const handleItemViewed = useCallback(
    (_id: number) => {
      const moveIfDone = (g: StatusGroup) =>
        g.items.every((i) => i.viewed_at || i.deleted_at);
      setRecent((prev) => {
        const done = prev.filter(moveIfDone);
        if (done.length > 0) {
          setViewed((v) => [...done, ...v]);
          return prev.filter((g) => !moveIfDone(g));
        }
        return prev;
      });
    },
    []
  );

  // Archived rings ship items: [] — pull the full story list on open;
  // truncated live rings (has_more) complete the same way.
  const openGroup = useCallback(async (g: StatusGroup) => {
    if (g.items.length >= g.count) {
      setViewerMine(false);
      setViewerGroup(g);
      return;
    }
    if (openingPhone) return;
    setOpeningPhone(g.poster_phone);
    try {
      const res = await chatService.getStatusItems({ poster_phone: g.poster_phone });
      setViewerMine(false);
      setViewerGroup({ ...g, items: res?.items ?? [] });
    } catch {
      setViewerMine(false);
      setViewerGroup(g);
    } finally {
      setOpeningPhone(null);
    }
  }, [openingPhone]);

  const openMine = useCallback(async () => {
    if (mine.length === 0) return;
    let items = mine;
    if (mineHasMore) {
      try {
        const res = await chatService.getStatusItems({ mine: true });
        if (res?.items?.length) items = res.items;
      } catch {}
    }
    setViewerMine(true);
    setViewerGroup({
      poster_phone: '',
      poster_name: 'حالتي',
      poster_avatar: items[0]?.poster_avatar || null,
      count: items.length,
      latest_at: items[0]?.posted_at || null,
      items,
    });
  }, [mine, mineHasMore]);

  const sections = useMemo(() => {
    const out: { title: string; data: Row[] }[] = [];
    if (mine.length > 0) {
      out.push({ title: 'حالتي', data: [{ kind: 'mine', items: mine }] });
    }
    if (recent.length > 0) {
      out.push({
        title: 'الحالات الحديثة',
        data: recent.map((g) => ({ kind: 'group' as const, group: g, seen: false })),
      });
    }
    if (viewed.length > 0) {
      out.push({
        title: 'تمت مشاهدتها',
        data: viewed.map((g) => ({ kind: 'group' as const, group: g, seen: true })),
      });
    }
    return out;
  }, [mine, recent, viewed]);

  const renderRow = useCallback(
    ({ item }: { item: Row }) => {
      if (item.kind === 'mine') {
        const latest = item.items[0];
        return (
          <TouchableOpacity style={styles.row} onPress={openMine} activeOpacity={0.7}>
            <StatusRing
              uri={resolveUrl(latest?.poster_avatar)}
              name="حالتي"
              count={item.items.length}
              seen={item.items.every((i) => i.viewed_at || i.deleted_at)}
            />
            <View style={styles.rowText}>
              <Text style={styles.rowName}>حالتي</Text>
              <Text style={styles.rowSub}>{fmtTime(latest?.posted_at)}</Text>
            </View>
          </TouchableOpacity>
        );
      }
      const g = item.group;
      const name = g.poster_name || `+${g.poster_phone}`;
      const opening = openingPhone === g.poster_phone;
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => openGroup(g)}
          activeOpacity={0.7}
          disabled={opening}
        >
          <StatusRing
            uri={resolveUrl(g.poster_avatar)}
            name={name}
            count={g.count}
            seen={item.seen}
          />
          <View style={styles.rowText}>
            <View style={styles.nameRow}>
              <Text style={styles.rowName} numberOfLines={1}>
                {name}
              </Text>
              {g.has_deleted ? (
                <View style={styles.deletedBadge}>
                  <Text style={styles.deletedBadgeText}>فيها محذوفة</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.rowSub}>
              {opening ? 'جاري التحميل…' : fmtTime(g.latest_at)}
            </Text>
          </View>
        </TouchableOpacity>
      );
    },
    [openGroup, openMine, openingPhone]
  );

  const empty = !loading && sections.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="chevron-forward" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الحالة</Text>
        <TouchableOpacity onPress={() => fetchStatuses(true)} hitSlop={12} style={styles.headerBtn}>
          <Ionicons name="refresh" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : empty ? (
        <View style={styles.center}>
          <MaterialCommunityIcons
            name="circle-outline"
            size={64}
            color="#C4CCD1"
          />
          <Text style={styles.emptyTitle}>لا توجد حالات حالياً</Text>
          <Text style={styles.emptySub}>
            {error || 'حالات جهات الاتصال خلال آخر ٢٤ ساعة ستظهر هنا'}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item, i) =>
            item.kind === 'mine' ? 'mine' : `g-${item.group.poster_phone}-${i}`
          }
          renderItem={renderRow}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchStatuses(true);
              }}
              colors={[Colors.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <StatusViewer
        visible={!!viewerGroup}
        group={viewerGroup}
        token={token}
        onClose={() => {
          setViewerGroup(null);
          if (viewerMine) setViewerMine(false);
        }}
        onItemViewed={handleItemViewed}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.headerBg,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  headerBtn: {
    padding: 6,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111B21',
    marginTop: 16,
  },
  emptySub: {
    fontSize: 13.5,
    color: '#8696A0',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  listContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
    fontSize: 13.5,
    fontWeight: '700',
    color: '#8696A0',
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 12,
  },
  rowText: {
    flex: 1,
    alignItems: 'flex-end',
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111B21',
  },
  rowSub: {
    fontSize: 13,
    color: '#8696A0',
    marginTop: 2,
  },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  deletedBadge: {
    backgroundColor: 'rgba(229,57,53,0.12)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  deletedBadgeText: {
    color: '#e53935',
    fontSize: 10,
    fontWeight: '800',
  },
  ring: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAvatar: {
    backgroundColor: '#DFE5E7',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ringInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: '#54656F',
  },
  countPill: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7ECEF',
  },
  countPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#111B21',
  },
});
