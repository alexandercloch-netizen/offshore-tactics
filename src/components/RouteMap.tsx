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
import { GeoPoint, Waypoint } from '../types';
import type { WindArrow } from '../engine/wind';
import { LandPolygon } from '../data/landmasses';

interface RouteMapProps {
  waypoints: Waypoint[]; // fixed marks (also set the projection bounds)
  route?: GeoPoint[]; // remaining weather-routed path
  trail?: GeoPoint[]; // track sailed so far
  boat?: GeoPoint; // current boat position
  competitors?: GeoPoint[]; // AI fleet positions
  wind?: WindArrow[]; // sampled wind field, drawn as arrows
  nextMarkIndex?: number; // for shading rounded marks
  land?: LandPolygon[];
  width?: number;
  height?: number;
}

// Colour a wind arrow by strength, from light slate through to gale red.
function windColor(speedKn: number): string {
  if (speedKn <= 8) return colors.slate;
  if (speedKn <= 14) return colors.signalGreen;
  if (speedKn <= 20) return colors.brassLight;
  if (speedKn <= 28) return colors.warning;
  return colors.signalRed;
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
  route,
  trail,
  boat,
  competitors,
  wind,
  nextMarkIndex = 0,
  land,
  width = 320,
  height = 200,
}) => {
  if (!waypoints || waypoints.length < 2) {
    return <View style={[styles.container, { width, height }]} />;
  }

  const project = buildProjector(waypoints, width, height);
  const markPoints = waypoints.map((w) => project(w.lat, w.lon));
  const routePts = (route ?? []).map((p) => project(p.lat, p.lon));
  const trailPts = (trail ?? []).map((p) => project(p.lat, p.lon));
  const boatXY = boat ? project(boat.lat, boat.lon) : null;
  const competitorXY = (competitors ?? []).map((c) => project(c.lat, c.lon));

  // Wind arrows: each is centred on its grid point, points the way the wind
  // blows TO, with length and colour scaled by strength.
  const windArrows = (wind ?? []).map((w) => {
    const p = project(w.lat, w.lon);
    const toDeg = w.fromDeg + 180;
    const a = (toDeg * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const len = 9 + Math.max(0, Math.min((w.speedKn - 4) / 26, 1)) * 13;
    const tip = { x: p.x + dx * len * 0.5, y: p.y + dy * len * 0.5 };
    const tail = { x: p.x - dx * len * 0.5, y: p.y - dy * len * 0.5 };
    // Arrowhead: two short barbs swept back from the tip.
    const hl = 5;
    const left = (toDeg + 150) * (Math.PI / 180);
    const right = (toDeg - 150) * (Math.PI / 180);
    return {
      key: `${w.lat.toFixed(3)},${w.lon.toFixed(3)}`,
      tail,
      tip,
      barbL: { x: tip.x + Math.sin(left) * hl, y: tip.y - Math.cos(left) * hl },
      barbR: { x: tip.x + Math.sin(right) * hl, y: tip.y - Math.cos(right) * hl },
      color: windColor(w.speedKn),
    };
  });

  return (
    <View style={styles.container}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="land" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.landHigh} />
            <Stop offset="1" stopColor={colors.land} />
          </LinearGradient>
          <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="1" stopColor={colors.abyss} />
          </LinearGradient>
          <ClipPath id="frame">
            <Rect x={0} y={0} width={width} height={height} />
          </ClipPath>
        </Defs>

        <Rect x={0} y={0} width={width} height={height} fill="url(#sea)" rx={radius.sm} />

        <G clipPath="url(#frame)">
          {(land ?? []).map((polygon, i) => (
            <Path
              key={`land-${i}`}
              d={landPath(polygon, project)}
              fill="url(#land)"
              stroke={colors.coastline}
              strokeWidth={0.8}
              fillRule="evenodd"
            />
          ))}

          {/* Live wind field: direction & strength across the course. */}
          {windArrows.map((w) => (
            <Path
              key={`wind-${w.key}`}
              d={`M ${w.tail.x.toFixed(1)} ${w.tail.y.toFixed(1)} L ${w.tip.x.toFixed(1)} ${w.tip.y.toFixed(1)} M ${w.barbL.x.toFixed(1)} ${w.barbL.y.toFixed(1)} L ${w.tip.x.toFixed(1)} ${w.tip.y.toFixed(1)} L ${w.barbR.x.toFixed(1)} ${w.barbR.y.toFixed(1)}`}
              stroke={w.color}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.7}
            />
          ))}

          {/* Planned weather-routed path still to sail (dashed). */}
          {routePts.length > 1 ? (
            <Path d={pathFrom(routePts)} stroke={colors.mist} strokeWidth={2} strokeDasharray="4 5" fill="none" opacity={0.85} />
          ) : null}

          {/* Track actually sailed, including the tacks (solid). */}
          {trailPts.length > 1 ? (
            <Path d={pathFrom(trailPts)} stroke={colors.brassLight} strokeWidth={3} fill="none" />
          ) : null}
        </G>

        {waypoints.map((wp, i) => {
          const p = markPoints[i];
          const isStart = wp.type === 'start';
          const isFinish = wp.type === 'finish';
          const passed = i > 0 && i < nextMarkIndex;
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
                <SvgText x={p.x} y={p.y - 9} fill={colors.mist} fontSize="9" textAnchor="middle">
                  {isStart ? 'START' : 'FINISH'}
                </SvgText>
              ) : null}
            </React.Fragment>
          );
        })}

        {competitorXY.map((c, i) => (
          <Circle
            key={`ai-${i}`}
            cx={c.x}
            cy={c.y}
            r={4}
            fill={colors.foam}
            stroke={colors.steel}
            strokeWidth={1}
            opacity={0.9}
          />
        ))}

        {boatXY ? (
          <Circle cx={boatXY.x} cy={boatXY.y} r={5} fill={colors.white} stroke={colors.signalGreen} strokeWidth={3} />
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
