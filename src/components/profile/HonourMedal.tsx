import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight } from '../../theme';
import { HonourTier } from '../../data/honours';
import { tierRingColor } from './honourVisuals';

// A small tiered medallion: a coloured ring whose pigment encodes the honour's
// tier, dimmed to a low-contrast outline when locked. Pure/props-driven so every
// surface (results, profile strip, trophy case) shows the same badge.
interface HonourMedalProps {
  tier: HonourTier;
  earned: boolean;
  size?: number;
}

export const HonourMedal: React.FC<HonourMedalProps> = ({ tier, earned, size = 34 }) => {
  const ring = tierRingColor(tier);
  return (
    <View
      style={[
        styles.medal,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: earned ? ring : colors.slate,
          backgroundColor: earned ? withAlpha(ring) : 'transparent',
          opacity: earned ? 1 : 0.5,
        },
      ]}
    >
      <Text style={[styles.mark, { color: earned ? ring : colors.slate }]}>
        {earned ? '★' : '·'}
      </Text>
    </View>
  );
};

// A faint fill behind an earned medal — theme pigments carry no alpha token, so
// derive one here from the ring colour.
function withAlpha(hex: string): string {
  return `${hex}22`;
}

const styles = StyleSheet.create({
  medal: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    lineHeight: fontSize.lg,
  },
});

export default HonourMedal;
