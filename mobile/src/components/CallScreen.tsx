import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { callService, CallState } from '../services/callService';
import { Colors } from '../constants/theme';

const fmt = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

/** Global call overlay — mounted once in the root layout; shows itself
 *  whenever callService.phase !== 'idle' (outgoing, ringing, active, or
 *  an incoming WhatsApp call pushed via the realtime channel). */
export const CallScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<CallState>(callService.state);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => callService.subscribe(setState), []);

  useEffect(() => {
    if (state.phase !== 'active' || !state.startedAt) return;
    const tick = setInterval(
      () => setElapsed(Math.floor((Date.now() - state.startedAt!) / 1000)),
      1000
    );
    return () => clearInterval(tick);
  }, [state.phase, state.startedAt]);

  const visible = state.phase !== 'idle';
  const incoming = state.phase === 'incoming';

  const statusText =
    state.error
      ? state.error
      : state.phase === 'dialing'
        ? 'جاري الاتصال...'
        : state.phase === 'ringing'
          ? 'يرن...'
          : state.phase === 'connecting'
            ? 'جاري التوصيل...'
            : state.phase === 'active'
              ? fmt(elapsed)
              : 'مكالمة واردة';

  const name = state.peerLabel || (state.peer ? `+${state.peer}` : 'مكالمة');
  const initial = (name.replace('+', '').trim() || 'م').slice(0, 1).toUpperCase();

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => {}}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 40) + 30 }]}>
        <Text style={styles.net}>مكالمة CareBot</Text>

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.status}>{statusText}</Text>

        <View style={styles.spacer} />

        {incoming ? (
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.endBtn]}
              onPress={() => callService.reject()}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="phone-hangup" size={30} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => callService.answer()}
              activeOpacity={0.85}
            >
              <Ionicons name="call" size={30} color="#FFF" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.smallBtn, state.muted && styles.smallBtnOn]}
              onPress={() => callService.toggleMute()}
              activeOpacity={0.8}
            >
              <Ionicons
                name={state.muted ? 'mic-off' : 'mic'}
                size={24}
                color={state.muted ? '#111B21' : '#FFF'}
              />
              <Text style={[styles.smallLabel, state.muted && styles.smallLabelOn]}>
                كتم
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.endBtn]}
              onPress={() => callService.hangup()}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="phone-hangup" size={30} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.smallBtn, state.speakerOn && styles.smallBtnOn]}
              onPress={() => callService.toggleSpeaker()}
              activeOpacity={0.8}
            >
              <Ionicons
                name="volume-high"
                size={24}
                color={state.speakerOn ? '#111B21' : '#FFF'}
              />
              <Text style={[styles.smallLabel, state.speakerOn && styles.smallLabelOn]}>
                سبيكر
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B141A',
    alignItems: 'center',
    paddingBottom: 60,
    paddingHorizontal: 24,
  },
  net: {
    fontSize: 13,
    color: '#8696A0',
    fontWeight: '600',
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  avatarText: {
    fontSize: 44,
    fontWeight: '800',
    color: '#FFF',
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 22,
  },
  status: {
    fontSize: 16,
    color: '#AEBAC1',
    marginTop: 10,
    writingDirection: 'ltr',
  },
  spacer: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    paddingHorizontal: 10,
  },
  actionBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  endBtn: {
    backgroundColor: '#EF4444',
  },
  acceptBtn: {
    backgroundColor: '#00A884',
  },
  smallBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#202C33',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtnOn: {
    backgroundColor: '#FFFFFF',
  },
  smallLabel: {
    fontSize: 9,
    color: '#AEBAC1',
    marginTop: 2,
    fontWeight: '600',
  },
  smallLabelOn: {
    color: '#111B21',
  },
});
