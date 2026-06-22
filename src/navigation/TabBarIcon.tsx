import React from 'react';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';
import { MainTabParamList } from '../types';
import { colors } from '../theme';

interface Props {
  route: keyof MainTabParamList;
  focused: boolean;
  size?: number;
}

// Minimal inline glyphs so we don't pull in an icon font. One per tab, tinted
// brass when active and slate when not.
export const TabBarIcon: React.FC<Props> = ({ route, focused, size = 24 }) => {
  const color = focused ? colors.brassLight : colors.slate;
  const s = size;

  switch (route) {
    case 'Race': // a sail
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Polygon points="12,3 12,18 4,18" fill={color} />
          <Path d="M13 3 C18 8 19 13 18 18 L13 18 Z" fill={color} opacity={0.55} />
          <Rect x={3} y={19} width={18} height={2} rx={1} fill={color} />
        </Svg>
      );
    case 'Fleet': // a hull
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Path d="M3 13 H21 L18 19 H6 Z" fill={color} />
          <Rect x={11} y={3} width={2} height={9} rx={1} fill={color} />
          <Path d="M13 4 L19 11 H13 Z" fill={color} opacity={0.55} />
        </Svg>
      );
    case 'Leaderboard': // podium bars
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Rect x={3} y={12} width={5} height={9} rx={1} fill={color} opacity={0.6} />
          <Rect x={9.5} y={7} width={5} height={14} rx={1} fill={color} />
          <Rect x={16} y={14} width={5} height={7} rx={1} fill={color} opacity={0.6} />
        </Svg>
      );
    case 'Profile': // a sailor
    default:
      return (
        <Svg width={s} height={s} viewBox="0 0 24 24">
          <Circle cx={12} cy={8} r={4} fill={color} />
          <Path d="M4 21 C4 16 8 14 12 14 C16 14 20 16 20 21 Z" fill={color} />
        </Svg>
      );
  }
};

export default TabBarIcon;
