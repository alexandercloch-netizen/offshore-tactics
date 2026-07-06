import { CourseBounds } from '../engine/geo';

// Pure maths for the chart's equirectangular projection, kept apart from the SVG
// component so it's unit-testable without a JSX transform. Longitude is scaled by
// cos(mean latitude); the course box is fit to the viewport with padding and
// letterboxed on the looser axis. Derived once so the projector and its inverse
// (chartViewportBounds) can't drift apart.

export const CHART_PAD = 26;

export interface ProjectionParams {
  k: number; // longitude compression at the course's mean latitude
  minX: number;
  minY: number;
  scale: number; // pixels per projected unit
  offsetX: number;
  offsetY: number;
}

export interface XY {
  x: number;
  y: number;
}

export function projectionParams(
  waypoints: { lat: number; lon: number }[],
  width: number,
  height: number
): ProjectionParams {
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

// A projector closure: geographic (lat, lon) → screen (x, y).
export function buildProjector(
  waypoints: { lat: number; lon: number }[],
  width: number,
  height: number
): (lat: number, lon: number) => XY {
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
  waypoints: { lat: number; lon: number }[],
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

// The half-span (in projected units, either axis, about the course centre) of
// the land data baked by scripts/build-coastlines.mjs — the SAME square-ish box
// formula, so the two can't drift apart silently: change one, change both, and
// re-run the bake. Beyond this box there simply is no coastline, and a viewport
// that reaches past it paints inland terrain as open water.
export function landCoverageHalfSpan(waypoints: { lat: number; lon: number }[]): number {
  const lats = waypoints.map((w) => w.lat);
  const lons = waypoints.map((w) => w.lon);
  const meanLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((meanLat * Math.PI) / 180) || 1;
  const spanX = (Math.max(...lons) - Math.min(...lons)) * k;
  const spanY = Math.max(...lats) - Math.min(...lats);
  return Math.max((Math.max(spanX, spanY) / 2) * 1.45, 0.3);
}

// Shrink a chart's drawable size so its viewport never reaches past the baked
// land coverage — the extreme-aspect fix. The course letterboxes on the looser
// axis, so a wide (or very tall) stage can invert to bounds outside the bake box
// and show bare "sea" over unmapped land; clamping the loose axis letterboxes
// with the stage's own background instead, like the margin of a paper chart.
// The tight axis always fits (pad 26 on a ≥260px floor keeps it under 1.45×),
// so only the loose dimension ever shrinks. A short fixed-point loop absorbs
// the scale feedback from shrinking; the final pass verifies.
export function clampChartToCoverage(
  waypoints: { lat: number; lon: number }[],
  width: number,
  height: number
): { width: number; height: number } {
  const half = landCoverageHalfSpan(waypoints);
  let w = width;
  let h = height;
  for (let i = 0; i < 4; i += 1) {
    const { scale } = projectionParams(waypoints, w, h);
    const wantW = Math.min(w, 2 * half * scale);
    const wantH = Math.min(h, 2 * half * scale);
    if (Math.abs(wantW - w) < 0.5 && Math.abs(wantH - h) < 0.5) break;
    w = wantW;
    h = wantH;
  }
  return { width: Math.max(w, 50), height: Math.max(h, 50) };
}
