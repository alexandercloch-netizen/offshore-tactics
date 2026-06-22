import React from 'react';
import Svg, { Polyline } from 'react-native-svg';
import { colors } from '../theme';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
}

// A minimal trend line for a short series (e.g. wind speed over the last leg).
// Auto-scales to its own min/max; renders nothing for fewer than two points.
export const Sparkline: React.FC<SparklineProps> = ({
  values,
  width = 120,
  height = 26,
  color = colors.brassLight,
}) => {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (values.length - 1);
  const points = values
    .map((v, i) => {
      const x = pad + i * stepX;
      // Invert y so higher values sit toward the top.
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
};

export default Sparkline;
