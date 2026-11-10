import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

interface WavixaLogoProps {
  size?: 'small' | 'medium' | 'large';
  showSubtitle?: boolean;
  lightText?: boolean;
}

export const WavixaLogo: React.FC<WavixaLogoProps> = ({
  size = 'medium',
  showSubtitle = true,
  lightText = true,
}) => {
  const isSmall = size === 'small';
  const isLarge = size === 'large';

  const iconSize = isSmall ? 28 : isLarge ? 48 : 34;
  const titleSize = isSmall ? 17 : isLarge ? 26 : 20;
  const subSize = isSmall ? 9 : isLarge ? 12 : 10;

  return (
    <View style={styles.container}>
      {/* Icon */}
      <Image
        source={require('../../assets/w-logo.png')}
        style={{ width: iconSize, height: iconSize, resizeMode: 'contain' }}
      />

      <View style={styles.textWrap}>
        <Text
          style={[
            styles.brandTitle,
            { fontSize: titleSize, color: lightText ? '#FFFFFF' : '#111B21' },
          ]}
        >
          Wavixa
        </Text>
        {showSubtitle && (
          <Text
            style={[
              styles.brandSub,
              { fontSize: subSize, color: lightText ? 'rgba(255,255,255,0.85)' : '#667781' },
            ]}
          >
            CRM
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  textWrap: {
    justifyContent: 'center',
  },
  brandTitle: {
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 22,
  },
  brandSub: {
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: -2,
  },
});
