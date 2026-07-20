// ORC-style handicap, derived from a boat's polar (the engine's VPP).
//
// Real ORC ratings are all reductions of a VPP polar — the same thing `polar.ts`
// already gives us (parametric for catalogue boats, real tables for custom
// builds). So a boat's handicap should be *computed* from that polar, not typed
// by hand. This module does exactly that.
//
// GPH (General Purpose Handicap) is ORC's headline number: the time to sail one
// nautical mile *made good* on a windward/leeward course (50% beat at the boat's
// best upwind VMG, 50% run at its best downwind VMG) in average conditions. It's
// the seconds-per-mile the VPP predicts. Time-on-Time rating then follows ORC's
// own definition — `ToT = base / GPH` — pegged here to a reference cruiser-racer
// so the numbers land in the game's established 0.85–1.45 band and a faster boat
// rates *higher* (it owes its speed back on corrected time), exactly as before.
//
// Pure and draw-free: no RNG, no wind field — a boat's rating is a fixed function
// of its polar, so it never touches the determinism contract.

import { Boat } from '../types';
import { getBoatById } from '../data';
import { bestVmgAngles } from './polar';

const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

// The "average conditions" true wind speed ORC quotes GPH at. (ORC's VPP runs a
// 6/8/10/12/14/16/20 kn grid; 12 kn is the representative middle band and the one
// a single-number rating is anchored to.)
export const ORC_BASE_TWS = 12;

// The rating band the rest of the engine expects (matches the authored catalogue
// ratings and `correctedPosition`'s assumptions).
const RATING_MIN = 0.85;
const RATING_MAX = 1.45;

// The boat the fleet and ratings are measured against (a mid-fleet cruiser-racer;
// the same reference `fleet.ts` uses). Pegging the reference to ~1.0 keeps derived
// ratings comparable to the authored ones.
const REFERENCE_BOAT_ID = 'boat-corsair';

// GPH: seconds to sail one nautical mile made good on a 50/50 windward-leeward
// course at `twsKn`. Lower = faster boat. Pure function of the polar.
export function orcGphSecondsPerMile(boat: Boat, twsKn = ORC_BASE_TWS): number {
  const { upVmg, downVmg } = bestVmgAngles(boat, twsKn);
  // VMG is speed made good toward (up) / away from (down) the wind, in knots; the
  // reciprocal is hours to make good one mile on that leg. A 50/50 W/L course
  // averages the two. Guard against a stalled polar so the reciprocal stays finite.
  const hoursPerMile = 0.5 / Math.max(upVmg, 0.2) + 0.5 / Math.max(downVmg, 0.2);
  return hoursPerMile * 3600;
}

// The reference boat's GPH, computed once. Memoised (pure), so it adds no cost and
// no draws to a race.
let referenceGphCache: number | undefined;
function referenceGph(): number {
  if (referenceGphCache === undefined) {
    const ref = getBoatById(REFERENCE_BOAT_ID);
    referenceGphCache = ref ? orcGphSecondsPerMile(ref) : 600;
  }
  return referenceGphCache;
}

// ORC Time-on-Time rating for a boat: reference GPH / boat GPH, so the reference
// rates ~1.0, a faster boat higher (owes time) and a slower one lower. Clamped to
// the engine's band. `corrected = elapsed × rating` is unchanged — only the source
// of the coefficient is now the polar instead of a hand-typed guess.
export function orcRating(boat: Boat, twsKn = ORC_BASE_TWS): number {
  const gph = orcGphSecondsPerMile(boat, twsKn);
  return clamp(referenceGph() / Math.max(gph, 1), RATING_MIN, RATING_MAX);
}
