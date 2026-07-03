import React from 'react';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { colors } from '../theme';

// A few small inline SVG glyphs for nav-critical UI, so the meaning doesn't
// depend on a platform's emoji font (which varies, and renders inconsistently on
// web). Sized in line with the surrounding text.

export const CompassIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 14,
  color = colors.brassLight,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.6} fill="none" />
    {/* The compass needle: a north (filled) and south lozenge. */}
    <Polygon points="12,5 14.4,12 12,12" fill={color} />
    <Polygon points="12,19 9.6,12 12,12" fill={color} opacity={0.55} />
  </Svg>
);

export const WarningIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 14,
  color = colors.warning,
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 3 L22 20 L2 20 Z"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <Path d="M12 9 L12 14" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    <Circle cx={12} cy={17} r={1} fill={color} />
  </Svg>
);
