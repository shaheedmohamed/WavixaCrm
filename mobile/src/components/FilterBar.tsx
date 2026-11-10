import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';
import { FilterScope } from '../types/crm';

interface FilterBarProps {
  selectedScope: FilterScope;
  onSelectScope: (scope: FilterScope) => void;
  unreadCount?: number;
  onOpenAdvancedFilter?: () => void;
  hasActiveAdvancedFilter?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  selectedScope,
  onSelectScope,
  unreadCount = 0,
  onOpenAdvancedFilter,
  hasActiveAdvancedFilter = false,
}) => {
  const filters: { id: FilterScope; label: string; icon?: string; badge?: number }[] = [
    { id: 'all', label: 'الكل', icon: 'chat-processing-outline' },
    { id: 'unread', label: 'غير مقروءة', badge: unreadCount > 0 ? unreadCount : undefined },
    { id: 'mine', label: 'محادثاتي', icon: 'account-outline' },
    { id: 'unassigned', label: 'جديد / متاح', icon: 'account-plus-outline' },
    { id: 'groups', label: 'المجموعات', icon: 'account-group-outline' },
    { id: 'resolved', label: 'المكتملة', icon: 'check-circle-outline' },
    { id: 'archived', label: 'المؤرشفة', icon: 'archive-outline' },
  ];

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Advanced Filter Button */}
        {onOpenAdvancedFilter && (
          <TouchableOpacity
            style={[
              styles.filterIconButton,
              hasActiveAdvancedFilter && styles.filterIconButtonActive,
            ]}
            onPress={onOpenAdvancedFilter}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name="tune-variant"
              size={17}
              color={hasActiveAdvancedFilter ? '#FFFFFF' : '#54656F'}
            />
          </TouchableOpacity>
        )}

        {/* Chips */}
        {filters.map((item) => {
          const isActive = selectedScope === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onSelectScope(item.id)}
              activeOpacity={0.7}
            >
              {item.badge !== undefined && item.badge > 0 && (
                <View style={[styles.badge, isActive && styles.badgeActive]}>
                  <Text style={[styles.badgeText, isActive && styles.badgeTextActive]}>
                    {item.badge}
                  </Text>
                </View>
              )}

              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                {item.label}
              </Text>

              {item.icon && (
                <MaterialCommunityIcons
                  name={item.icon as any}
                  size={14}
                  color={isActive ? '#FFFFFF' : '#667781'}
                  style={styles.chipIcon}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F5',
    paddingVertical: 7,
  },
  scrollContent: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 7,
  },
  filterIconButton: {
    width: 34,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F0F2F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconButtonActive: {
    backgroundColor: Colors.primary,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
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
  chipIcon: {
    marginRight: -2,
  },
  badge: {
    backgroundColor: '#007BFC',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 18,
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
    color: Colors.primary,
  },
});
