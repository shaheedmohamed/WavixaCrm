import React, { useRef } from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { ChatList, FilterScope } from '../types/crm';
import { FAVORITES_LIST_NAME } from '../services/chatPrefs';

interface FilterBarProps {
  selectedScope: FilterScope;
  onSelectScope: (scope: FilterScope) => void;
  unreadCount?: number;
  favoritesCount?: number;
  chatLists?: ChatList[];
  isAgent?: boolean;
  hideGroups?: boolean;
  onPressCreateList?: () => void;
  onLongPressCustomList?: (list: ChatList) => void;
}

export interface FilterItem {
  id: FilterScope;
  label: string;
  icon?: string;
  badge?: number;
  customList?: ChatList;
}

export interface BuildFilterItemsOptions {
  unreadCount?: number;
  favoritesCount?: number;
  chatLists?: ChatList[];
  isAgent?: boolean;
  hideGroups?: boolean;
}

// Single source of truth for the chip order — the list screen reuses it to
// resolve "next/previous tab" for horizontal swipe navigation.
export const buildFilterItems = ({
  unreadCount = 0,
  favoritesCount = 0,
  chatLists = [],
  isAgent = false,
  hideGroups = false,
}: BuildFilterItemsOptions): FilterItem[] => {
  const customLists = chatLists.filter((l) => l.name !== FAVORITES_LIST_NAME);
  return [
    { id: 'chats', label: 'الشاتات', icon: 'chat-outline' },
    { id: 'unread', label: 'غير مقروءة', badge: unreadCount > 0 ? unreadCount : undefined },
    {
      id: 'favorites',
      label: 'المفضلة',
      icon: 'heart-outline',
      badge: favoritesCount > 0 ? favoritesCount : undefined,
    },
    ...(hideGroups
      ? []
      : [{ id: 'groups' as FilterScope, label: 'المجموعات', icon: 'account-group-outline' }]),
    { id: 'mine', label: 'محادثاتي', icon: 'account-outline' },
    { id: 'unassigned', label: 'جديد / متاح', icon: 'account-plus-outline' },
    { id: 'waiting', label: 'بانتظار رد', icon: 'timer-sand' },
    { id: 'snoozed', label: 'مؤجلة', icon: 'sleep' },
    ...customLists.map((l) => ({
      id: `list:${l.id}` as FilterScope,
      label: l.name,
      icon: 'format-list-bulleted',
      badge: l.conversation_ids?.length ? l.conversation_ids.length : undefined,
      customList: l,
    })),
    ...(isAgent
      ? []
      : [
          { id: 'resolved' as FilterScope, label: 'المكتملة', icon: 'check-circle-outline' },
          { id: 'archived' as FilterScope, label: 'المؤرشفة', icon: 'archive-outline' },
        ]),
  ];
};

export const FilterBar: React.FC<FilterBarProps> = React.memo(function FilterBar({
  selectedScope,
  onSelectScope,
  unreadCount = 0,
  favoritesCount = 0,
  chatLists = [],
  isAgent = false,
  hideGroups = false,
  onPressCreateList,
  onLongPressCustomList,
}) {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const userScrolledRef = useRef(false);

  const baseFilters = buildFilterItems({
    unreadCount,
    favoritesCount,
    chatLists,
    isAgent,
    hideGroups,
  });

  return (
    <View style={styles.wrapper}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={() => {
          // row-reverse pins the first chip (الشاتات) to the content's
          // right edge, but offset 0 shows the left edge (المؤرشفة). Keep
          // the visual start anchored until the user scrolls manually.
          if (!userScrolledRef.current) {
            requestAnimationFrame(() =>
              scrollRef.current?.scrollToEnd({ animated: false })
            );
          }
        }}
        onScrollBeginDrag={() => {
          userScrolledRef.current = true;
        }}
      >
        {baseFilters.map((item) => {
          const isActive = selectedScope === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onSelectScope(item.id)}
              onLongPress={
                item.customList && onLongPressCustomList
                  ? () => onLongPressCustomList(item.customList!)
                  : undefined
              }
              delayLongPress={300}
              activeOpacity={0.75}
            >
              {item.icon && (
                item.customList?.color ? (
                  <View
                    style={[
                      styles.listColorDot,
                      { backgroundColor: item.customList.color },
                    ]}
                  />
                ) : (
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={14}
                    color={isActive ? '#FFFFFF' : '#667781'}
                  />
                )
              )}

              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {item.label}
              </Text>

              {item.badge !== undefined && item.badge > 0 && (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                    {item.badge}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}

        {onPressCreateList && (
          <TouchableOpacity
            style={styles.addListChip}
            onPress={onPressCreateList}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={16} color={Colors.primaryDark} />
            <Text style={styles.addListText}>قائمة</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  listColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E9EDEF',
    paddingVertical: 7,
  },
  scrollContent: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 11,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
    gap: 5,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#54656F',
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  badge: {
    backgroundColor: '#00A884',
    borderRadius: 9,
    paddingHorizontal: 5,
    height: 17,
    minWidth: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeActive: {
    backgroundColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  badgeTextActive: {
    color: Colors.primaryDark,
  },
  addListChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 31,
    borderRadius: 16,
    backgroundColor: '#E8F8F5',
    borderWidth: 1,
    borderColor: '#B6E3D4',
    gap: 3,
  },
  addListText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
});
