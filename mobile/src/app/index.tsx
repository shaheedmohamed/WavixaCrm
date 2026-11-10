import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, BackHandler } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { ChatListScreen } from '../screens/ChatListScreen';
import { ChatRoomScreen } from '../screens/ChatRoomScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { StatsScreen } from '../screens/StatsScreen';
import { WavixaLogo } from '../components/WavixaLogo';
import { setupPush } from '../services/notifications';
import { Conversation } from '../types/crm';
import { Colors } from '../constants/theme';

type ActiveView = 'welcome' | 'chat-list' | 'chat-room' | 'profile' | 'stats';

export default function IndexPage() {
  const { user, token, isLoading } = useAuth();
  const [activeView, setActiveView] = useState<ActiveView>('chat-list');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);

  // Android hardware back: walk back through the view stack instead of
  // quitting the app. Only the chat list lets the OS exit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (
        activeView === 'chat-room' ||
        activeView === 'profile' ||
        activeView === 'stats'
      ) {
        setSelectedConversation(null);
        setActiveView('chat-list');
        return true;
      }
      if (activeView === 'welcome') {
        setActiveView('chat-list');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [activeView]);

  // Register push-token channel once the session is established.
  useEffect(() => {
    if (token && user) {
      setupPush().catch(() => {});
    }
  }, [token, user?.id]);

  // Initial loading splash
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

  // Not logged in -> Show Login Screen
  if (!token || !user) {
    return (
      <LoginScreen
        onLoginSuccess={() => {
          setActiveView('welcome');
        }}
      />
    );
  }

  // Post-login Welcome Screen
  if (activeView === 'welcome') {
    return (
      <WelcomeScreen
        onContinue={() => {
          setActiveView('chat-list');
        }}
      />
    );
  }

  // Chat Room Screen (active conversation)
  if (activeView === 'chat-room' && selectedConversation) {
    return (
      <ChatRoomScreen
        conversation={selectedConversation}
        onBack={() => {
          setSelectedConversation(null);
          setActiveView('chat-list');
        }}
      />
    );
  }

  // Profile Screen
  if (activeView === 'profile') {
    return (
      <ProfileScreen
        onBack={() => {
          setActiveView('chat-list');
        }}
      />
    );
  }

  // Stats Screen
  if (activeView === 'stats') {
    return (
      <StatsScreen
        onBack={() => {
          setActiveView('chat-list');
        }}
      />
    );
  }

  // Main Chat List Screen
  return (
    <ChatListScreen
      onOpenConversation={(conv) => {
        setSelectedConversation(conv);
        setActiveView('chat-room');
      }}
      onOpenProfile={() => {
        setActiveView('profile');
      }}
      onOpenStats={() => {
        setActiveView('stats');
      }}
    />
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: Colors.headerBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
