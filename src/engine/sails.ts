import { Boat, BoatPolar, FleetBoat, Sail } from '../types';
import { availableSailsFor, getSailById, isWorkingSail, WORKING_SAILS } from '../data/sails';
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

// How hard the wrong sail bites: a specialist flown at the far edge of (or
// outside) its envelope pulls the boat BELOW its base polar — a kite up in the
// wrong breeze isn't merely "no bonus", it's bad shape, chafe and a nervous
// helm. Quadratic in the coverage shortfall so the near-envelope zone stays
// gentle (a sail an honest few degrees off its band is roughly base) while a
// gross mismatch costs real pace. Tuned with the manoeuvre costs to the balance
// target: a mismanaged race loses places, it doesn't retire.
const OUT_OF_BOX_PENALTY = 0.12;

// The speed multiplier of the sail actually FLYING at a point — the racing
// spine of the sail-change feature. The working set (or no sail state at all)
// is exactly 1: the base polar, byte-identical to the pre-wardrobe boat. A
// specialist earns its boost by coverage and pays the out-of-box penalty as
// coverage collapses.
export function flownSailMul(sail: Sail | undefined, twaDeg: number, twsKn: number): number {
  if (!sail || sail.boost <= 0) return 1;
  const cov = sailCoverage(sail, twaDeg, twsKn);
  const shortfall = 1 - cov;
  return 1 + sail.boost * cov - OUT_OF_BOX_PENALTY * shortfall * shortfall;
}

// The wardrobe a boat races with: the indestructible working set, plus its
// specialists — a custom build's purchased sails, or (free, per the class) the
// catalogue boat's class wardrobe. Order is stable: working set first, then
// specialists in catalogue order, so pickers and tests agree.
export function raceWardrobe(boat: Boat): Sail[] {
  const fleetBoat = boat as FleetBoat;
  const specialists = fleetBoat.custom
    ? resolveSails(fleetBoat.sails ?? [])
    : boat.boatType
      ? availableSailsFor(boat.boatType)
      : [];
  return [...WORKING_SAILS, ...specialists];
}

// The best multiplier any sail aboard could earn at this point — the yardstick
// for "was the right canvas up?" (never below 1: the working set always lays
// that floor).
export function bestWardrobeMul(
  wardrobe: Sail[],
  twaDeg: number,
  twsKn: number,
  unavailable?: string[]
): number {
  let best = 1;
  for (const sail of wardrobe) {
    if (unavailable?.includes(sail.id)) continue;
    const mul = flownSailMul(sail, twaDeg, twsKn);
    if (mul > best) best = mul;
  }
  return best;
}

export { isWorkingSail };

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
