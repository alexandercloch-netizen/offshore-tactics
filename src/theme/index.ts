import { TextStyle } from 'react-native';

// Nautical dark palette
export const colors = {
  abyss: '#06121F',
  deepSea: '#0A1B2E',
  navy: '#10273F',
  hull: '#16344F',
  steel: '#27496D',
  foam: '#DDE7EE',
  mist: '#9FB3C8',
  slate: '#5E7891',
  brass: '#C9A227',
  brassLight: '#E6C44D',
  signalRed: '#D7263D',
  signalGreen: '#2EC4B6',
  warning: '#F4A259',
  tide: '#49B6FF',
  tideFlow: '#CFEFFF', // pale cyan streaks for the tidal-flow animation
  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(3, 10, 18, 0.85)',
  card: '#0E2236',
  cardBorder: 'rgba(201, 162, 39, 0.30)',
  // Chart land masses
  land: '#2C3A2E',
  landHigh: '#3A4B39',
  coastline: '#6E8062',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
};

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
};

export const fontWeight: Record<'regular' | 'medium' | 'bold', TextStyle['fontWeight']> = {
  regular: '400',
  medium: '600',
  bold: '700',
};

export const theme = {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
};

export default theme;
