import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { colors, fontSize, fontWeight, spacing } from '../theme';
import { WeatherCondition } from '../types';

interface WindIndicatorProps {
  weather: WeatherCondition;
  size?: number;
}

export const WindIndicator: React.FC<WindIndicatorProps> = ({
  weather,
  size = 120,
}) => {
  const center = size / 2;
  const radius = center - 10;
  // Arrow points in the direction the wind blows TO (opposite of "from").
  const angle = ((weather.windDirection + 180) % 360) * (Math.PI / 180);
  const tipX = center + Math.sin(angle) * (radius - 8);
  const tipY = center - Math.cos(angle) * (radius - 8);
  const tailX = center - Math.sin(angle) * (radius - 22);
  const tailY = center + Math.cos(angle) * (radius - 22);

  // Build a small arrowhead polygon at the tip.
  const headLen = 14;
  const headWidth = 9;
  const baseX = center + Math.sin(angle) * (radius - 8 - headLen);
  const baseY = center - Math.cos(angle) * (radius - 8 - headLen);
  const perpX = Math.cos(angle) * headWidth;
  const perpY = Math.sin(angle) * headWidth;
  const arrowPoints = `${tipX},${tipY} ${baseX - perpX},${baseY - perpY} ${
    baseX + perpX
  },${baseY + perpY}`;

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.steel}
          strokeWidth={2}
          fill={colors.abyss}
        />
        {/* Cardinal ticks */}
        {[0, 90, 180, 270].map((deg) => {
          const a = deg * (Math.PI / 180);
          const x1 = center + Math.sin(a) * (radius - 4);
          const y1 = center - Math.cos(a) * (radius - 4);
          const x2 = center + Math.sin(a) * (radius - 12);
          const y2 = center - Math.cos(a) * (radius - 12);
          return (
            <Line
              key={deg}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={colors.slate}
              strokeWidth={2}
            />
          );
        })}
        <SvgText
          x={center}
          y={16}
          fill={colors.mist}
          fontSize="10"
          textAnchor="middle"
        >
          N
        </SvgText>
        <G>
          <Line
            x1={tailX}
            y1={tailY}
            x2={baseX}
            y2={baseY}
            stroke={colors.brassLight}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Polygon points={arrowPoints} fill={colors.brassLight} />
        </G>
      </Svg>
      <View style={styles.readout}>
        <Text style={styles.label}>{weather.label}</Text>
        <Text style={styles.speed}>{weather.windSpeedKts} kts</Text>
        <Text style={styles.strength}>{weather.windStrength}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  readout: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  label: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  speed: {
    color: colors.brassLight,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  strength: {
    color: colors.mist,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default WindIndicator;
