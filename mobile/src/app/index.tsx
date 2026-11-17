import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  BackHandler,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { ChatListScreen } from '../screens/ChatListScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { StarredMessagesScreen } from '../screens/StarredMessagesScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { WavixaLogo } from '../components/WavixaLogo';
import { setupPush } from '../services/notifications';
import { Conversation } from '../types/crm';
import { Colors } from '../constants/theme';

type OverlayView = 'none' | 'welcome' | 'chat-room' | 'profile' | 'stats' | 'starred';

export default function IndexPage() {
  const { user, token, isLoading } = useAuth();
  const [overlayView, setOverlayView] = useState<OverlayView>('none');
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [focusMessageId, setFocusMessageId] = useState<number | string | null>(null);

  const [slideAnim] = useState(() => new Animated.Value(0));
  const screenWidth = Dimensions.get('window').width;

  const openOverlay = useCallback(
    (next: OverlayView, conv: Conversation | null = null) => {
      if (conv) setSelectedConversation(conv);
      setOverlayView(next);
      setOverlayMounted(false);
      slideAnim.setValue(1);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 175,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      // Mount the heavy screen a couple of frames later so the slide-in
      // starts on a free JS thread instead of competing with the mount.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setOverlayMounted(true));
      });
    },
    [slideAnim]
  );

  const closeOverlay = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 150,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setOverlayView('none');
        setOverlayMounted(false);
        setSelectedConversation(null);
        setFocusMessageId(null);
      }
    });
  }, [slideAnim]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (overlayView !== 'none') {
        closeOverlay();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [overlayView, closeOverlay]);

  useEffect(() => {
    if (token && user) {
      setupPush().catch(() => {});
    }
  }, [token, user]);

  const handleOpenConversation = useCallback(
    (conv: Conversation, focusId: number | string | null = null) => {
      setFocusMessageId(focusId);
      openOverlay('chat-room', conv);
    },
    [openOverlay]
  );

  const handleOpenStarred = useCallback(() => {
    openOverlay('starred');
  }, [openOverlay]);

  const handleOpenProfile = useCallback(() => {
    openOverlay('profile');
  }, [openOverlay]);

  const handleOpenStats = useCallback(() => {
    openOverlay('stats');
  }, [openOverlay]);

  if (isLoading) {
    return (
      <View style={styles.splashContainer}>
        <WavixaLogo size="large" lightText />
        <ActivityIndicator
          size="small"
          color="#FFFFFF"
          style={{ marginTop: 24 }}
        />
      </View>
    );
  }

  if (!token || !user) {
    return (
      <LoginScreen
        onLoginSuccess={() => {
          openOverlay('welcome');
        }}
      />
    );
  }

  if (overlayView === 'welcome') {
    return (
      <WelcomeScreen
        onContinue={() => {
          setOverlayView('none');
        }}
      />
    );
  }

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -screenWidth * 0.3],
  });

  return (
    <View style={styles.root}>
      <View
        style={styles.baseLayer}
        pointerEvents={overlayView === 'none' ? 'auto' : 'none'}
      >
        <ChatListScreen
          activeConversationId={
            overlayView === 'chat-room' ? selectedConversation?.id ?? null : null
          }
          onOpenConversation={handleOpenConversation}
          onOpenProfile={handleOpenProfile}
          onOpenStats={handleOpenStats}
          onOpenStarred={handleOpenStarred}
        />
      </View>

      {overlayView !== 'none' && (
        <Animated.View
          style={[
            styles.overlayLayer,
            { transform: [{ translateX }] },
          ]}
        >
          {overlayMounted &&
            (overlayView === 'chat-room' && selectedConversation ? (
              <ChatRoomScreen
                key={`room-${selectedConversation.id}`}
                conversation={selectedConversation}
                onBack={closeOverlay}
                focusMessageId={focusMessageId}
              />
            ) : overlayView === 'starred' ? (
              <StarredMessagesScreen
                onBack={closeOverlay}
                onOpenMessage={(conv, messageId) =>
                  handleOpenConversation(conv, messageId)
                }
              />
            ) : overlayView === 'profile' ? (
              <ProfileScreen onBack={closeOverlay} />
            ) : overlayView === 'stats' ? (
              <StatsScreen onBack={closeOverlay} />
            ) : null)}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  baseLayer: {
    flex: 1,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
  },
  splashContainer: {
    flex: 1,
    backgroundColor: Colors.headerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
