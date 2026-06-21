import { Boat, GeoPoint, Waypoint, WindField } from '../types';
import { angularDelta, bearing, haversineNm, movePoint } from './geo';
import { polarSpeed } from './polar';
import { sampleWind } from './wind';

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
  startHours: number
): GeoPoint[] {
  const direct = haversineNm(from.lat, from.lon, to.lat, to.lon);
  if (direct < 2) return [from, to];

  const dt = Math.max(0.05, Math.min(4, direct / boat.baseSpeed / 22));
  let frontier: RNode[] = [{ lat: from.lat, lon: from.lon, parent: null }];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const t = startHours + step * dt;
    const next: RNode[] = [];

    for (const node of frontier) {
      const wind = sampleWind(field, node.lat, node.lon, t);
      const brgDest = bearing(node.lat, node.lon, to.lat, to.lon);
      for (let h = -HEADING_SPREAD; h <= HEADING_SPREAD; h += HEADING_STEP) {
        const heading = (brgDest + h + 360) % 360;
        const twa = angularDelta(heading, wind.fromDeg);
        const sp = polarSpeed(boat, twa, wind.speedKn);
        if (sp <= 0.2) continue;
        const p = movePoint(node.lat, node.lon, heading, sp * dt);
        next.push({ lat: p.lat, lon: p.lon, parent: node });
      }
    }
    if (next.length === 0) break;

    frontier = pruneFrontier(next, from, to);

    // Can any frontier node fetch the mark within the next step?
    for (const node of frontier) {
      const d = haversineNm(node.lat, node.lon, to.lat, to.lon);
      const wind = sampleWind(field, node.lat, node.lon, t + dt);
      const brg = bearing(node.lat, node.lon, to.lat, to.lon);
      const sp = polarSpeed(boat, angularDelta(brg, wind.fromDeg), wind.speedKn);
      if (sp > 0.2 && d <= sp * dt * 1.1) {
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

// Plan the remaining route: isochrone-route the active leg (current position to
// the next mark), then run rhumb lines through the remaining mandatory marks
// (those refine when the boat reaches them). Marks stay fixed by the rules.
export function planRoute(
  boat: Boat,
  field: WindField,
  from: GeoPoint,
  marks: Waypoint[],
  nextMarkIndex: number,
  startHours: number
): GeoPoint[] {
  if (nextMarkIndex >= marks.length) return [from];
  const next = marks[nextMarkIndex];
  const leg = isochroneLeg(boat, field, from, { lat: next.lat, lon: next.lon }, startHours);
  const rest: GeoPoint[] = marks
    .slice(nextMarkIndex + 1)
    .map((m) => ({ lat: m.lat, lon: m.lon }));
  return [...leg, ...rest];
}
