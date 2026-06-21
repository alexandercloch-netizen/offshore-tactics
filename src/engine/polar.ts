import { Boat, FleetBoat } from '../types';
import { angularDelta } from './geo';
import { interpolatePolar, polarBestVmg, polarNoGo } from './polarTable';

// A custom boat carries its own polar table; catalogue boats use the
// parametric model below.
function asFleetBoat(boat: Boat): FleetBoat | null {
  return (boat as FleetBoat).polar ? (boat as FleetBoat) : null;
}

// Multiplicative performance scaling (PredictWind-style), chosen by point of sail.
function adjustmentFactor(fleet: FleetBoat, twaDeg: number): number {
  const adj = fleet.speedAdjustment;
  if (!adj) return 1;
  const a = angularDelta(twaDeg, 0);
  const pct = a < 90 ? adj.upwindPct : adj.downwindPct;
  return Math.max(0, pct) / 100;
}

// A boat's polar diagram: speed as a function of true wind angle (TWA, the
// angle between the boat's heading and where the wind blows FROM) and true wind
// speed (TWS). Derived from the boat's baseSpeed / upwind / downwind / stability
// ratings rather than stored per boat.

const toRad = (deg: number): number => (deg * Math.PI) / 180;

// The closest a boat can sail to the wind. Better-pointing boats get a tighter
// no-go zone (~30°); poor pointers ~42°.
export function noGoAngle(boat: Boat): number {
  const fleet = asFleetBoat(boat);
  if (fleet) return polarNoGo(fleet.polar);
  return 30 + (100 - boat.upwind) * 0.12;
}

// How the boat responds to wind strength: slow in light air, building through
// the mid-range, de-powering in a gale (worse for less stable boats).
function windResponse(boat: Boat, twsKn: number): number {
  const ramp = Math.pow(Math.min(twsKn, 14) / 14, 0.6); // 0..1 by ~14 kn
  let r = 0.2 + 0.8 * ramp;
  if (twsKn > 14) r += Math.min((twsKn - 14) / 14, 1) * 0.18; // extra in breeze
  if (twsKn > 26) r -= (twsKn - 26) * 0.02 * (1 - boat.stability / 200);
  return Math.max(0.12, Math.min(1.25, r));
}

// Shape factor (0..~1.06) for the angle, independent of wind strength.
function angleShape(boat: Boat, twa: number): number {
  if (twa <= 90) {
    const ng = noGoAngle(boat);
    const t = (twa - ng) / (90 - ng); // 0 at no-go, 1 at beam
    const low = 0.55 + 0.35 * (boat.upwind / 100);
    return low + (1 - low) * Math.pow(Math.max(t, 0), 0.8);
  }
  const t = (twa - 90) / 90; // 0 at beam, 1 at dead run
  const runFactor = 0.62 + 0.33 * (boat.downwind / 100); // run speed vs reach
  const reachBump = 1 + 0.06 * Math.sin(Math.PI * t); // broad-reach sweet spot
  return (1 + (runFactor - 1) * Math.pow(t, 1.3)) * reachBump;
}

// Boat speed (knots) at a given heading relative to the wind. `twaDeg` may be
// any signed angle; it is folded into the 0..180 range. Custom boats read their
// polar table; catalogue boats use the parametric model.
export function polarSpeed(boat: Boat, twaDeg: number, twsKn: number): number {
  const angle = angularDelta(twaDeg, 0);
  const fleet = asFleetBoat(boat);
  if (fleet) {
    return interpolatePolar(fleet.polar, angle, twsKn) * adjustmentFactor(fleet, angle);
  }
  if (angle < noGoAngle(boat)) return 0;
  return boat.baseSpeed * windResponse(boat, twsKn) * angleShape(boat, angle);
}

export interface VmgAngles {
  upAngle: number; // best TWA upwind
  downAngle: number; // best TWA downwind
  upVmg: number;
  downVmg: number;
}

// The angles that maximise velocity-made-good up and down wind, found by
// scanning the polar.
export function bestVmgAngles(boat: Boat, twsKn: number): VmgAngles {
  const fleet = asFleetBoat(boat);
  if (fleet) return polarBestVmg(fleet.polar, twsKn);
  let upAngle = 45;
  let downAngle = 150;
  let upVmg = -Infinity;
  let downVmg = -Infinity;
  for (let twa = 0; twa <= 180; twa += 1) {
    const sp = polarSpeed(boat, twa, twsKn);
    const projection = sp * Math.cos(toRad(twa));
    if (twa < 90 && projection > upVmg) {
      upVmg = projection;
      upAngle = twa;
    }
    if (twa > 90 && -projection > downVmg) {
      downVmg = -projection;
      downAngle = twa;
    }
  }
  return { upAngle, downAngle, upVmg, downVmg };
}
