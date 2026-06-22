import { Boat, GeoPoint, RoutingBias, Waypoint, WindField } from '../types';
import { angularDelta, bearing, haversineNm, movePoint } from './geo';
import { polarSpeed } from './polar';
import { sampleWind } from './wind';
import { LandPolygon } from '../data/landmasses';
import { pointInLand, segmentCrossesLand } from './land';

interface RNode {
  lat: number;
  lon: number;
  parent: RNode | null;
}

const HEADING_SPREAD = 100; // degrees either side of the bearing to the mark
const HEADING_STEP = 10;
const MAX_STEPS = 48;
const SECTOR_DEG = 3;
const MAX_FRONTIER = 90;

// Keep only the leading edge of the frontier: bucket nodes by their bearing
// from the leg start and keep, per bucket, the one closest to the destination.
function pruneFrontier(nodes: RNode[], from: GeoPoint, to: GeoPoint): RNode[] {
  const buckets = new Map<number, RNode>();
  for (const node of nodes) {
    const brg = bearing(from.lat, from.lon, node.lat, node.lon);
    const key = Math.round(brg / SECTOR_DEG);
    const dist = haversineNm(node.lat, node.lon, to.lat, to.lon);
    const existing = buckets.get(key);
    if (!existing || dist < haversineNm(existing.lat, existing.lon, to.lat, to.lon)) {
      buckets.set(key, node);
    }
  }
  const pruned = [...buckets.values()];
  // Cap the frontier by keeping those nearest the destination.
  if (pruned.length > MAX_FRONTIER) {
    pruned.sort(
      (a, b) =>
        haversineNm(a.lat, a.lon, to.lat, to.lon) - haversineNm(b.lat, b.lon, to.lat, to.lon)
    );
    pruned.length = MAX_FRONTIER;
  }
  return pruned;
}

function backtrack(node: RNode, to: GeoPoint): GeoPoint[] {
  const path: GeoPoint[] = [];
  let cur: RNode | null = node;
  while (cur) {
    path.push({ lat: cur.lat, lon: cur.lon });
    cur = cur.parent;
  }
  path.reverse();
  const last = path[path.length - 1];
  if (haversineNm(last.lat, last.lon, to.lat, to.lon) > 0.05) {
    path.push({ lat: to.lat, lon: to.lon });
  }
  return path;
}

// Time-optimal route for a single leg using the isochrone method. The boat
// cannot sail inside its no-go zone, so legs to windward emerge as tacks; the
// evolving wind field bends the route and forces extra tacks on a shift.
export function isochroneLeg(
  boat: Boat,
  field: WindField,
  from: GeoPoint,
  to: GeoPoint,
  startHours: number,
  land?: LandPolygon[]
): GeoPoint[] {
  const direct = haversineNm(from.lat, from.lon, to.lat, to.lon);
  if (direct < 2) return [from, to];

  const dt = Math.max(0.05, Math.min(4, direct / boat.baseSpeed / 22));
  let frontier: RNode[] = [{ lat: from.lat, lon: from.lon, parent: null }];

  // The autopilot routes on the wind as it is *now* (a snapshot), not how it
  // will evolve — leaving room for the player to out-think it with the bias dial.
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const next: RNode[] = [];

    for (const node of frontier) {
      const wind = sampleWind(field, node.lat, node.lon, startHours);
      const brgDest = bearing(node.lat, node.lon, to.lat, to.lon);
      for (let h = -HEADING_SPREAD; h <= HEADING_SPREAD; h += HEADING_STEP) {
        const heading = (brgDest + h + 360) % 360;
        const twa = angularDelta(heading, wind.fromDeg);
        const sp = polarSpeed(boat, twa, wind.speedKn);
        if (sp <= 0.2) continue;
        const p = movePoint(node.lat, node.lon, heading, sp * dt);
        // Stay in navigable water: reject a hop that ends on, or crosses, land.
        if (land && (pointInLand(land, p.lat, p.lon) || segmentCrossesLand(land, node, p))) {
          continue;
        }
        next.push({ lat: p.lat, lon: p.lon, parent: node });
      }
    }
    if (next.length === 0) break;

    frontier = pruneFrontier(next, from, to);

    // Can any frontier node fetch the mark within the next step?
    for (const node of frontier) {
      const d = haversineNm(node.lat, node.lon, to.lat, to.lon);
      const wind = sampleWind(field, node.lat, node.lon, startHours);
      const brg = bearing(node.lat, node.lon, to.lat, to.lon);
      const sp = polarSpeed(boat, angularDelta(brg, wind.fromDeg), wind.speedKn);
      if (sp > 0.2 && d <= sp * dt * 1.1 && !segmentCrossesLand(land, node, to)) {
        return backtrack(node, to);
      }
    }
  }

  // Fallback: take whichever node ended up closest to the mark.
  let bestNode = frontier[0];
  let bestDist = Infinity;
  for (const node of frontier) {
    const d = haversineNm(node.lat, node.lon, to.lat, to.lon);
    if (d < bestDist) {
      bestDist = d;
      bestNode = node;
    }
  }
  return bestNode ? backtrack(bestNode, to) : [from, to];
}

// A cheap detour anchor that clears land between `from` and `to`: probe points
// perpendicular to the rhumb line at a few positions and offsets, both sides,
// and return the first that puts both halves of the leg in open water.
function findClearDetour(
  from: GeoPoint,
  to: GeoPoint,
  land: LandPolygon[]
): GeoPoint | null {
  const legDist = haversineNm(from.lat, from.lon, to.lat, to.lon);
  const brg = bearing(from.lat, from.lon, to.lat, to.lon);
  for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const aLat = from.lat + (to.lat - from.lat) * t;
    const aLon = from.lon + (to.lon - from.lon) * t;
    for (let off = legDist * 0.12; off <= legDist * 0.9; off += legDist * 0.12) {
      for (const side of [1, -1]) {
        const c = movePoint(aLat, aLon, (brg + side * 90 + 360) % 360, off);
        if (
          !pointInLand(land, c.lat, c.lon) &&
          !segmentCrossesLand(land, from, c) &&
          !segmentCrossesLand(land, c, to)
        ) {
          return c;
        }
      }
    }
  }
  return null;
}

// A light, land-aware connector for an onward leg (one the boat hasn't reached
// yet): a rhumb line, detoured around any land it would cross. Cheaper than a
// full isochrone search — fine for the course *preview*, since each onward leg
// is re-routed properly (isochrone) once the boat rounds into it. Returns the
// points after `from`, up to and including `to`.
function coastalLeg(
  from: GeoPoint,
  to: GeoPoint,
  land: LandPolygon[] | undefined,
  depth = 0
): GeoPoint[] {
  if (!land || !segmentCrossesLand(land, from, to)) return [to];
  if (depth >= 3) return [to]; // give up rather than loop on awkward geometry
  const cand = findClearDetour(from, to, land);
  if (!cand) return [to];
  return [...coastalLeg(from, cand, land, depth + 1), ...coastalLeg(cand, to, land, depth + 1)];
}

// The active leg: weather-route from the current position to the next mark.
// `bias` lets the player commit to a side of the course — the leg is then routed
// via a strategic waypoint offset perpendicular to the rhumb line (kept in open
// water), so the boat banks left (-1) or right (+1) and lives with the wind it
// finds there. Returns the polyline from `from` through to `dest`.
function activeLeg(
  boat: Boat,
  field: WindField,
  from: GeoPoint,
  dest: GeoPoint,
  startHours: number,
  bias: RoutingBias,
  land?: LandPolygon[]
): GeoPoint[] {
  let strategic: GeoPoint | null = null;
  if (bias !== 0) {
    const legDist = haversineNm(from.lat, from.lon, dest.lat, dest.lon);
    const courseBearing = bearing(from.lat, from.lon, dest.lat, dest.lon);
    const midLat = from.lat + (dest.lat - from.lat) * 0.45;
    const midLon = from.lon + (dest.lon - from.lon) * 0.45;
    const maxOffset = Math.max(5, Math.min(legDist * 0.18, 60));
    for (let off = maxOffset; off >= 5; off -= maxOffset / 4) {
      const cand = movePoint(midLat, midLon, courseBearing + bias * 90, off);
      if (!pointInLand(land, cand.lat, cand.lon) && !segmentCrossesLand(land, { lat: midLat, lon: midLon }, cand)) {
        strategic = cand;
        break;
      }
    }
  }
  if (!strategic) return isochroneLeg(boat, field, from, dest, startHours, land);
  const toStrategic = isochroneLeg(boat, field, from, strategic, startHours, land);
  const toMark = isochroneLeg(boat, field, strategic, dest, startHours, land);
  return [...toStrategic, ...toMark.slice(1)];
}

// Plan the remaining route: weather-route the active leg (current position to
// the next mark, banked by `bias`), then weather-route each remaining mandatory
// leg too, so the whole course preview stays in navigable water rather than
// rhumb-lining straight across headlands and islands. Onward legs route on a
// rough forward estimate of the clock and refine as the boat reaches them. Marks
// stay fixed by the rules. Re-routing is throttled by the caller, so routing
// every leg here stays cheap in real time.
export function planRoute(
  boat: Boat,
  field: WindField,
  from: GeoPoint,
  marks: Waypoint[],
  nextMarkIndex: number,
  startHours: number,
  bias: RoutingBias = 0,
  land?: LandPolygon[]
): GeoPoint[] {
  if (nextMarkIndex >= marks.length) return [from];
  const next = marks[nextMarkIndex];
  const dest = { lat: next.lat, lon: next.lon };

  const pts = activeLeg(boat, field, from, dest, startHours, bias, land);

  // Onward legs are a land-aware preview (cheap), refined to a full isochrone
  // when the boat actually rounds into them.
  let cur = dest;
  for (let i = nextMarkIndex + 1; i < marks.length; i += 1) {
    const to = { lat: marks[i].lat, lon: marks[i].lon };
    pts.push(...coastalLeg(cur, to, land));
    cur = to;
  }
  return pts;
}
