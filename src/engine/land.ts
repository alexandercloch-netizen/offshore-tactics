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

// Coastline detail is far finer than routing granularity, so for point tests we
// use a decimated copy of each ring (every Nth vertex) — a big ray-cast saving
// on large landmasses with no meaningful accuracy loss. The detailed polygons
// are still used for drawing the chart.
const DECIMATE = 3;
const simplifiedCache = new WeakMap<LandPolygon[], LandPolygon[]>();

function decimateRing(ring: [number, number][]): [number, number][] {
  if (ring.length <= 8) return ring;
  const out: [number, number][] = [];
  for (let i = 0; i < ring.length; i += DECIMATE) out.push(ring[i]);
  const last = ring[ring.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function simplifiedFor(polys: LandPolygon[]): LandPolygon[] {
  const cached = simplifiedCache.get(polys);
  if (cached) return cached;
  const simple = polys.map((poly) => poly.map(decimateRing));
  simplifiedCache.set(polys, simple);
  return simple;
}

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

// Ray-casting point-in-ring; ring points are [lon, lat].
function pointInRing(ring: [number, number][], lon: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
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
export function pointInLand(polys: LandPolygon[] | undefined, lat: number, lon: number): boolean {
  if (!polys || polys.length === 0) return false;
  const boxes = boxesFor(polys);
  const simple = simplifiedFor(polys);
  for (let i = 0; i < simple.length; i += 1) {
    const b = boxes[i];
    if (lon < b.minLon || lon > b.maxLon || lat < b.minLat || lat > b.maxLat) continue;
    if (pointInPolygon(simple[i], lon, lat)) return true;
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
