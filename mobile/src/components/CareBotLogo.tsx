import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

interface CareBotLogoProps {
  size?: 'small' | 'medium' | 'large';
  lightText?: boolean;
}

export const CareBotLogo: React.FC<CareBotLogoProps> = ({
  size = 'medium',
  lightText = true,
}) => {
  const isSmall = size === 'small';
  const isLarge = size === 'large';

  const iconSize = isSmall ? 32 : isLarge ? 76 : 42;
  const titleSize = isSmall ? 17 : isLarge ? 27 : 21;

  return (
    <View style={[styles.container, isLarge && styles.containerStacked]}>
      <Image
        source={require('../../assets/logo.png')}
        style={[
          styles.icon,
          { width: iconSize, height: iconSize, borderRadius: iconSize / 2 },
        ]}
      />

      <Text
        style={[
          styles.brandTitle,
          {
            fontSize: titleSize,
            lineHeight: titleSize + 5,
            color: lightText ? '#FFFFFF' : '#111B21',
          },
        ]}
      >
        CareBot
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    direction: 'ltr',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  containerStacked: {
    flexDirection: 'column',
    gap: 10,
  },
  icon: {
    resizeMode: 'contain',
  },
  brandTitle: {
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
