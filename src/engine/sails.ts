import { BoatPolar, Sail } from '../types';
import { getSailById } from '../data/sails';
import { computeTargets } from './polarTable';
import { angularDelta } from './geo';

// How far outside its envelope a sail still contributes, before its lift tapers
// to zero. Wider on the angle axis (trim covers a broad arc) than on wind.
const ANGLE_FALLOFF = 22; // degrees
const WIND_FALLOFF = 6; // knots

// Coverage of a sail at a wind angle/speed: 1 inside its envelope, tapering
// linearly to 0 across the falloff margins, separable in angle and wind.
export function sailCoverage(sail: Sail, twaDeg: number, twsKn: number): number {
  const twa = angularDelta(twaDeg, 0); // fold to 0..180
  const dA = Math.max(sail.twaMin - twa, twa - sail.twaMax, 0);
  const dW = Math.max(sail.twsMin - twsKn, twsKn - sail.twsMax, 0);
  const a = Math.max(0, 1 - dA / ANGLE_FALLOFF);
  const w = Math.max(0, 1 - dW / WIND_FALLOFF);
  return a * w;
}

// The multiplier the carried wardrobe applies on top of the base polar at a
// given point: 1 plus the best single specialist sail's lift there. Sails do
// not stack — the crew flies the one best suited to the conditions.
export function wardrobeMultiplier(sails: Sail[], twaDeg: number, twsKn: number): number {
  let best = 0;
  for (const sail of sails) {
    const lift = sail.boost * sailCoverage(sail, twaDeg, twsKn);
    if (lift > best) best = lift;
  }
  return 1 + best;
}

// The specialist sail doing the most work at a point, if any — for UI readouts.
export function bestSailAt(sails: Sail[], twaDeg: number, twsKn: number): Sail | null {
  let best: Sail | null = null;
  let bestLift = 1e-6;
  for (const sail of sails) {
    const lift = sail.boost * sailCoverage(sail, twaDeg, twsKn);
    if (lift > bestLift) {
      bestLift = lift;
      best = sail;
    }
  }
  return best;
}

function resolveSails(ownedSailIds: string[]): Sail[] {
  return ownedSailIds
    .map((id) => getSailById(id))
    .filter((s): s is Sail => Boolean(s));
}

// Cache derived polars by base-polar object + sorted sail signature so the race
// loop (which re-resolves the boat each step) doesn't recompute every tick.
const cache = new WeakMap<BoatPolar, Map<string, BoatPolar>>();

// The boat's effective polar with its specialist sails flown: the base table
// lifted cell-by-cell by the wardrobe, with VMG targets recomputed. With no
// specialist sails it is the base polar, unchanged.
export function effectivePolar(base: BoatPolar, ownedSailIds?: string[]): BoatPolar {
  if (!ownedSailIds || ownedSailIds.length === 0) return base;
  const sails = resolveSails(ownedSailIds);
  if (sails.length === 0) return base;

  const key = [...ownedSailIds].sort().join(',');
  let perBase = cache.get(base);
  if (!perBase) {
    perBase = new Map();
    cache.set(base, perBase);
  }
  const hit = perBase.get(key);
  if (hit) return hit;

  const speed = base.twa.map((twa, ti) =>
    base.tws.map((tws, wi) => {
      const lifted = base.speed[ti][wi] * wardrobeMultiplier(sails, twa, tws);
      return Math.round(lifted * 100) / 100;
    })
  );
  const polar: BoatPolar = {
    tws: [...base.tws],
    twa: [...base.twa],
    speed,
    targets: { beatAngle: [], beatSpeed: [], runAngle: [], runSpeed: [] },
    source: base.source,
    importedFrom: base.importedFrom,
  };
  polar.targets = computeTargets(polar);
  perBase.set(key, polar);
  return polar;
}
