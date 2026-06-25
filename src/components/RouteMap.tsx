import React, { useMemo } from 'react';
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
import { CourseBounds, isLoopCourse } from '../engine/geo';
import { tideHeatColor, windHeatColor } from './windScale';
import WindParticles from './WindParticles';
import { FlowCell, FlowLayer } from './flowField';
import { LandPolygon } from '../data/landmasses';

// The dense colour-field grid for the active layer (wind speed or tide rate),
// row-major and full (no cells dropped) so the heatmap and the flow animation can
// both index it. The screens build it for whichever layer is showing.
export interface FlowField {
  cells: FlowCell[];
  cols: number;
  rows: number;
}

interface RouteMapProps {
  waypoints: Waypoint[]; // fixed marks (also set the projection bounds)
  route?: GeoPoint[]; // remaining weather-routed path
  altRoute?: GeoPoint[]; // an alternative route to contrast (e.g. the faster line)
  laylines?: GeoPoint[][]; // layline segments to the next mark (each a 2-point polyline)
  trail?: GeoPoint[]; // track sailed so far
  boat?: GeoPoint; // current boat position
  competitors?: GeoPoint[]; // AI fleet positions
  field?: FlowField; // dense field for the active layer: colour heatmap + flow animation
  layer?: FlowLayer; // 'wind' (speed ramp) or 'tide' (rate ramp); default 'wind'
  animate?: boolean; // run the particle flow (default true); off for the static debrief
  windFeature?: { lat: number; lon: number; radiusNm: number; puff: boolean }; // puff/hole to shade
  nextMarkIndex?: number; // for shading rounded marks
  land?: LandPolygon[];
  width?: number;
  height?: number;
}

interface XY {
  x: number;
  y: number;
}

const CHART_PAD = 26;

// Shared parameters of the equirectangular projection (longitude scaled by
// cos(mean latitude)), fit to the viewport with padding and letterboxed on the
// looser axis. Derived once so the projector and its inverse can't drift apart.
function projectionParams(waypoints: { lat: number; lon: number }[], width: number, height: number) {
  const lats = waypoints.map((w) => w.lat);
  const lons = waypoints.map((w) => w.lon);
  const meanLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((meanLat * Math.PI) / 180) || 1;

  const xs = lons.map((lon) => lon * k);
  const ys = lats.map((lat) => -lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const scale = Math.min((width - CHART_PAD * 2) / spanX, (height - CHART_PAD * 2) / spanY);
  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;
  return { k, minX, minY, scale, offsetX, offsetY };
}

function buildProjector(waypoints: Waypoint[], width: number, height: number) {
  const { k, minX, minY, scale, offsetX, offsetY } = projectionParams(waypoints, width, height);
  return (lat: number, lon: number): XY => ({
    x: offsetX + (lon * k - minX) * scale,
    y: offsetY + (-lat - minY) * scale,
  });
}

// Geographic bounds of the *whole* chart viewport (0..width, 0..height), found
// by inverting the projection at the corners. Sampling the weather/tide grids to
// these bounds fills the entire map — the course bounding box leaves the padding
// and letterbox margins bare.
export function chartViewportBounds(
  waypoints: Waypoint[],
  width: number,
  height: number
): CourseBounds {
  const { k, minX, minY, scale, offsetX, offsetY } = projectionParams(waypoints, width, height);
  const lonAt = (x: number) => (minX + (x - offsetX) / scale) / k;
  const latAt = (y: number) => -(minY + (y - offsetY) / scale);
  return {
    minLon: lonAt(0),
    maxLon: lonAt(width),
    minLat: latAt(height), // y grows downward, so the bottom edge is the south
    maxLat: latAt(0),
  };
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
  altRoute,
  laylines,
  trail,
  boat,
  competitors,
  field,
  layer = 'wind',
  animate = true,
  windFeature,
  nextMarkIndex = 0,
  land,
  width = 320,
  height = 200,
}) => {
  const ready = !!waypoints && waypoints.length >= 2;

  // The projection is fixed for the course — recompute only on resize, not on
  // every race tick.
  const project = useMemo(
    () => (ready ? buildProjector(waypoints, width, height) : null),
    [ready, waypoints, width, height]
  );

  // A loop course (e.g. Round the Island) starts and finishes at the same buoy,
  // so draw one combined marker rather than stacking the START and FINISH labels.
  const loopCourse = useMemo(() => (ready ? isLoopCourse(waypoints) : false), [ready, waypoints]);

  // --- Static layers --------------------------------------------------------
  // These change at most once per hour-bucket (the grids) or on resize, NOT every
  // ~150ms tick. Memoising the rendered SVG keeps react-native-svg from
  // reconciling hundreds of nodes (the heatmap especially) several times a second
  // while the boat creeps forward.
  // The smooth, full-bleed colour field — the sea itself, coloured by the active
  // layer (wind speed or tide rate). A dense grid of solid, slightly overlapping
  // cells reads as a continuous gradient with no dark chart showing through, the
  // PredictWind look. Memoised: it changes only on scrub/hour/layer/resize, never
  // per tick.
  const fieldLayer = useMemo(() => {
    if (!project || !field || field.cols <= 1 || field.rows <= 1) return null;
    const colour = layer === 'tide' ? tideHeatColor : windHeatColor;
    const cw = (width / (field.cols - 1)) * 1.06;
    const ch = (height / (field.rows - 1)) * 1.06;
    return field.cells.map((h, i) => {
      const p = project(h.lat, h.lon);
      return (
        <Rect
          key={`f-${i}`}
          x={p.x - cw / 2}
          y={p.y - ch / 2}
          width={cw}
          height={ch}
          fill={colour(h.speedKn)}
        />
      );
    });
  }, [project, field, layer, width, height]);

  const landLayer = useMemo(() => {
    if (!project || !land) return null;
    return land.map((polygon, i) => (
      <Path
        key={`land-${i}`}
        d={landPath(polygon, project)}
        fill="url(#land)"
        stroke={colors.coastline}
        strokeWidth={0.8}
        fillRule="evenodd"
      />
    ));
  }, [project, land]);

  // Marks change only when one is rounded (nextMarkIndex), not every tick.
  const marksLayer = useMemo(() => {
    if (!project) return null;
    return waypoints.map((wp, i) => {
      const p = project(wp.lat, wp.lon);
      const isStart = wp.type === 'start';
      const isFinish = wp.type === 'finish';
      if (isFinish && loopCourse) return null;
      const passed = i > 0 && i < nextMarkIndex;
      const r = isStart || isFinish ? 6 : wp.type === 'island' ? 5 : 4;
      const fill = isFinish
        ? colors.signalRed
        : isStart
          ? colors.signalGreen
          : passed
            ? colors.brassLight
            : colors.hull;
      // Endpoints get their role; the real place-named marks in between (the
      // Needles, St Catherine's…) get a quiet label, like the coastal names on a
      // PredictWind chart. A dark halo keeps text legible over the bright field.
      const endpointLabel = isStart ? (loopCourse ? 'START / FINISH' : 'START') : 'FINISH';
      const label = isStart || isFinish ? endpointLabel : wp.name;
      const showLabel = isStart || isFinish || wp.type === 'island' || wp.type === 'mark';
      return (
        <React.Fragment key={`${wp.name}-${i}`}>
          <Circle cx={p.x} cy={p.y} r={r} fill={fill} stroke={colors.foam} strokeWidth={isStart || isFinish ? 1.5 : 1} />
          {showLabel ? (
            <SvgText
              x={p.x}
              y={p.y - 9}
              fill={colors.white}
              stroke={colors.abyss}
              strokeWidth={0.6}
              fontSize={isStart || isFinish ? 9 : 8}
              fontWeight="600"
              textAnchor="middle"
            >
              {label}
            </SvgText>
          ) : null}
        </React.Fragment>
      );
    });
  }, [project, waypoints, nextMarkIndex, loopCourse]);

  if (!ready || !project) {
    return <View style={[styles.container, { width, height }]} />;
  }

  // --- Dynamic layers (recomputed each tick — all cheap: a few path strings and
  // up to ~60 dots) ---------------------------------------------------------
  const routePts = (route ?? []).map((p) => project(p.lat, p.lon));
  const altRoutePts = (altRoute ?? []).map((p) => project(p.lat, p.lon));
  const laylinePaths = (laylines ?? []).map((seg) => seg.map((p) => project(p.lat, p.lon)));
  const trailPts = (trail ?? []).map((p) => project(p.lat, p.lon));
  const boatXY = boat ? project(boat.lat, boat.lon) : null;
  const competitorXY = (competitors ?? []).map((c) => project(c.lat, c.lon));

  // The drifting puff/hole (refreshed each tick — just a couple of circles).
  const feature = windFeature
    ? (() => {
        const c = project(windFeature.lat, windFeature.lon);
        const edge = project(windFeature.lat + windFeature.radiusNm / 60, windFeature.lon);
        return { c, rPx: Math.max(8, Math.hypot(edge.x - c.x, edge.y - c.y)), puff: windFeature.puff };
      })()
    : null;

  // Enough particles to read as a field, scaled to the drawable area and capped so
  // even a big web chart stays light (one Path per fade tier, so this is cheap).
  const particleCount = Math.max(70, Math.min(220, Math.round((width * height) / 2600)));
  const flowColor = layer === 'tide' ? colors.tideFlow : colors.foam;

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

        {/* Deep-sea base, only visible before the field paints (or where absent). */}
        <Rect x={0} y={0} width={width} height={height} fill={field ? colors.deepSea : 'url(#sea)'} rx={radius.sm} />

        <G clipPath="url(#frame)">
          {fieldLayer}
          {landLayer}

          {/* The live flow: particles drifting with the wind (or the tide). */}
          {animate && field ? (
            <WindParticles
              cells={field.cells}
              cols={field.cols}
              rows={field.rows}
              project={project}
              layer={layer}
              color={flowColor}
              count={particleCount}
              width={width}
              height={height}
            />
          ) : null}

          {/* Drifting pressure system (wind layer only): a puff or a hole. */}
          {feature && layer === 'wind' ? (
            <>
              <Circle cx={feature.c.x} cy={feature.c.y} r={feature.rPx} fill={feature.puff ? colors.signalGreen : colors.steel} opacity={0.12} />
              <Circle
                cx={feature.c.x}
                cy={feature.c.y}
                r={feature.rPx}
                stroke={feature.puff ? colors.signalGreen : colors.foam}
                strokeWidth={1}
                strokeDasharray="3 4"
                fill="none"
                opacity={0.7}
              />
              <SvgText x={feature.c.x} y={feature.c.y + 3} fill={colors.white} fontSize="9" textAnchor="middle">
                {feature.puff ? 'MORE BREEZE' : 'LIGHT PATCH'}
              </SvgText>
            </>
          ) : null}

          {/* Laylines to the next mark (the close-hauled / running approach lines). */}
          {laylinePaths.map((seg, i) =>
            seg.length > 1 ? (
              <Path key={`layline-${i}`} d={pathFrom(seg)} stroke={colors.foam} strokeWidth={1} strokeDasharray="2 4" fill="none" opacity={0.5} />
            ) : null
          )}

          {/* The faster alternative line, for contrast (drawn under the plan). */}
          {altRoutePts.length > 1 ? (
            <Path d={pathFrom(altRoutePts)} stroke={colors.signalGreen} strokeWidth={2.5} strokeDasharray="2 6" fill="none" opacity={0.9} />
          ) : null}

          {/* Planned weather-routed path still to sail — a dark casing under a
              bright dash keeps it legible over the bright colour field. */}
          {routePts.length > 1 ? (
            <>
              <Path d={pathFrom(routePts)} stroke={colors.abyss} strokeWidth={4} fill="none" opacity={0.45} />
              <Path d={pathFrom(routePts)} stroke={colors.white} strokeWidth={2} strokeDasharray="4 5" fill="none" opacity={0.95} />
            </>
          ) : null}

          {/* Track actually sailed, including the tacks (solid, dark-cased). */}
          {trailPts.length > 1 ? (
            <>
              <Path d={pathFrom(trailPts)} stroke={colors.abyss} strokeWidth={5} fill="none" opacity={0.45} />
              <Path d={pathFrom(trailPts)} stroke={colors.brassLight} strokeWidth={3} fill="none" />
            </>
          ) : null}
        </G>

        {marksLayer}

        {competitorXY.map((c, i) => (
          <Circle key={`ai-${i}`} cx={c.x} cy={c.y} r={4} fill={colors.foam} stroke={colors.steel} strokeWidth={1} opacity={0.9} />
        ))}

        {boatXY ? <Circle cx={boatXY.x} cy={boatXY.y} r={5} fill={colors.white} stroke={colors.signalGreen} strokeWidth={3} /> : null}
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
