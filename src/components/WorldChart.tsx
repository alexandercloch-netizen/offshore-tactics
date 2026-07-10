import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { WindSample } from '../types';
import { LandPolygon } from '../data/landmasses';
import { GeoBounds } from '../data/worldmap';
import { windHeatColor } from './windScale';
import { FlowCell } from './flowField';
import { WindParticles } from './WindParticles';
import { useReducedMotion } from '../lib/useReducedMotion';

// The Harbour's chart: a lightweight, display-only map of a fixed geographic
// box (the whole world, or one sailing region) with tappable pins on top. It
// deliberately shares RouteMap's projection maths and land-path pattern but
// none of its course/route machinery — this is a dashboard, not a nav chart.
//
// Pins are plain RN Pressables absolutely positioned over the SVG (not SVG
// onPress), so hit targets, accessibility and the node-jest render tests all
// work through the ordinary component tree.

export interface WorldPin {
  id: string;
  lat: number;
  lon: number;
  color: string; // usually windHeatColor(speedKn) — the current wind band
  label?: string;
  sublabel?: string; // a quiet second line (a wind readout, a course count)
  locked?: boolean; // render dimmed; still tappable (the caller explains)
  fromDeg?: number; // the station's true wind direction → a small chart arrow
}

interface WorldChartProps {
  bounds: GeoBounds;
  land: LandPolygon[];
  pins: WorldPin[];
  onPinPress?: (id: string) => void;
  // Paint the current breeze over the water (the conditions hero): a wash of
  // the wind-band colour plus a from-direction arrow.
  windWash?: WindSample;
  // The wind field over these waters: a heat wash per row plus the particle
  // swarm. On a region box it is the blended course samples or the live
  // per-region lattice; on the world chart it is the 10° world lattice, where
  // every rendered cell IS a real sample (live ECMWF or the baked monthly
  // ERA5 climatology) — real data superseded the old wash-free ruling at
  // world scale.
  flow?: { cells: FlowCell[]; cols: number; rows: number };
  // Motion means live: a seasonal wash passes false and paints WITHOUT the
  // swarm — the ocean only moves when the data is real-now.
  flowMotion?: boolean;
  // The luminance-inverted wash: 0.60 on the hero/region charts, 0.55 on the
  // world strip (its land-to-sea ratio needs the whisper of restraint).
  washOpacity?: number;
  // The on-chart source line ("ECMWF · as of 14:05" / "Seasonal pattern ·
  // ERA5 · July" / "Seasonal · indicative") — every chart that paints weather
  // carries one.
  provenance?: string;
  width: number;
  height: number;
  // Caption block width. The world view packs seven stations onto a short
  // strip and needs the compact 84; region views carry long course names and
  // keep the roomy default.
  captionWidth?: number;
  testID?: string;
}

interface XY {
  x: number;
  y: number;
}

// No margin outside the baked box: the bake clips continents at the box edge,
// and any drawable past it renders that clip as a dead-straight coastline
// floating in invented water (the Tasman hero showed Australia as a cut block
// in open sea). A real chart's land runs under the frame — the box maps
// EXACTLY onto the drawable, so a clip edge always lands ON the frame, never
// inside it.
const PAD = 0;

// Fit the bounds box into the requested stage (same equirectangular maths as
// components/projection.ts) and CLAMP the drawable to the box, so the chart
// never shows bare "sea" beyond the baked coastline — the world map's frame is
// the world, not a letterbox around it.
export function worldProjection(
  bounds: GeoBounds,
  width: number,
  height: number
): { width: number; height: number; project: (lat: number, lon: number) => XY } {
  const meanLat = (bounds.minLat + bounds.maxLat) / 2;
  const k = Math.cos((meanLat * Math.PI) / 180) || 1;
  const spanX = (bounds.maxLon - bounds.minLon) * k || 1;
  const spanY = bounds.maxLat - bounds.minLat || 1;
  const scale = Math.min((width - PAD * 2) / spanX, (height - PAD * 2) / spanY);
  const w = Math.min(width, spanX * scale + PAD * 2);
  const h = Math.min(height, spanY * scale + PAD * 2);
  return {
    width: w,
    height: h,
    project: (lat: number, lon: number): XY => ({
      x: PAD + (lon - bounds.minLon) * k * scale,
      y: PAD + (bounds.maxLat - lat) * scale,
    }),
  };
}

function pathFrom(points: XY[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

// Even-odd fill path for one land polygon (outer ring + lake holes) — the same
// encoding RouteMap draws.
function landPath(polygon: LandPolygon, project: (lat: number, lon: number) => XY): string {
  return polygon
    .map((ring) => pathFrom(ring.map(([lon, lat]) => project(lat, lon))) + ' Z')
    .join(' ');
}

export const WorldChart: React.FC<WorldChartProps> = ({
  bounds,
  land,
  pins,
  onPinPress,
  windWash,
  flow,
  flowMotion = true,
  washOpacity = 0.6,
  provenance,
  width,
  height,
  captionWidth = 120,
  testID,
}) => {
  const { width: w, height: h, project } = useMemo(
    () => worldProjection(bounds, width, height),
    [bounds, width, height]
  );
  const reducedMotion = useReducedMotion();

  // Scoped SVG ids: two charts share the page (the hero and the world map).
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const seaId = `wc-sea-${uid}`;
  const landId = `wc-land-${uid}`;

  // The field as a heat wash: one horizontal gradient per row (the same strip
  // trick as RouteMap — solid cells read as tiles). Loud on purpose: the
  // luminous sea over recessive slate land IS the chart's voice now, with the
  // near-white streaks and the pins reading over it.
  const flowWash = useMemo(() => {
    if (!flow || flow.cols < 2 || flow.rows < 2 || flow.cells.length < flow.cols * flow.rows) {
      return null;
    }
    const { cells, cols, rows } = flow;
    // Each strip is smooth LEFT-TO-RIGHT (a horizontal gradient across the data
    // columns) but a single colour top-to-bottom, so one strip per data row
    // steps hard between rows — visible banding wherever a strip is tall (the
    // 13-row world lattice paints ~30px bands on a desktop chart). Render finer
    // DISPLAY rows between the real ones, each column's colour a vertical lerp
    // of the two bracketing samples: the same interpolation the gradient
    // already does horizontally, now applied vertically. Display-only — the
    // data is untouched; sized to the chart's pixels (~14px/strip) so a big
    // desktop chart smooths while a tiny phone strip never over-renders.
    const TARGET_STRIP_PX = 9;
    const MAX_DISPLAY_ROWS = 60;
    const displayRows = Math.max(rows, Math.min(MAX_DISPLAY_ROWS, Math.round(h / TARGET_STRIP_PX)));
    const stripH = h / (displayRows - 1);
    const defs: React.ReactNode[] = [];
    const strips: React.ReactNode[] = [];
    for (let dr = 0; dr < displayRows; dr += 1) {
      // The fractional data-row this display row samples, and its bracket.
      const fr = (dr / (displayRows - 1)) * (rows - 1);
      const r0 = Math.floor(fr);
      const r1 = Math.min(r0 + 1, rows - 1);
      const t = fr - r0;
      const gid = `wc-flow-${uid}-${dr}`;
      defs.push(
        <LinearGradient key={gid} id={gid} x1="0" y1="0" x2="1" y2="0">
          {Array.from({ length: cols }, (_, c) => {
            const kn =
              cells[r0 * cols + c].speedKn * (1 - t) + cells[r1 * cols + c].speedKn * t;
            return (
              <Stop
                key={c}
                offset={`${((c / (cols - 1)) * 100).toFixed(1)}%`}
                stopColor={windHeatColor(kn)}
              />
            );
          })}
        </LinearGradient>
      );
      const top = Math.max(0, (dr - 0.5) * stripH);
      strips.push(
        <Rect
          key={`fs-${dr}`}
          x={0}
          y={top}
          width={w}
          height={Math.min(h, (dr + 0.5) * stripH) - top}
          fill={`url(#${gid})`}
          opacity={washOpacity}
        />
      );
    }
    return (
      <>
        <Defs>{defs}</Defs>
        {strips}
      </>
    );
  }, [flow, w, h, uid, washOpacity]);

  // Land geometry is static per bounds — never re-path it on a re-render.
  const landLayer = useMemo(
    () =>
      land.map((polygon, i) => (
        <Path
          key={`land-${i}`}
          d={landPath(polygon, project)}
          fill={`url(#${landId})`}
          stroke={colors.coastline}
          strokeWidth={0.7}
          fillRule="evenodd"
        />
      )),
    [land, project, landId]
  );

  // A dot IS a position: it renders at its true projected spot, always — a
  // player once caught Newport drawn in the Pacific because a declutter fan
  // moved the marker itself (48px on a world strip is fifteen degrees of
  // latitude). Only the CAPTIONS declutter: each takes the first frame-fitting,
  // non-colliding rectangle from a fixed candidate ring around its dot, and
  // the caption is the tap target — so coincident starts (Cowes hosts three)
  // honestly share one dot with their captions stacked beside it.
  const clampXY = (p: XY): XY => ({
    x: Math.min(Math.max(p.x, 6), w - 6),
    y: Math.min(Math.max(p.y, 6), h - 6),
  });
  const CAP_H = 30;
  const capClamp = (r: XY): XY => ({
    x: Math.min(Math.max(r.x, 4), w - captionWidth - 4),
    y: r.y,
  });
  // Candidate caption anchors (top-left of the block) relative to the dot:
  // centred below, centred above, then side-slid and second-row variants.
  const CAP_CANDIDATES = (p: XY): XY[] =>
    [
      { x: p.x - captionWidth / 2, y: p.y + 12 },
      { x: p.x - captionWidth / 2, y: p.y - 12 - CAP_H },
      { x: p.x + 10, y: p.y + 12 },
      { x: p.x - captionWidth - 10, y: p.y + 12 },
      { x: p.x + 10, y: p.y - 12 - CAP_H },
      { x: p.x - captionWidth - 10, y: p.y - 12 - CAP_H },
      { x: p.x - captionWidth / 2, y: p.y + 12 + CAP_H + 4 },
      { x: p.x - captionWidth / 2, y: p.y - 12 - 2 * CAP_H - 4 },
      { x: p.x - captionWidth / 2, y: p.y + 12 + 2 * (CAP_H + 4) },
    ].map(capClamp);
  const capFits = (r: XY) => r.y >= 2 && r.y + CAP_H <= h - 2;
  const capRects: XY[] = [];
  const capCollides = (r: XY) =>
    capRects.some(
      (q) => Math.abs(q.x - r.x) < captionWidth && Math.abs(q.y - r.y) < CAP_H
    );
  const labelled = pins.map((pin) => {
    const at = clampXY(project(pin.lat, pin.lon));
    if (!pin.label) return { pin, at, cap: null as XY | null };
    let cap: XY | null = null;
    for (const cand of CAP_CANDIDATES(at)) {
      if (capFits(cand) && !capCollides(cand)) {
        cap = cand;
        break;
      }
    }
    // Every candidate taken (a pathologically crowded corner): fall back to
    // centred-below so the caption still renders; the overlap is visible
    // rather than the station vanishing.
    if (!cap) cap = capClamp({ x: at.x - captionWidth / 2, y: at.y + 12 });
    capRects.push(cap);
    return { pin, at, cap };
  });

  // The breeze arrow points the way the wind BLOWS (from + 180), drawn in the
  // top-right sea corner of the hero chart.
  const arrow = windWash ? (
    <G
      transform={`translate(${w - 26}, 26) rotate(${((windWash.fromDeg + 180) % 360).toFixed(0)})`}
      opacity={0.9}
    >
      <Path
        d="M 0 10 L 0 -6 M -5 -1 L 0 -7 L 5 -1"
        stroke={colors.foam}
        strokeWidth={2}
        fill="none"
      />
    </G>
  ) : null;

  return (
    <View style={[styles.container, { width: w, height: h }]} testID={testID}>
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient id={seaId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.navy} />
            <Stop offset="1" stopColor={colors.abyss} />
          </LinearGradient>
          {/* Weather-chart land: dark slate, not the race chart's olive — on a
              painted ocean the land must sit below every wind hue. */}
          <LinearGradient id={landId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.weatherLandHigh} />
            <Stop offset="1" stopColor={colors.weatherLand} />
          </LinearGradient>
        </Defs>
        {/* Under a wash the sea flattens to near-abyss: the navy gradient must
            not compete with the data's own colour. */}
        <Rect
          x={0}
          y={0}
          width={w}
          height={h}
          fill={flow ? colors.abyss : `url(#${seaId})`}
          rx={radius.sm}
        />
        {windWash && !flow ? (
          // The flat wind wash: the sea takes the band's colour, faintly —
          // honest paint (one sample for these waters), superseded wherever a
          // blended field is available.
          <Rect
            x={0}
            y={0}
            width={w}
            height={h}
            fill={windHeatColor(windWash.speedKn)}
            opacity={0.16}
            rx={radius.sm}
          />
        ) : null}
        {flowWash}
        {/* Motion means live: only a live field flies the swarm (a reduced-
            motion player gets its still streamlets); a seasonal wash holds
            perfectly still. */}
        {flow && flowMotion ? (
          <WindParticles
            cells={flow.cells}
            cols={flow.cols}
            rows={flow.rows}
            project={project}
            layer="wind"
            color={colors.foam}
            motion={!reducedMotion}
            width={w}
            height={h}
          />
        ) : null}
        {landLayer}
        {/* Each station's true wind: a small vane off the dot, pointing the
            way the breeze blows (from + 180, the hero arrow's convention). */}
        {labelled.map(({ pin, at }) =>
          pin.fromDeg !== undefined ? (
            <G
              key={`vane-${pin.id}`}
              transform={`translate(${at.x}, ${at.y}) rotate(${((pin.fromDeg + 180) % 360).toFixed(0)})`}
              // With a painted field behind them the vanes step back — the
              // field carries the story; a bare (vanes-only) chart lets them
              // speak at full strength.
              opacity={pin.locked ? 0.35 : flow ? 0.6 : 0.85}
            >
              <Path
                d="M 0 -8 L 0 -18 M -3 -13 L 0 -19 L 3 -13"
                stroke={colors.foam}
                strokeWidth={1.5}
                fill="none"
              />
            </G>
          ) : null
        )}
        {arrow}
      </Svg>

      {/* Dots first (pure position markers), then captions (the tap targets
          for labelled pins — a caption is a ~120×30 block, a better thumb
          target than an 11px dot, and it can declutter without lying about
          where the harbour is). A caption-less pin keeps a small tappable box
          on the dot itself. */}
      {labelled.map(({ pin, at }) =>
        pin.label ? (
          <View
            key={`dot-${pin.id}`}
            pointerEvents="none"
            style={[
              styles.pinDotAnchor,
              { left: at.x - 7, top: at.y - 7 },
            ]}
          >
            <View
              style={[
                styles.pinDot,
                { backgroundColor: pin.color },
                pin.locked && styles.pinLocked,
              ]}
            />
          </View>
        ) : (
          <Pressable
            key={`dot-${pin.id}`}
            onPress={onPinPress ? () => onPinPress(pin.id) : undefined}
            disabled={!onPinPress}
            accessibilityRole="button"
            accessibilityLabel={pin.id}
            accessibilityState={{ disabled: !onPinPress }}
            testID={`${testID ?? 'chart'}-pin-${pin.id}`}
            style={[styles.pinHit, { left: at.x - 22, top: at.y - 22 }]}
            hitSlop={4}
          >
            <View
              style={[
                styles.pinDot,
                { backgroundColor: pin.color },
                pin.locked && styles.pinLocked,
              ]}
            />
          </Pressable>
        )
      )}
      {/* The source line lives ON the chart — the paint's honesty is part of
          the paint. */}
      {provenance ? (
        <View
          pointerEvents="none"
          style={styles.provenance}
          testID={`${testID ?? 'chart'}-provenance`}
        >
          <Text style={styles.provenanceText}>{provenance}</Text>
        </View>
      ) : null}
      {labelled.map(({ pin, cap }) =>
        pin.label && cap ? (
          <Pressable
            key={`cap-${pin.id}`}
            onPress={onPinPress ? () => onPinPress(pin.id) : undefined}
            disabled={!onPinPress}
            accessibilityRole="button"
            accessibilityLabel={pin.label}
            accessibilityState={{ disabled: !onPinPress }}
            testID={`${testID ?? 'chart'}-pin-${pin.id}`}
            style={[
              styles.pinCaption,
              { width: captionWidth, left: cap.x, top: cap.y },
            ]}
            hitSlop={6}
          >
            <Text
              style={[styles.pinLabel, pin.locked && styles.pinLabelLocked]}
              numberOfLines={1}
            >
              {pin.label}
            </Text>
            {pin.sublabel ? (
              <Text
                style={[styles.pinSublabel, pin.locked && styles.pinLabelLocked]}
                numberOfLines={1}
              >
                {pin.sublabel}
              </Text>
            ) : null}
          </Pressable>
        ) : null
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
    // A clamped chart (a square region box on a wide stage) sits centred, not
    // flushed into a corner.
    alignSelf: 'center',
  },
  pinHit: {
    position: 'absolute',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 11,
    height: 11,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.foam,
  },
  pinLocked: {
    opacity: 0.45,
    borderColor: colors.slate,
  },
  pinDotAnchor: {
    position: 'absolute',
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinCaption: {
    position: 'absolute',
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinLabel: {
    textAlign: 'center',
    color: colors.foam,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textShadowColor: colors.abyss,
    textShadowRadius: 3,
  },
  pinSublabel: {
    textAlign: 'center',
    color: colors.mist,
    fontSize: fontSize.xs,
    textShadowColor: colors.abyss,
    textShadowRadius: 3,
    marginTop: spacing.xs / 4,
  },
  pinLabelLocked: {
    color: colors.slate,
  },
  provenance: {
    position: 'absolute',
    left: spacing.xs,
    bottom: spacing.xs,
    backgroundColor: colors.overlay,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  provenanceText: {
    color: colors.mist,
    fontSize: fontSize.xs,
  },
});

export default WorldChart;
