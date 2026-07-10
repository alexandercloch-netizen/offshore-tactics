import { GeoBounds, REGION_BOUNDS } from '../../data/worldmap';
import { FlowCell } from '../flowField';
import { haversineNm } from '../../engine/geo';
import { RegionKey, regionRaces } from './regions';

// Blend the Harbour's real per-course wind samples into a smooth field over a
// region chart. This is honest interpolation, not invention: the field is
// EXACT at every course anchor (the data we actually have — live open-meteo
// points or the baked climatology) and inverse-distance-weighted between
// them, which is a fair read across the few tens of miles a region box spans.
// It is deliberately NOT used on the world chart, where "between the samples"
// means an ocean — there the stations show their own true arrows instead.
//
// Vectors, not angles: winds of 350° and 010° must blend to due north, never
// to a phantom southerly, so the average runs through u/v components.

export interface WindPoint {
  lat: number;
  lon: number;
  fromDeg: number;
  speedKn: number;
}

const toVec = (p: WindPoint): { u: number; v: number } => {
  const a = (p.fromDeg * Math.PI) / 180;
  return { u: Math.sin(a) * p.speedKn, v: Math.cos(a) * p.speedKn };
};

// Row-major (north row first), matching sampleWindGrid so the cells feed the
// existing WindParticles / heat ramp unchanged.
export function blendWindGrid(
  points: WindPoint[],
  bounds: GeoBounds,
  cols: number,
  rows: number
): FlowCell[] {
  const cells: FlowCell[] = [];
  if (points.length === 0) return cells;
  const vecs = points.map(toVec);
  const kLon = Math.cos((((bounds.minLat + bounds.maxLat) / 2) * Math.PI) / 180) || 1;
  for (let r = 0; r < rows; r += 1) {
    const lat = bounds.maxLat + ((bounds.minLat - bounds.maxLat) * r) / Math.max(rows - 1, 1);
    for (let c = 0; c < cols; c += 1) {
      const lon = bounds.minLon + ((bounds.maxLon - bounds.minLon) * c) / Math.max(cols - 1, 1);
      let wSum = 0;
      let u = 0;
      let v = 0;
      let speed = 0;
      let exact: WindPoint | null = null;
      for (let i = 0; i < points.length; i += 1) {
        const p = points[i];
        const dx = (lon - p.lon) * kLon;
        const dy = lat - p.lat;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-9) {
          exact = p;
          break;
        }
        const w = 1 / d2; // IDW, power 2
        wSum += w;
        u += vecs[i].u * w;
        v += vecs[i].v * w;
        // Speed blends as scalars: opposing sample directions must read as the
        // real breeze strength between them, not the near-zero vector residue.
        speed += p.speedKn * w;
      }
      if (exact) {
        cells.push({ lat, lon, dirDeg: exact.fromDeg, speedKn: exact.speedKn });
      } else {
        const dirDeg = ((Math.atan2(u / wSum, v / wSum) * 180) / Math.PI + 360) % 360;
        cells.push({ lat, lon, dirDeg, speedKn: speed / wSum });
      }
    }
  }
  return cells;
}

// The honesty gate on blending at all. IDW is a fair read across the few tens
// of miles the comment above promises — but a region box can be a whole ocean
// (usWest spans ~4,700 km), where "between the samples" is invention. The
// blend may render only when EVERY spot in the box is within maxKm of a real
// sample (great-circle, corners probed at ≤~100 km pitch); otherwise the
// region shows vanes-only in seasonal mode. Pure — PR-2 wires it to the chart.
const KM_PER_NM = 1.852;
const clampInt = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export function blendCoverageOk(
  points: readonly { lat: number; lon: number }[],
  bounds: GeoBounds,
  maxKm = 500
): boolean {
  if (points.length === 0) return false;
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const spanKmX = haversineNm(midLat, bounds.minLon, midLat, bounds.maxLon) * KM_PER_NM;
  const spanKmY = haversineNm(bounds.minLat, bounds.minLon, bounds.maxLat, bounds.minLon) * KM_PER_NM;
  const cols = clampInt(Math.ceil(spanKmX / 100) + 1, 2, 64);
  const rows = clampInt(Math.ceil(spanKmY / 100) + 1, 2, 64);
  for (let r = 0; r < rows; r += 1) {
    const lat = bounds.maxLat + ((bounds.minLat - bounds.maxLat) * r) / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const lon = bounds.minLon + ((bounds.maxLon - bounds.minLon) * c) / (cols - 1);
      let nearest = Infinity;
      for (const p of points) {
        const d = haversineNm(lat, lon, p.lat, p.lon) * KM_PER_NM;
        if (d < nearest) nearest = d;
        if (nearest <= maxKm) break;
      }
      if (nearest > maxKm) return false;
    }
  }
  return true;
}

// The blend's sample set for a region: each course's one honest reading
// (live board sample or its seasonal fallback), carried at EVERY waypoint of
// that course — the reading is the course's, so the whole track testifies,
// and the wash follows the racing water instead of hanging off three start
// pins. The same points the gate above measures coverage with.
export function courseWindPoints(
  races: readonly { id: string; waypoints: readonly { lat: number; lon: number }[]; prevailingWind: { fromDeg: number; speedKn: number } }[],
  samples: Record<string, { fromDeg: number; speedKn: number }>
): WindPoint[] {
  return races.flatMap((race) => {
    const s = samples[race.id] ?? race.prevailingWind;
    return race.waypoints.map((w) => ({
      lat: w.lat,
      lon: w.lon,
      fromDeg: s.fromDeg,
      speedKn: s.speedKn,
    }));
  });
}

// The gate, asked per region with the region's course WAYPOINTS as the
// samples — not just the start pins: a course's reading holds along its own
// track, so the whole track counts as coverage (the UK box passes on exactly
// that margin; usWest fails however you count). Waypoints never change at
// runtime, so the verdict is cached for the session.
const blendGateCache = new Map<RegionKey, boolean>();
export function regionBlendAllowed(region: RegionKey): boolean {
  const hit = blendGateCache.get(region);
  if (hit !== undefined) return hit;
  const anchors = regionRaces(region).flatMap((race) =>
    race.waypoints.map((w) => ({ lat: w.lat, lon: w.lon }))
  );
  const ok = blendCoverageOk(anchors, REGION_BOUNDS[region]);
  blendGateCache.set(region, ok);
  return ok;
}

// The vector-mean direction of a station's courses (the world chart's arrow):
// through components for the same wraparound honesty as the grid.
export function meanFromDeg(points: WindPoint[]): number | undefined {
  if (points.length === 0) return undefined;
  let u = 0;
  let v = 0;
  for (const p of points) {
    const a = (p.fromDeg * Math.PI) / 180;
    u += Math.sin(a);
    v += Math.cos(a);
  }
  if (Math.abs(u) < 1e-9 && Math.abs(v) < 1e-9) return points[0].fromDeg;
  return ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
}
