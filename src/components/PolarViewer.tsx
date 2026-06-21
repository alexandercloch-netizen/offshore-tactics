import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { BoatPolar } from '../types';
import { interpolatePolar } from '../engine/polarTable';

interface PolarViewerProps {
  polar: BoatPolar;
  // Which wind speeds to draw curves for; defaults to a light/medium/fresh set.
  windSpeeds?: number[];
  size?: number;
}

const CURVE_COLORS = [colors.signalGreen, colors.brassLight, colors.warning, colors.signalRed];

// Radial polar plot: TWA sweeps 0° (up) → 180° (down) on the right half, radius
// = boat speed. One curve per selected wind speed.
export const PolarViewer: React.FC<PolarViewerProps> = ({ polar, windSpeeds, size = 240 }) => {
  const speeds = windSpeeds ?? pickWindSpeeds(polar.tws);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 18;

  // Scale radius to the fastest speed across the drawn curves.
  let maxSpeed = 1;
  for (const tws of speeds) {
    for (let twa = 0; twa <= 180; twa += 10) {
      maxSpeed = Math.max(maxSpeed, interpolatePolar(polar, twa, tws));
    }
  }

  const point = (twa: number, speed: number) => {
    const rr = (speed / maxSpeed) * r;
    const ang = ((twa - 90) * Math.PI) / 180; // 0° TWA points up
    return { x: cx + rr * Math.cos(ang), y: cy + rr * Math.sin(ang) };
  };

  const curve = (tws: number): string => {
    let d = '';
    for (let twa = 0; twa <= 180; twa += 5) {
      const p = point(twa, interpolatePolar(polar, twa, tws));
      d += `${twa === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
    }
    return d.trim();
  };

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {rings.map((f) => (
          <Circle key={f} cx={cx} cy={cy} r={r * f} stroke={colors.hull} strokeWidth={1} fill="none" />
        ))}
        <Line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={colors.hull} strokeWidth={1} />
        <Line x1={cx} y1={cy} x2={cx + r} y2={cy} stroke={colors.hull} strokeWidth={1} />
        <SvgText x={cx} y={cy - r - 6} fill={colors.slate} fontSize="9" textAnchor="middle">0°</SvgText>
        <SvgText x={cx + r + 2} y={cy + 3} fill={colors.slate} fontSize="9">90°</SvgText>
        <SvgText x={cx} y={cy + r + 12} fill={colors.slate} fontSize="9" textAnchor="middle">180°</SvgText>

        {speeds.map((tws, i) => (
          <Path key={tws} d={curve(tws)} stroke={CURVE_COLORS[i % CURVE_COLORS.length]} strokeWidth={2} fill="none" />
        ))}

        {speeds.map((tws, i) => (
          <SvgText key={`lbl-${tws}`} x={12} y={16 + i * 13} fill={CURVE_COLORS[i % CURVE_COLORS.length]} fontSize="10">
            {tws} kn
          </SvgText>
        ))}
        <SvgText x={size - 8} y={size - 8} fill={colors.slate} fontSize="9" textAnchor="end">
          max {maxSpeed.toFixed(1)} kn
        </SvgText>
      </Svg>
    </View>
  );
};

// Up to four representative wind speeds from the table's columns.
function pickWindSpeeds(tws: number[]): number[] {
  if (tws.length <= 4) return tws;
  const idx = [0, Math.floor(tws.length / 3), Math.floor((2 * tws.length) / 3), tws.length - 1];
  return [...new Set(idx)].map((i) => tws[i]);
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hull,
  },
});

export default PolarViewer;
