import { FlowCell } from '../flowField';
import { GeoBounds, REGION_BOUNDS, WORLD_BOUNDS } from '../../data/worldmap';
import { LiveFlowGrid, seasonalWorldFlow } from '../../services/weather';
import { liveProvenance, seasonalWorldProvenance } from './provenance';
import { RegionKey } from './regions';

// The wash for a region whose own course samples can't honestly cover its box —
// the ocean-sized ones (usEast, usWest, ausNz) that fail the 500 km blend gate.
// Their pixels come from the GLOBAL field we already hold: the live world
// lattice when it's fetched, else the baked seasonal ERA5 world. Both are real
// data everywhere, so clipping the world to the box is honest interpolation
// (the same bilinear read the world chart itself paints), never invention — and
// it means a wide home region is painted weather, not a blank sea.

// The region wash's target resolution (the strips interpolate horizontally).
const REGION_FLOW_COLS = 14;
const REGION_FLOW_ROWS = 22;

// Bilinear-resample a world grid (a regular lat/lon lattice over `src`, NORTH
// row first — the WORLD_LATTICE / seasonalWorldFlow contract) onto a smaller
// target box. Speed interpolates directly; direction through u/v so it wraps
// cleanly through north.
export function resampleWorldToBounds(
  world: { cells: FlowCell[]; cols: number; rows: number },
  target: GeoBounds,
  tCols: number,
  tRows: number,
  src: GeoBounds = WORLD_BOUNDS
): FlowCell[] {
  const { cells, cols, rows } = world;
  if (cols < 2 || rows < 2 || cells.length < cols * rows) return [];
  const at = (r: number, c: number): FlowCell => cells[r * cols + c];
  const clampf = (v: number, hi: number): number => Math.max(0, Math.min(hi, v));
  const out: FlowCell[] = [];
  for (let r = 0; r < tRows; r += 1) {
    const lat = target.maxLat + ((target.minLat - target.maxLat) * r) / Math.max(tRows - 1, 1);
    const fr = clampf(((src.maxLat - lat) / (src.maxLat - src.minLat)) * (rows - 1), rows - 1);
    const r0 = Math.floor(fr);
    const r1 = Math.min(r0 + 1, rows - 1);
    const tr = fr - r0;
    for (let c = 0; c < tCols; c += 1) {
      const lon = target.minLon + ((target.maxLon - target.minLon) * c) / Math.max(tCols - 1, 1);
      const fc = clampf(((lon - src.minLon) / (src.maxLon - src.minLon)) * (cols - 1), cols - 1);
      const c0 = Math.floor(fc);
      const c1 = Math.min(c0 + 1, cols - 1);
      const tc = fc - c0;
      // Speed: straight bilinear.
      const sTop = at(r0, c0).speedKn * (1 - tc) + at(r0, c1).speedKn * tc;
      const sBot = at(r1, c0).speedKn * (1 - tc) + at(r1, c1).speedKn * tc;
      const speedKn = sTop * (1 - tr) + sBot * tr;
      // Direction: bilinear through unit vectors so 350°/010° meet at north.
      let u = 0;
      let v = 0;
      const add = (cell: FlowCell, w: number): void => {
        const a = (cell.dirDeg * Math.PI) / 180;
        u += Math.sin(a) * w;
        v += Math.cos(a) * w;
      };
      add(at(r0, c0), (1 - tr) * (1 - tc));
      add(at(r0, c1), (1 - tr) * tc);
      add(at(r1, c0), tr * (1 - tc));
      add(at(r1, c1), tr * tc);
      const dirDeg = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
      out.push({ lat, lon, dirDeg, speedKn });
    }
  }
  return out;
}

export interface RegionWash {
  flow: { cells: FlowCell[]; cols: number; rows: number };
  motion: boolean; // motion means live: only the live world lattice flies the swarm
  provenance: string;
}

// The gate-false region's wash, up the world ladder: the live world lattice
// clipped to the box (motion, live chip) → the baked seasonal ERA5 world
// clipped (still, seasonal chip). Never blank.
export function regionWorldWash(
  region: RegionKey,
  worldFlow: LiveFlowGrid | null | undefined,
  monthIndex: number
): RegionWash {
  const bounds = REGION_BOUNDS[region];
  const source = worldFlow ?? seasonalWorldFlow(monthIndex);
  const cells = resampleWorldToBounds(source, bounds, REGION_FLOW_COLS, REGION_FLOW_ROWS);
  return {
    flow: { cells, cols: REGION_FLOW_COLS, rows: REGION_FLOW_ROWS },
    motion: !!worldFlow,
    provenance: worldFlow
      ? liveProvenance(worldFlow.fetchedAt)
      : seasonalWorldProvenance(monthIndex),
  };
}
