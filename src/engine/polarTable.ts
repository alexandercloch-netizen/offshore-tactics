import { BoatPolar, PolarTargets } from '../types';
import { angularDelta } from './geo';

const toRad = (deg: number): number => (deg * Math.PI) / 180;

// Find the bracketing index and blend fraction for `value` in an ascending
// array, clamping at both ends.
function bracket(arr: number[], value: number): { i: number; frac: number } {
  if (value <= arr[0]) return { i: 0, frac: 0 };
  const last = arr.length - 1;
  if (value >= arr[last]) return { i: last - 1 < 0 ? 0 : last - 1, frac: last - 1 < 0 ? 0 : 1 };
  let i = 0;
  while (i < last && arr[i + 1] < value) i += 1;
  const span = arr[i + 1] - arr[i] || 1;
  return { i, frac: (value - arr[i]) / span };
}

// Bilinear lookup of boat speed at a given TWA/TWS. Returns 0 inside the no-go
// zone (below the first TWA row, where the table has no data).
export function interpolatePolar(polar: BoatPolar, twaDeg: number, twsKn: number): number {
  const twa = angularDelta(twaDeg, 0); // fold to 0..180
  if (twa < polar.twa[0] - 0.001) return 0;

  const a = bracket(polar.twa, twa);
  const w = bracket(polar.tws, twsKn);
  const s = polar.speed;
  const s00 = s[a.i][w.i];
  const s01 = s[a.i][w.i + 1] ?? s00;
  const s10 = s[a.i + 1]?.[w.i] ?? s00;
  const s11 = s[a.i + 1]?.[w.i + 1] ?? s01;
  const top = s00 + (s01 - s00) * w.frac;
  const bot = s10 + (s11 - s10) * w.frac;
  return Math.max(top + (bot - top) * a.frac, 0);
}

// Per-TWS optimum upwind (beat) and downwind (run) VMG angles & speeds, found
// by scanning the polar at 1° resolution.
export function computeTargets(polar: BoatPolar): PolarTargets {
  const beatAngle: number[] = [];
  const beatSpeed: number[] = [];
  const runAngle: number[] = [];
  const runSpeed: number[] = [];
  const lo = polar.twa[0];

  polar.tws.forEach((tws) => {
    let bestUp = -Infinity;
    let bestDown = -Infinity;
    let upA = lo;
    let upS = 0;
    let downA = 180;
    let downS = 0;
    for (let twa = Math.floor(lo); twa <= 180; twa += 1) {
      const sp = interpolatePolar(polar, twa, tws);
      const vmgUp = sp * Math.cos(toRad(twa));
      const vmgDown = -sp * Math.cos(toRad(twa));
      if (twa < 90 && vmgUp > bestUp) {
        bestUp = vmgUp;
        upA = twa;
        upS = sp;
      }
      if (twa > 90 && vmgDown > bestDown) {
        bestDown = vmgDown;
        downA = twa;
        downS = sp;
      }
    }
    beatAngle.push(upA);
    beatSpeed.push(Math.round(upS * 100) / 100);
    runAngle.push(downA);
    runSpeed.push(Math.round(downS * 100) / 100);
  });

  return { beatAngle, beatSpeed, runAngle, runSpeed };
}

// Smallest beat angle across the table — the boat's effective no-go.
export function polarNoGo(polar: BoatPolar): number {
  return Math.min(...polar.targets.beatAngle, polar.twa[0]);
}

// Interpolated best VMG angles/speeds at a wind speed.
export function polarBestVmg(
  polar: BoatPolar,
  twsKn: number
): { upAngle: number; downAngle: number; upVmg: number; downVmg: number } {
  const w = bracket(polar.tws, twsKn);
  const blend = (arr: number[]) => {
    const next = arr[w.i + 1] ?? arr[w.i];
    return arr[w.i] + (next - arr[w.i]) * w.frac;
  };
  const t = polar.targets;
  const upAngle = blend(t.beatAngle);
  const downAngle = blend(t.runAngle);
  return {
    upAngle,
    downAngle,
    upVmg: blend(t.beatSpeed) * Math.cos(toRad(upAngle)),
    downVmg: -blend(t.runSpeed) * Math.cos(toRad(downAngle)),
  };
}
