import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import { colors, radius, spacing } from '../theme';

interface RouteMapProps {
  totalLegs: number;
  currentLeg: number; // legs completed
  width?: number;
  height?: number;
}

// Generates evenly spaced waypoints along a gentle S-curve so the course
// reads like a chart rather than a straight line.
function buildWaypoints(
  totalLegs: number,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const marginX = 28;
  const usableW = width - marginX * 2;
  const midY = height / 2;
  const amplitude = height / 2 - 24;
  const count = totalLegs; // marks (start is implicit at index 0)
  for (let i = 0; i <= count; i += 1) {
    const t = count === 0 ? 0 : i / count;
    const x = marginX + usableW * t;
    const y = midY - Math.sin(t * Math.PI * 1.5) * amplitude * 0.6;
    points.push({ x, y });
  }
  return points;
}

function toPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

export const RouteMap: React.FC<RouteMapProps> = ({
  totalLegs,
  currentLeg,
  width = 320,
  height = 160,
}) => {
  const points = buildWaypoints(totalLegs, width, height);
  const fullPath = toPath(points);
  const sailedPath = toPath(points.slice(0, currentLeg + 1));
  const boat = points[Math.min(currentLeg, points.length - 1)];

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="1" stopColor={colors.abyss} />
          </LinearGradient>
        </Defs>
        {/* Full planned course */}
        <Path
          d={fullPath}
          stroke={colors.slate}
          strokeWidth={3}
          strokeDasharray="6 6"
          fill="none"
        />
        {/* Distance sailed so far */}
        <Path
          d={sailedPath}
          stroke={colors.brassLight}
          strokeWidth={4}
          fill="none"
        />
        {/* Waypoint markers */}
        {points.map((p, i) => {
          const passed = i <= currentLeg;
          const isStart = i === 0;
          const isFinish = i === points.length - 1;
          return (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={isStart || isFinish ? 7 : 5}
              fill={
                isFinish
                  ? colors.signalRed
                  : passed
                    ? colors.brassLight
                    : colors.hull
              }
              stroke={colors.foam}
              strokeWidth={isStart || isFinish ? 2 : 1}
            />
          );
        })}
        {/* Boat marker */}
        {boat ? (
          <Circle
            cx={boat.x}
            cy={boat.y}
            r={6}
            fill={colors.signalGreen}
            stroke={colors.white}
            strokeWidth={2}
          />
        ) : null}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hull,
    alignItems: 'center',
  },
});

export default RouteMap;
