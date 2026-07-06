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

// Numeric typography for instruments: tabular lining figures so a live value
// never reflows as its digits change. Spread into any Text style that shows a
// racing number.
export const numeric: Pick<TextStyle, 'fontVariant'> = {
  fontVariant: ['tabular-nums'],
};

// Semantic status aliases — the meaning, not the pigment. All reuse existing
// palette values; no new colours. `labelOnPanel` is the micro-label tint on
// card/panel surfaces, lifted from `slate` (≈3.2:1 on card) to `mist` so
// uppercase 11pt labels clear 4.5:1. The teal `good` is reserved for a good
// STATE (on pace, covered, high confidence); a navigator's water/weather READ
// is `info` cyan — keeping the two cool hues from meaning the same thing when
// they sit side by side. `selected` is the chosen-control accent the shared
// Segmented/SelectableCard announce with.
export const status = {
  good: colors.signalGreen,
  warn: colors.warning,
  bad: colors.signalRed,
  info: colors.tide,
  labelOnPanel: colors.mist,
  selected: colors.brassLight,
};

// Surface materials: which existing colour plays which structural role, so
// panels/cards/hairlines stay consistent across the cockpit.
export const surface = {
  screen: colors.abyss,
  panel: colors.navy,
  card: colors.card,
  raised: colors.hull,
  hairline: colors.hull,
  accentBorder: colors.cardBorder,
};

export const theme = {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  numeric,
  status,
  surface,
};

export default theme;
