import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { colors, radius, spacing } from '../theme';
import { Waypoint } from '../types';
import { LandPolygon } from '../data/landmasses';
import { pointAtFraction } from '../engine/geo';

interface RouteMapProps {
  waypoints: Waypoint[];
  fraction: number; // 0..1 distance covered along the course
  land?: LandPolygon[]; // chart land masses ([lon, lat] rings)
  width?: number;
  height?: number;
}

interface XY {
  x: number;
  y: number;
}

// Equirectangular projection with longitude scaled by cos(mean latitude),
// then fit to the viewport with padding.
function buildProjector(waypoints: Waypoint[], width: number, height: number) {
  const lats = waypoints.map((w) => w.lat);
  const lons = waypoints.map((w) => w.lon);
  const meanLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((meanLat * Math.PI) / 180) || 1;

  const rawX = (lon: number) => lon * k;
  const rawY = (lat: number) => -lat;

  const xs = lons.map(rawX);
  const ys = lats.map(rawY);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const pad = 26;
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return (lat: number, lon: number): XY => ({
    x: offsetX + (rawX(lon) - minX) * scale,
    y: offsetY + (rawY(lat) - minY) * scale,
  });
}

function pathFrom(points: XY[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

// Build an even-odd fill path for one land polygon (outer ring + lake holes).
function landPath(polygon: LandPolygon, project: (lat: number, lon: number) => XY): string {
  return polygon
    .map((ring) => pathFrom(ring.map(([lon, lat]) => project(lat, lon))) + ' Z')
    .join(' ');
}

export const RouteMap: React.FC<RouteMapProps> = ({
  waypoints,
  fraction,
  land,
  width = 320,
  height = 200,
}) => {
  if (!waypoints || waypoints.length < 2) {
    return <View style={[styles.container, { width, height }]} />;
  }

  const project = buildProjector(waypoints, width, height);
  const points = waypoints.map((w) => project(w.lat, w.lon));
  const fullPath = pathFrom(points);

  const clamped = Math.max(0, Math.min(1, fraction));
  const boatTrack = pointAtFraction(waypoints, clamped);
  const boat = project(boatTrack.lat, boatTrack.lon);

  // Sailed path: waypoints up to the boat's current segment, then the boat.
  const sailedPoints = points.slice(0, boatTrack.segmentIndex + 1).concat(boat);
  const sailedPath = pathFrom(sailedPoints);

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="1" stopColor={colors.abyss} />
          </LinearGradient>
          <LinearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.landHigh} />
            <Stop offset="1" stopColor={colors.land} />
          </LinearGradient>
          <ClipPath id="frame">
            <Rect x={0} y={0} width={width} height={height} />
          </ClipPath>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill="url(#sea)" rx={radius.sm} />

        {land && land.length > 0 ? (
          <G clipPath="url(#frame)">
            {land.map((polygon, i) => (
              <Path
                key={`land-${i}`}
                d={landPath(polygon, project)}
                fill="url(#land)"
                stroke={colors.coastline}
                strokeWidth={0.8}
                fillRule="evenodd"
              />
            ))}
          </G>
        ) : null}

        <Path d={fullPath} stroke={colors.slate} strokeWidth={2.5} strokeDasharray="5 5" fill="none" />
        <Path d={sailedPath} stroke={colors.brassLight} strokeWidth={3.5} fill="none" />

        {waypoints.map((wp, i) => {
          const p = points[i];
          const isStart = wp.type === 'start';
          const isFinish = wp.type === 'finish';
          const passed = i <= boatTrack.segmentIndex;
          const r = isStart || isFinish ? 6 : wp.type === 'island' ? 5 : 4;
          const fill = isFinish
            ? colors.signalRed
            : isStart
              ? colors.signalGreen
              : passed
                ? colors.brassLight
                : colors.hull;
          return (
            <React.Fragment key={`${wp.name}-${i}`}>
              <Circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={fill}
                stroke={colors.foam}
                strokeWidth={isStart || isFinish ? 1.5 : 1}
              />
              {isStart || isFinish ? (
                <SvgText
                  x={p.x}
                  y={p.y - 9}
                  fill={colors.mist}
                  fontSize="9"
                  textAnchor="middle"
                >
                  {isStart ? 'START' : 'FINISH'}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}

        <Circle
          cx={boat.x}
          cy={boat.y}
          r={5}
          fill={colors.white}
          stroke={colors.signalGreen}
          strokeWidth={3}
        />
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
