import { GeoPoint } from '../types';
import { LandPolygon } from '../data/landmasses';

// Land geometry helpers for the router, so routed tracks stay in navigable water
// instead of cutting across the coastline drawn on the chart. Polygons are
// Natural Earth rings of [lon, lat]; ring 0 is the outer boundary, the rest are
// holes (lakes), so a point inside a hole is water, not land.

interface Box {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

// Point tests run against the *same* full-resolution rings that are drawn on the
// chart, so the router can never thread a gap that isn't there: a routed track
// stays in the water you can see. A per-polygon bounding box (below) rejects the
// vast majority of rings before any ray-cast, so testing the detailed coastline
// stays cheap even on the island-dense passages.

// Cache each polygon's outer-ring bounding box (per land set) for a cheap reject
// before the full ray-cast. Keyed on the array identity (stable per race).
const boxCache = new WeakMap<LandPolygon[], Box[]>();

function boxesFor(polys: LandPolygon[]): Box[] {
  const cached = boxCache.get(polys);
  if (cached) return cached;
  const boxes = polys.map((poly) => {
    const outer = poly[0] ?? [];
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of outer) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return { minLon, minLat, maxLon, maxLat };
  });
  boxCache.set(polys, boxes);
  return boxes;
}

// Ray-casting point-in-ring needs only the edges that straddle the query
// latitude. Index each ring's edges into latitude bands once, so a test on a big
// coastline ring scans a handful of candidate edges instead of all of them — the
// hot path for the router, which probes land thousands of times per route. The
// result is bit-for-bit the original ray-cast: bucketing only skips edges that
// provably can't cross the query line.
interface RingIndex {
  minLat: number;
  inv: number; // 1 / band height
  bands: number[][]; // per band: start-vertex indices of edges spanning it (edge = ring[i]→ring[i-1])
}
const ringIndexCache = new WeakMap<[number, number][], RingIndex>();

function ringIndexFor(ring: [number, number][]): RingIndex {
  const cached = ringIndexCache.get(ring);
  if (cached) return cached;
  const n = ring.length;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const y = ring[i][1];
    if (y < minLat) minLat = y;
    if (y > maxLat) maxLat = y;
  }
  const B = Math.max(1, Math.min(256, Math.floor(Math.sqrt(n))));
  const h = (maxLat - minLat) / B || 1e-9;
  const inv = 1 / h;
  const bands: number[][] = Array.from({ length: B }, () => []);
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const ylo = ring[i][1] < ring[j][1] ? ring[i][1] : ring[j][1];
    const yhi = ring[i][1] > ring[j][1] ? ring[i][1] : ring[j][1];
    let b0 = Math.floor((ylo - minLat) * inv);
    let b1 = Math.floor((yhi - minLat) * inv);
    if (b0 < 0) b0 = 0;
    if (b1 > B - 1) b1 = B - 1;
    for (let b = b0; b <= b1; b += 1) bands[b].push(i);
  }
  const idx: RingIndex = { minLat, inv, bands };
  ringIndexCache.set(ring, idx);
  return idx;
}

// Ray-casting point-in-ring; ring points are [lon, lat]. Tests only the edges in
// the query latitude's band (see ringIndexFor) — identical to scanning them all.
function pointInRing(ring: [number, number][], lon: number, lat: number): boolean {
  const n = ring.length;
  if (n < 3) return false;
  const idx = ringIndexFor(ring);
  let b = Math.floor((lat - idx.minLat) * idx.inv);
  if (b < 0) b = 0;
  else if (b > idx.bands.length - 1) b = idx.bands.length - 1;
  const cand = idx.bands[b];
  let inside = false;
  for (let c = 0; c < cand.length; c += 1) {
    const i = cand[c];
    const j = i === 0 ? n - 1 : i - 1;
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Inside a polygon = inside its outer ring and outside every hole.
function pointInPolygon(poly: LandPolygon, lon: number, lat: number): boolean {
  if (poly.length === 0 || !pointInRing(poly[0], lon, lat)) return false;
  for (let h = 1; h < poly.length; h += 1) {
    if (pointInRing(poly[h], lon, lat)) return false; // in a lake → water
  }
  return true;
}

// Is the point on land for this race?
// Snap a point to the nearest open water if it has landed on the coast. Spirals
// outward in ~1nm rings and returns the first water point found — the universal
// backstop that keeps any drawn position (a boat, a route vertex) off land,
// whatever produced it. A point already at sea is returned unchanged.
export function snapToWater(
  polys: LandPolygon[] | undefined,
  lat: number,
  lon: number
): GeoPoint {
  if (!pointInLand(polys, lat, lon)) return { lat, lon };
  const stepDeg = 1 / 60; // ~1 nm in latitude
  const lonScale = 1 / Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
  for (let r = 1; r <= 40; r += 1) {
    for (let a = 0; a < 360; a += 24) {
      const rad = (a * Math.PI) / 180;
      const cl = lat + Math.cos(rad) * stepDeg * r;
      const co = lon + Math.sin(rad) * stepDeg * r * lonScale;
      if (!pointInLand(polys, cl, co)) return { lat: cl, lon: co };
    }
  }
  return { lat, lon }; // hemmed in by land on all sides (shouldn't happen at sea)
}

export function pointInLand(polys: LandPolygon[] | undefined, lat: number, lon: number): boolean {
  if (!polys || polys.length === 0) return false;
  const boxes = boxesFor(polys);
  for (let i = 0; i < polys.length; i += 1) {
    const b = boxes[i];
    if (lon < b.minLon || lon > b.maxLon || lat < b.minLat || lat > b.maxLat) continue;
    if (pointInPolygon(polys[i], lon, lat)) return true;
  }
  return false;
}

// Does the straight segment a→b touch land? Samples interior points so a single
// hop can't jump a thin spit. Endpoints are checked by the caller as needed.
export function segmentCrossesLand(
  polys: LandPolygon[] | undefined,
  a: GeoPoint,
  b: GeoPoint,
  samples = 5
): boolean {
  if (!polys || polys.length === 0) return false;
  for (let k = 1; k <= samples; k += 1) {
    const t = k / (samples + 1);
    if (pointInLand(polys, a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t)) {
      return true;
    }
  }
  return false;
}
