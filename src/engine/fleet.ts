import { Boat, Competitor, GeoPoint, Race, RaceDivision, WindField } from '../types';
import { bearing, pointAtFraction } from './geo';
import { bestVmgAngles, polarSpeed } from './polar';
import { pressureHint, sampleWind } from './wind';
import { rnd, rndRange } from './rng';

// Evocative yacht names for the AI fleet.
const NAMES = [
  'Rán', 'Comanche', 'Leopard', 'Wild Oats', 'Pyewacket', 'Bella Mente',
  'Maserati', 'Scallywag', 'Black Jack', 'Caro', 'Proteus', 'Warrior',
  'Spookie', 'Tala', 'Hypr', 'Jolt', 'Teasing Machine', 'Caravelle',
  'Aragon', 'Lucky', 'Beau Geste', 'Varuna', 'Triple Lindy', 'Privateer',
  'Zephyr', 'Halcyon', 'Defiance', 'Mistral II', 'Northern Child', 'Whisper',
  'Tigris', 'Kestrel', 'Audacious', 'Corsair', 'Vela', 'Helios',
];

// Roughly-normal draw in [-1, 1] from two uniforms.
function gaussish(): number {
  return rnd() + rnd() - 1;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

// A mid-fleet cruiser-racer's baseline speed: the yardstick a chartered boat is
// measured against for the on-water edge below. (Matches boat-corsair, our
// documented reference.)
const REF_BASE_SPEED = 8.6;

// Build the AI fleet (everyone but the player). Each boat is paced to a target
// finish time built from the race benchmark (a clean run of the player's own
// boat — the SAME tick model the player sails, so difficulty is consistent
// across courses and boats) divided by a per-boat pace multiplier. `benchmarkHours`
// is computed at race setup; without it we fall back to a record-based estimate
// so tests and legacy callers still work.
export function createFleet(
  race: Race,
  division: RaceDivision,
  benchmarkHours?: number,
  playerBoat?: Boat
): Competitor[] {
  const count = Math.max(division.fleetSize - 1, 0);
  const bench = benchmarkHours ?? race.recordTimeHours * 2.4;
  // The benchmark is a bare cruise finish in the player's own boat (see
  // `cleanRunHours`), so the fleet already tracks boat and course. Pace it around
  // the benchmark by division: a Corinthian club fleet sails a touch under
  // benchmark pace, so a clean amateur sail lands upper-mid and a *sharp* one
  // (better crew, more effort, good calls — all faster than the bare benchmark)
  // fights for the podium; the Pro fleet sits right on it, so that sharp sail is
  // the price of contending.
  const pro = division.paceTarget < 1.15;
  const mean = pro ? 1.02 : 0.95;
  // A tight, fast pro fleet; a wider, more mixed club fleet.
  const spread = pro ? 0.1 : 0.14;
  // A modest, bounded on-water edge for the boat you bring: a quicker hull faces
  // a slightly slower-paced fleet (and a slow one a quicker fleet), so chartering
  // up genuinely pays on the water — but only a little, capped at ±~10%, so it
  // never becomes a runaway. Raw speed still pays off most on corrected time,
  // where a fast boat owes its rating. No boat given → no edge (legacy/tests).
  const edge = playerBoat
    ? clamp(1 + (playerBoat.baseSpeed / REF_BASE_SPEED - 1) * 0.4, 0.9, 1.12)
    : 1;
  const pacedBench = bench * edge;
  const fleet: Competitor[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');
    const speedMul = clamp(mean + gaussish() * spread, 0.7, 1.3);
    fleet.push({
      id: `ai-${race.id}-${i}`,
      name,
      speedMul,
      // A faster boat rates higher and so owes more time on handicap — the
      // correlation (<1) means raw pace is mostly, not fully, neutralised, so
      // corrected standings turn on how well a boat sails its rating.
      ratingTcc: clamp(1 + (speedMul - 1) * 0.85 + gaussish() * 0.025, 0.85, 1.45),
      targetHours: pacedBench / speedMul,
      // Each boat commits to a side of the course; combined with the live wind
      // it decides who gains and who loses, so the standings shuffle.
      bias: rndRange(-1, 1),
      distanceNm: 0,
      finishedHours: null,
      retired: false,
    });
  }
  return fleet;
}

// Best speed a boat can make good toward a mark on the given leg bearing, in
// the local wind — straight at the mark, or via the upwind/downwind VMG angle
// when the mark is too close to dead up/down wind to sail at directly.
export function madeGoodSpeed(boat: Boat, legBearing: number, windFromDeg: number, windKn: number): number {
  const twa = Math.abs(((legBearing - windFromDeg + 540) % 360) - 180); // 0..180
  const straight = polarSpeed(boat, twa, windKn); // heading straight at the mark
  const vmg = bestVmgAngles(boat, windKn);
  if (twa < 90) return Math.max(straight, vmg.upVmg);
  return Math.max(straight, vmg.downVmg);
}

// Which side of the course the breeze favours at a point, as a signed scalar in
// roughly [-1, 1] (positive = the right of the rhumb line, negative = left),
// scaled by how pronounced the pressure gradient is. A boat whose bias matches
// this gains; a boat on the wrong side loses.
function favouredSide(
  field: WindField,
  lat: number,
  lon: number,
  hours: number,
  courseAxisDeg: number
): number {
  const hint = pressureHint(field, lat, lon, hours);
  const rel = (((hint.bearing - courseAxisDeg) % 360) + 540) % 360; // 0..360
  const cross = Math.sin((rel - 180) * (Math.PI / 180)); // -1 left .. +1 right
  return cross * (hint.strong ? 1 : 0.5);
}

// Advance every competitor by the time elapsed this step. Each boat holds its
// benchmark pace (course ÷ targetHours), nudged by the local breeze and by
// whether it's on the favoured side — so the field breathes and the standings
// shuffle through the race rather than sitting frozen in pace order. The mean
// nudge is ~1, so the per-boat target pace sets the difficulty. Pure given RNG.
export function advanceFleet(
  fleet: Competitor[],
  race: Race,
  field: WindField,
  startHours: number,
  dtHours: number
): Competitor[] {
  const total = race.distanceNm;
  const start = race.waypoints[0];
  const finish = race.waypoints[race.waypoints.length - 1];
  const axisDeg = bearing(start.lat, start.lon, finish.lat, finish.lon);
  return fleet.map((c) => {
    if (c.retired || c.finishedHours !== null) return c;

    const fraction = clamp(c.distanceNm / total, 0, 1);
    const tp = pointAtFraction(race.waypoints, fraction);
    const wind = sampleWind(field, tp.lat, tp.lon, startHours);
    // Hold the benchmark pace (course ÷ targetHours), nudged only by mean-1
    // factors so the overall difficulty is unchanged: a bonus for backing the
    // favoured side (the tactical shuffle) and a touch of puff luck.
    const pace = total / Math.max(c.targetHours, 1e-6);
    const align = (c.bias ?? 0) * favouredSide(field, tp.lat, tp.lon, startHours, axisDeg);
    const sideBonus = 1 + 0.1 * align;
    const variance = 1 + gaussish() * 0.05;
    const smg = Math.max(pace * sideBonus * variance, 0.2);

    // Rare retirement, more likely when it is blowing hard.
    if (rnd() < 0.00025 * dtHours * (1 + wind.speedKn / 20)) {
      return { ...c, retired: true };
    }

    const advanced = c.distanceNm + smg * dtHours;
    if (advanced >= total) {
      const overshoot = advanced - total;
      const frac = 1 - overshoot / Math.max(smg * dtHours, 1e-6);
      return { ...c, distanceNm: total, finishedHours: startHours + clamp(frac, 0, 1) * dtHours };
    }
    return { ...c, distanceNm: advanced };
  });
}

// The player's live standing: 1 + the number of boats currently ahead.
export function livePosition(fleet: Competitor[], playerDistanceNm: number): number {
  const ahead = fleet.filter((c) => !c.retired && c.distanceNm > playerDistanceNm).length;
  return ahead + 1;
}

// A competitor's elapsed time for handicap purposes: its actual finish if it has
// crossed, else a linear projection from its pace so far — so corrected
// standings can be ranked the moment the player finishes.
function projectedElapsed(c: Competitor, playerElapsedHours: number, totalNm: number): number {
  if (c.finishedHours !== null) return c.finishedHours;
  const covered = Math.max(c.distanceNm, 1e-6);
  return playerElapsedHours * (totalNm / covered);
}

// The player's finish on CORRECTED (handicap) time: rank everyone's
// elapsed × rating. This is the real offshore result — a slower boat that sails
// above its rating beats a faster one that doesn't.
export function correctedPosition(
  fleet: Competitor[],
  totalNm: number,
  playerElapsedHours: number,
  playerTcc: number
): number {
  const playerCorrected = playerElapsedHours * playerTcc;
  const ahead = fleet.filter(
    (c) => !c.retired && projectedElapsed(c, playerElapsedHours, totalNm) * c.ratingTcc < playerCorrected
  ).length;
  return ahead + 1;
}

// Final standing when the player crosses the line: 1 + boats that finished first.
export function finalPosition(fleet: Competitor[], playerElapsedHours: number): number {
  const ahead = fleet.filter((c) => c.finishedHours !== null && c.finishedHours < playerElapsedHours).length;
  return ahead + 1;
}

// Map positions of competitors still on the course, for the chart. Boats are
// shown from the gun (distance 0 = on the start line) so the fleet is visible
// immediately, not only once it has sailed clear of the start.
export function competitorPoints(fleet: Competitor[], race: Race): GeoPoint[] {
  const total = race.distanceNm;
  return fleet
    .filter((c) => !c.retired && c.finishedHours === null)
    .map((c) => {
      const tp = pointAtFraction(race.waypoints, clamp(c.distanceNm / total, 0, 1));
      return { lat: tp.lat, lon: tp.lon };
    });
}
