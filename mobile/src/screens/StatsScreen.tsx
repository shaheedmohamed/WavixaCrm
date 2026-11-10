import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { chatService } from '../services/chatService';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../constants/theme';

interface StatsScreenProps {
  onBack: () => void;
}

export const StatsScreen: React.FC<StatsScreenProps> = ({ onBack }) => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [totalChats, setTotalChats] = useState(0);
  const [unreadChats, setUnreadChats] = useState(0);
  const [resolvedChats, setResolvedChats] = useState(0);

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [allRes, unreadRes, resolvedRes] = await Promise.all([
          chatService.getConversations({ per_page: 1 }),
          chatService.getConversations({ unread_only: true, per_page: 1 }),
          chatService.getConversations({ scope: 'resolved', per_page: 1 }),
        ]);

        if (allRes.success) setTotalChats(allRes.pagination?.total || 0);
        if (unreadRes.success) setUnreadChats(unreadRes.pagination?.total || 0);
        if (resolvedRes.success) setResolvedChats(resolvedRes.pagination?.total || 0);
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCounts();
  }, []);

  return (
    <View style={styles.safeArea}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top + 6, 16) }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إحصائيات المحادثات والعمل</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 20, 24) }}>
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>جاري حساب الإحصائيات...</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {/* Active chats */}
            <View style={styles.statCard}>
              <View style={[styles.iconWrap, { backgroundColor: '#E8F8F5' }]}>
                <MaterialCommunityIcons name="chat-processing" size={24} color={Colors.primary} />
              </View>
              <Text style={styles.statNumber}>{user?.active_chats || 0}</Text>
              <Text style={styles.statLabel}>المحادثات المفتوحة معك</Text>
              {user?.max_active_chats ? (
                <Text style={styles.statSub}>من أصل {user.max_active_chats} كحد أقصى</Text>
              ) : null}
            </View>

            {/* Total Chats */}
            <View style={styles.statCard}>
              <View style={[styles.iconWrap, { backgroundColor: '#EFF6FF' }]}>
                <Ionicons name="chatbubbles" size={24} color="#3B82F6" />
              </View>
              <Text style={styles.statNumber}>{totalChats}</Text>
              <Text style={styles.statLabel}>إجمالي محادثات النظام</Text>
              <Text style={styles.statSub}>ضمن الأجهزة المخصصة لك</Text>
            </View>

            {/* Unread Chats */}
            <View style={styles.statCard}>
              <View style={[styles.iconWrap, { backgroundColor: '#FEF3C7' }]}>
                <MaterialCommunityIcons name="email-alert" size={24} color="#D97706" />
              </View>
              <Text style={styles.statNumber}>{unreadChats}</Text>
              <Text style={styles.statLabel}>محادثات بها رسائل جديدة</Text>
              <Text style={styles.statSub}>بانتظار الرد على العملاء</Text>
            </View>

            {/* Resolved Chats */}
            <View style={styles.statCard}>
              <View style={[styles.iconWrap, { backgroundColor: '#ECFDF5' }]}>
                <MaterialCommunityIcons name="check-decagram" size={24} color="#10B981" />
              </View>
              <Text style={styles.statNumber}>{resolvedChats}</Text>
              <Text style={styles.statLabel}>المحادثات المكتملة</Text>
              <Text style={styles.statSub}>تم توثيقها بنجاح</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.headerBg,
  },
  header: {
    backgroundColor: Colors.headerBg,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    flex: 1,
    backgroundColor: '#F8FAFB',
    padding: 16,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  loadingText: {
    fontSize: 12.5,
    color: '#8696A0',
  },
  grid: {
    gap: 12,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111B21',
  },
  statLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#54656F',
    marginTop: 2,
  },
  statSub: {
    fontSize: 11,
    color: '#8696A0',
    marginTop: 3,
  },
});
