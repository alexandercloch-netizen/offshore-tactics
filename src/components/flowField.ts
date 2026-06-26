import type { WindArrow } from '../engine/wind';
import type { CurrentArrow } from '../types';

// Pure maths for the flow animation, kept apart from the SVG component so it's
// unit-testable without a JSX transform. Builds a pixel-space velocity grid from
// a sampled field and bilinear-samples it; no React, no engine rng.

export type FlowLayer = 'wind' | 'tide';

// One sample of the active field: a direction (named by origin for wind, by set
// for tide — buildFlowField resolves which) and a magnitude in knots.
export interface FlowCell {
  lat: number;
  lon: number;
  dirDeg: number;
  speedKn: number;
}

interface XY {
  x: number;
  y: number;
}

// A regular pixel-space velocity grid. The chart projection is affine (screen x
// depends only on lon, y only on lat), so the lat/lon sample grid lands as an
// axis-aligned regular grid in pixels — letting us bilinear-sample velocity at
// any pixel by a cheap fractional index, no projection inverse per particle.
export interface FlowField {
  cols: number;
  rows: number;
  x0: number; // pixel x of column 0
  xStep: number; // pixel x per column (signed)
  y0: number; // pixel y of row 0
  yStep: number; // pixel y per row (signed)
  vx: Float32Array; // px/sec per knot, east-positive, row-major
  vy: Float32Array; // px/sec per knot, south-positive (screen down)
  speed: Float32Array; // knots, for fading slow cells
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

// How fast a knot pushes a particle, in px/sec. Tide rates are far smaller than
// wind speeds, so the tide layer scales up to keep its streaks visibly moving.
const PX_PER_KN_WIND = 7;
const PX_PER_KN_TIDE = 26;

// Build the pixel-space velocity grid from a sampled field. `cells` is row-major
// (row 0 = first sampled latitude), matching sampleWindGrid / a dense tide grid.
export function buildFlowField(
  cells: FlowCell[],
  cols: number,
  rows: number,
  project: (lat: number, lon: number) => XY,
  layer: FlowLayer
): FlowField | null {
  if (cols < 2 || rows < 2 || cells.length < cols * rows) return null;
  const c0 = project(cells[0].lat, cells[0].lon); // (col 0, row 0)
  const cCol = project(cells[cols - 1].lat, cells[cols - 1].lon); // (col max, row 0)
  const cRow = project(cells[(rows - 1) * cols].lat, cells[(rows - 1) * cols].lon); // (col 0, row max)
  const x0 = c0.x;
  const y0 = c0.y;
  const xStep = (cCol.x - x0) / (cols - 1);
  const yStep = (cRow.y - y0) / (rows - 1);
  const scale = layer === 'tide' ? PX_PER_KN_TIDE : PX_PER_KN_WIND;

  const vx = new Float32Array(cols * rows);
  const vy = new Float32Array(cols * rows);
  const speed = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i += 1) {
    const cell = cells[i];
    // Direction the flow travels TOWARD: wind is named by where it comes from
    // (fromDeg), so it blows to fromDeg+180; tide set already points downstream.
    const toDeg = layer === 'wind' ? cell.dirDeg + 180 : cell.dirDeg;
    const a = (toDeg * Math.PI) / 180;
    vx[i] = Math.sin(a) * cell.speedKn * scale;
    vy[i] = -Math.cos(a) * cell.speedKn * scale; // north is up → screen y down
    speed[i] = cell.speedKn;
  }

  const xs = [x0, x0 + xStep * (cols - 1)];
  const ys = [y0, y0 + yStep * (rows - 1)];
  return {
    cols,
    rows,
    x0,
    xStep,
    y0,
    yStep,
    vx,
    vy,
    speed,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

// Bilinear velocity (px/sec) at a pixel. Returns the flow speed in knots too, so
// the caller can retire particles stranded in glassy patches.
export function sampleFlow(
  field: FlowField,
  x: number,
  y: number
): { vx: number; vy: number; kn: number } {
  let fc = field.xStep !== 0 ? (x - field.x0) / field.xStep : 0;
  let fr = field.yStep !== 0 ? (y - field.y0) / field.yStep : 0;
  if (fc < 0) fc = 0;
  else if (fc > field.cols - 1) fc = field.cols - 1;
  if (fr < 0) fr = 0;
  else if (fr > field.rows - 1) fr = field.rows - 1;
  const c0 = Math.floor(fc);
  const r0 = Math.floor(fr);
  const c1 = Math.min(c0 + 1, field.cols - 1);
  const r1 = Math.min(r0 + 1, field.rows - 1);
  const tx = fc - c0;
  const ty = fr - r0;
  const i00 = r0 * field.cols + c0;
  const i10 = r0 * field.cols + c1;
  const i01 = r1 * field.cols + c0;
  const i11 = r1 * field.cols + c1;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const bil = (a: Float32Array) => lerp(lerp(a[i00], a[i10], tx), lerp(a[i01], a[i11], tx), ty);
  return { vx: bil(field.vx), vy: bil(field.vy), kn: bil(field.speed) };
}

// Heatmap sampling density, sized to the chart's pixel dimensions rather than a
// fixed grid. A coarse grid only reads as a smooth gradient when the wind barely
// varies across the chart (a short course); over a long passage like Sydney–Hobart
// the field changes enough cell-to-cell that big cells show as hard tiles. Sizing
// to a small pixel pitch keeps the colour step between neighbours below perception
// on any course, and the caps keep the (memoised, static) SVG node count sane.
export function fieldResolution(width: number, height: number): { cols: number; rows: number } {
  // The field is painted as one smooth horizontal gradient per row (see RouteMap),
  // so columns set the (already-interpolated) horizontal shape — a moderate count
  // is plenty — while rows set the vertical step, which must be fine or thin
  // horizontal bands show between strips. Hence rows are sampled denser than cols.
  // Caps bound the (static, memoised) gradient/stop node count.
  const cols = Math.max(40, Math.min(56, Math.round((width || 1) / 12)));
  const rows = Math.max(60, Math.min(100, Math.round((height || 1) / 7)));
  return { cols, rows };
}

// Adapt the engine's sampled grids to the flow input. Wind names its direction by
// origin (fromDeg); tide by set (downstream) — buildFlowField handles the 180°.
export function windCells(arrows: WindArrow[]): FlowCell[] {
  return arrows.map((a) => ({ lat: a.lat, lon: a.lon, dirDeg: a.fromDeg, speedKn: a.speedKn }));
}

export function tideCells(arrows: CurrentArrow[]): FlowCell[] {
  return arrows.map((a) => ({ lat: a.lat, lon: a.lon, dirDeg: a.setDeg, speedKn: a.rateKn }));
}
