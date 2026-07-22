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

// ---- Wind-band ("Triple Number") scoring ------------------------------------
//
// Real ORC publishes THREE numbers per boat — a light/medium/heavy-air rating —
// because a hull's handicap isn't a single figure: a stiff heavy-air boat is
// quick when it honks and slow in the drifter; a tender light-air flyer is the
// reverse. Our PARAMETRIC polar can't express that — it scales every hull's speed
// by the same wind response, so a polar-derived band comes out identically 1.0
// (verified). So the band is carried by FIXED per-boat DATA instead: the boat's
// `stability`. Stiff boats (high stability) rate UP in a blow — it's their
// weather, so they owe more — and DOWN in light air (handed a break); tender
// boats the other way. This MULTIPLIES the base rating and is exactly 1.0 at the
// medium band, so at 12 kn corrected time is unchanged (backward compatible).
//
// It is a RATING-ONLY effect: the speed model never sees it, so the determinism
// contract (the player's sailed trajectory) is untouched — only corrected
// standings move. The reference-class AI fleet sits at the neutral stability, so
// its band ≈ 1.0 at every wind; the band adjudicates the PLAYER's boat character
// against the fleet, which is what makes choosing a boat for the expected weather
// a real tactical call.

// The neutral pivot — the reference hull's stability (boat-corsair). A boat here
// gets no wind-band shift at any wind.
const BAND_STIFF_REF = 68;
// Stability points per unit of "stiffness"; spans the catalogue (45..92) to ~±1.
const BAND_STIFF_SCALE = 24;
// How hard the band bites: at full stiffness (±1) and the wind-delta cap the
// rating shifts ~±8%. A modest, playtest-tunable first cut — tune it here.
const BAND_STRENGTH = 0.1;

// The wind-band multiplier on a boat's base rating at a race's characteristic
// wind. 1.0 at the medium anchor (12 kn) and for a neutral-stability hull. Pure,
// draw-free — a fixed function of the boat's stability and the quoted wind.
export function windBandMultiplier(boat: Boat, twsKn: number): number {
  const stiffness = clamp((boat.stability - BAND_STIFF_REF) / BAND_STIFF_SCALE, -1.2, 1.2);
  // Wind relative to the medium anchor, capped so a screaming gale or a glass-off
  // can't run the multiplier away.
  const windDelta = clamp((twsKn - ORC_BASE_TWS) / ORC_BASE_TWS, -0.6, 0.8);
  return 1 + BAND_STRENGTH * stiffness * windDelta;
}
