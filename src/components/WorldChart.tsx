import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { WindSample } from '../types';
import { LandPolygon } from '../data/landmasses';
import { GeoBounds } from '../data/worldmap';
import { windHeatColor } from './windScale';

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
}

interface WorldChartProps {
  bounds: GeoBounds;
  land: LandPolygon[];
  pins: WorldPin[];
  onPinPress?: (id: string) => void;
  // Paint the current breeze over the water (the conditions hero): a wash of
  // the wind-band colour plus a from-direction arrow.
  windWash?: WindSample;
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
  width,
  height,
  captionWidth = 120,
  testID,
}) => {
  const { width: w, height: h, project } = useMemo(
    () => worldProjection(bounds, width, height),
    [bounds, width, height]
  );

  // Scoped SVG ids: two charts share the page (the hero and the world map).
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const seaId = `wc-sea-${uid}`;
  const landId = `wc-land-${uid}`;

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

  // Declutter crowded pins (several classics share one start line — Cowes
  // alone hosts three; the Americas stations sit shoulder-to-shoulder on the
  // short world view). Each pin takes the first free slot from a fixed ring of
  // candidate offsets, every candidate CLAMPED inside the chart — the old
  // fan-down-then-flip could hurl a pin clear off a short chart (Great Lakes
  // once landed 80px above the world map, inside the hero). Deterministic,
  // order-stable.
  const placed: XY[] = [];
  const CANDIDATES: XY[] = [
    { x: 0, y: 0 },
    { x: 0, y: 48 },
    { x: 0, y: -48 },
    { x: 48, y: 0 },
    { x: -48, y: 0 },
    { x: 48, y: 48 },
    { x: -48, y: 48 },
    { x: 48, y: -48 },
    { x: -48, y: -48 },
    { x: 0, y: 96 },
    { x: 96, y: 0 },
    { x: -96, y: 0 },
  ];
  // A station's footprint is the dot PLUS its caption (captions collide long
  // before dots do — a 120px label on a 40px pin pitch), so the fan spreads
  // whole stations, not just markers. A caption sits below its dot unless the
  // frame's foot forces it above.
  const clampXY = (p: XY): XY => ({
    x: Math.min(Math.max(p.x, 12), w - 12),
    y: Math.min(Math.max(p.y, 12), h - 12),
  });
  // Caption rectangles are 120×~28 with their left edge at the slid lx; a
  // caption may sit below its dot or above it — a FREE choice per station, so
  // two same-latitude neighbours interleave below/above instead of fighting
  // for the same row (UK and the Med sit 15px apart on the world view).
  const capLx = (p: XY) =>
    Math.min(Math.max(p.x - captionWidth / 2, 4), w - captionWidth - 4);
  const captionAt = (p: XY, above: boolean): XY => ({
    x: capLx(p),
    y: above ? p.y - 60 : p.y + 32,
  });
  const captionFits = (cap: XY) => cap.y >= 2 && cap.y + 28 <= h - 2;
  const footprints: { dot: XY; cap: XY | null }[] = [];
  const collides = (p: XY, cap: XY | null) =>
    footprints.some(
      (q) =>
        // Dot separation must exceed the 44px tap target (+slop), or a later
        // station's hit box silently shadows an earlier one's centre.
        (Math.abs(q.dot.x - p.x) < 46 && Math.abs(q.dot.y - p.y) < 46) ||
        (!!cap &&
          !!q.cap &&
          Math.abs(q.cap.x - cap.x) < captionWidth &&
          Math.abs(q.cap.y - cap.y) < 28)
    );
  const labelled = pins.map((pin) => {
    const raw = project(pin.lat, pin.lon);
    let at = clampXY(raw);
    let labelAbove = false;
    outer: for (const c of CANDIDATES) {
      const cand = clampXY({ x: raw.x + c.x, y: raw.y + c.y });
      if (!pin.label) {
        if (!collides(cand, null)) {
          at = cand;
          break;
        }
        continue;
      }
      for (const above of [false, true]) {
        const cap = captionAt(cand, above);
        if (!captionFits(cap)) continue;
        if (!collides(cand, cap)) {
          at = cand;
          labelAbove = above;
          break outer;
        }
      }
    }
    footprints.push({
      dot: at,
      cap: pin.label ? captionAt(at, labelAbove) : null,
    });
    return { pin, at, labelAbove };
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
          <LinearGradient id={landId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.landHigh} />
            <Stop offset="1" stopColor={colors.land} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={w} height={h} fill={`url(#${seaId})`} rx={radius.sm} />
        {windWash ? (
          // The wind wash: the sea takes the band's colour, faintly — honest
          // paint (one sample for these waters), not a fake per-cell field.
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
        {landLayer}
        {arrow}
      </Svg>

      {/* The tappable pin layer. */}
      {labelled.map(({ pin, at, labelAbove }) => (
        <Pressable
          key={pin.id}
          onPress={onPinPress ? () => onPinPress(pin.id) : undefined}
          disabled={!onPinPress}
          accessibilityRole="button"
          accessibilityLabel={pin.label ?? pin.id}
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
          {pin.label ? (
            // Keep the label block inside the frame: a pin near an edge slides
            // its caption sideways instead of clipping (pressable-local offset).
            // The caption is display-only and MUST NOT eat touches — a long
            // label reaching over a neighbouring station was swallowing that
            // station's tap (US West's caption made the Caribbean untappable).
            <View
              pointerEvents="none"
              style={[
                styles.pinLabelBlock,
                { width: captionWidth, left: capLx(at) - (at.x - 22) },
                labelAbove && styles.pinLabelAbove,
              ]}
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
            </View>
          ) : null}
        </Pressable>
      ))}
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
  pinLabelBlock: {
    position: 'absolute',
    top: 32,
    width: 120,
    alignItems: 'center',
  },
  pinLabelAbove: {
    // Flipped caption for a crowded station: sits over the dot instead.
    top: undefined,
    bottom: 32,
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
});

export default WorldChart;
