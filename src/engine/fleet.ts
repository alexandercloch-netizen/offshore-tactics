import { Boat, Competitor, GeoPoint, Race, RaceDivision, TidalField, WindField } from '../types';
import { angularDelta, bearing, movePoint, pointAtFraction } from './geo';
import { bestVmgAngles, polarSpeed } from './polar';
import { pressureHint, sampleWind } from './wind';
import { TIDE_FLOOR_KN, tideAlong } from './current';
import { clearPolyline } from './router';
import { snapToWater } from './land';
import { LANDMASSES } from '../data/landmasses';
import { getBoatById } from '../data';
import { rnd, rndRange } from './rng';

// The course "spine": a land-safe polyline through the marks (the rhumb line
// detoured around any coast). The fleet rides this instead of the straight rhumb
// between marks, so its boats follow the coast around an island rather than
// cutting across it. Computed once per race (static geometry) and cached.
const coursePathCache = new Map<string, GeoPoint[]>();
function coursePath(race: Race): GeoPoint[] {
  const cached = coursePathCache.get(race.id);
  if (cached) return cached;
  const rhumb = race.waypoints.map((w) => ({ lat: w.lat, lon: w.lon }));
  const path = clearPolyline(rhumb, LANDMASSES[race.id]);
  coursePathCache.set(race.id, path);
  return path;
}

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

// The reference hull whose polar shapes the fleet's response to the local wind
// (it only sets the *relative* surge/stall — see `windFactor` — so its exact
// numbers wash out). A plain fallback keeps the engine pure if the catalogue
// lookup ever misses.
const REF_BOAT: Boat =
  getBoatById('boat-corsair') ??
  ({
    id: 'ref',
    name: 'Reference',
    className: 'ref',
    description: '',
    baseSpeed: REF_BASE_SPEED,
    upwind: 70,
    downwind: 70,
    stability: 70,
    crewCapacity: 8,
    price: 0,
  } as Boat);

// How far off the rhumb line a fully-committed boat sails, so the fleet spreads
// across the course (lateral leverage) instead of stacking on one line.
const LEVERAGE_FRACTION = 0.05;
const LEVERAGE_CAP_NM = 30;

// The racing-friction allowance on the fleet's pace. The benchmark (`cleanRunHours`)
// sails a clean CRUISE with wear but pays NONE of the friction a real race forces
// on the player: time lost to tactical decisions/events, the cost of every sail
// change, the extra wear of pushing. The AI, in turn, is advanced on a smooth
// made-good line (`advanceFleet`) that never fires an event, never changes a sail
// and never wears from effort. Paced to a *frictionless* benchmark, the tight Pro
// fleet was uncatchable even sailing a flawless race — reproduced back-third to
// last on Chicago-Mac (Pro) despite the right sail up 93% of the time, ~6–21% of
// race time adrift. This allowance restores the missing tax so "par" is a clean
// run *in an actual race*: a well-sailed Pro race lands mid-fleet and sharp play
// (effort + calls + sail work) fights for the podium. It is division-keyed on
// purpose — the loose, slower Corinthian fleet (mean 0.95, spread 0.14) already
// absorbs the friction and races fair at 1.0 (the Round-Island and Sydney–Hobart
// goldens confirm it), so only the tight Pro fleet needs the lift. Multiplies each
// course's own benchmark, so it self-calibrates per race/boat/crew and carries to
// any future race for free. A finer per-source friction model, and damping the
// seed-to-seed side-lottery that still swings a good race between 1st and last,
// are framework follow-ups; this is the honest first cut — tune it here.
const FLEET_FRICTION: { pro: number; corinthian: number } = { pro: 1.1, corinthian: 1.0 };

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
  const pro = division.paceTarget < 1.15;
  // The benchmark is a bare cruise finish in the player's own boat (see
  // `cleanRunHours`), so the fleet already tracks boat and course — but a bare
  // cruise pays none of a real race's friction (decisions, sail changes, effort
  // wear), so pad par by the division's racing-friction allowance before pacing
  // the fleet off it (see FLEET_FRICTION).
  const bench = (benchmarkHours ?? race.recordTimeHours * 2.4) * (pro ? FLEET_FRICTION.pro : FLEET_FRICTION.corinthian);
  // Pace the fleet around that padded benchmark by division: a Corinthian club
  // fleet sails a touch under benchmark pace, so a clean amateur sail lands
  // upper-mid and a *sharp* one (better crew, more effort, good calls — all faster
  // than the bare benchmark) fights for the podium; the Pro fleet sits right on it,
  // so that sharp sail is the price of contending.
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
  // The fleet are reference-class boats paced to the player's run, so their
  // handicaps centre on what the player's boat rates after backing out that
  // on-water edge — which makes corrected (handicap) time a fair fight whatever
  // you charter: a quicker hull leads across the line but owes the lead back on
  // rating, exactly as a handicap intends. You win corrected by sailing above
  // your rating (sharper crew, harder effort, better calls), not by buying speed.
  const playerTcc = playerBoat?.ratingTcc ?? 1;
  const fleetBaseTcc = playerTcc / edge;
  const fleet: Competitor[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');
    const speedMul = clamp(mean + gaussish() * spread, 0.7, 1.3);
    fleet.push({
      id: `ai-${race.id}-${i}`,
      name,
      speedMul,
      // Centred on the fleet's reference rating, nudged by pace: a faster boat in
      // the fleet rates higher and owes more, but the <1 correlation means raw
      // pace is only mostly neutralised — so corrected standings still turn on
      // how well each boat sails its rating, and the order shuffles.
      ratingTcc: clamp(fleetBaseTcc * (1 + (speedMul - 1) * 0.85) + gaussish() * 0.03, 0.7, 1.6),
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
  const twa = angularDelta(legBearing, windFromDeg); // 0..180
  const straight = polarSpeed(boat, twa, windKn); // heading straight at the mark
  const vmg = bestVmgAngles(boat, windKn);
  if (twa < 90) return Math.max(straight, vmg.upVmg);
  return Math.max(straight, vmg.downVmg);
}

// The reference boat's tide-FREE made-good finish over this course and wind
// field, sailing the rhumb line (bias 0). It's the yardstick that turns a boat's
// target finish into a `paceScale`: scaling the reference polar's *absolute*
// made-good speed by `benchMG / targetHours` lands the tide-free finish exactly
// on target (so the tuned difficulty is preserved), while leaving the speed free
// to swing with the real wind — light air slows the boat, pressure lifts it —
// exactly as the player's does. Matching that swing is what lets the tide cancel
// in the standings. Time advances as we integrate, so the wind evolves underfoot.
function refMadeGoodHours(race: Race, field: WindField): number {
  const total = race.distanceNm;
  const step = Math.max(total / 120, 0.5);
  let dist = 0;
  let t = 0;
  for (let guard = 0; dist < total && guard < 5000; guard += 1) {
    const frac = clamp(dist / total, 0, 1);
    const base = pointAtFraction(race.waypoints, frac);
    const ahead = pointAtFraction(race.waypoints, clamp(frac + 0.01, 0, 1));
    const courseDeg = bearing(base.lat, base.lon, ahead.lat, ahead.lon);
    const wind = sampleWind(field, base.lat, base.lon, t);
    const mgs = madeGoodSpeed(REF_BOAT, courseDeg, wind.fromDeg, wind.speedKn);
    const d = Math.min(step, total - dist);
    t += d / Math.max(mgs, 0.2);
    dist += d;
  }
  return t > 0 ? t : race.recordTimeHours * 2;
}

// Which side of the course the breeze favours at a point, as a signed scalar in
// roughly [-1, 1] (positive = the right of the rhumb line, negative = left),
// scaled by how pronounced the pressure gradient is. A boat whose bias matches
// this gains; a boat on the wrong side loses.
//
// NOTE: this reads ONLY `pressureHint`, which is built from the STATIC seeded
// gradient plus the slowly-drifting headline feature — it does NOT see the
// oscillating wind shift, the travelling front, or the rotation (wind.ts). So over
// a race the favoured side is near-CONSTANT per seed: a boat's `sideBonus` is a
// persistent bank (ride +8% or bleed −8% the whole way), not a live, flipping
// battle. That's the seed-to-seed "side lottery"; to make it genuinely tactical,
// feed the evolving field in here. (It never touches the player, only the fleet's
// internal spread.)
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

// Where a competitor actually is, and the way the course runs there. Its 2-D
// position rides the land-safe course spine (so it follows the coast around an
// island instead of cutting across it), offset perpendicular by its chosen side
// and tapered to nothing at the marks. The offset — and any residue — is finally
// snapped to open water, so a fleet boat can never sit on land. Pure: no stored
// 2-D state.
function competitorState(race: Race, c: Competitor): { pos: GeoPoint; courseDeg: number } {
  const total = race.distanceNm;
  const land = LANDMASSES[race.id];
  const path = coursePath(race); // GeoPoint[]; pointAtFraction reads only lat/lon
  const fraction = clamp(c.distanceNm / total, 0, 1);
  const base = pointAtFraction(path, fraction);
  const ahead = pointAtFraction(path, clamp(fraction + 0.01, 0, 1));
  const courseDeg = bearing(base.lat, base.lon, ahead.lat, ahead.lon);
  const taper = Math.sin(Math.PI * fraction); // 0 at the marks, 1 mid-course
  const offsetNm = (c.bias ?? 0) * Math.min(total * LEVERAGE_FRACTION, LEVERAGE_CAP_NM) * taper;
  const offset =
    Math.abs(offsetNm) > 1e-6
      ? movePoint(base.lat, base.lon, (courseDeg + 90 + 360) % 360, offsetNm)
      : { lat: base.lat, lon: base.lon };
  return { pos: snapToWater(land, offset.lat, offset.lon), courseDeg };
}

// Advance every competitor by the time elapsed this step. Each boat is paced to
// its benchmark target (which sets the difficulty) and makes good the reference
// polar's true speed in the real wind at its own position — fast in pressure, slow
// in a hole — scaled by a per-boat `paceScale` so the tide-free finish still lands
// on target. Only the WIND response matches the player; the same tide drifts it
// along its course and cancels in the standings.
//
// CRUCIAL ASYMMETRY: the fleet is FRICTIONLESS. A competitor has no condition at
// all (see the `Competitor` type) — it never wears, never tires, never changes a
// sail and never pays a decision's time. `paceScale` is a fixed scalar for the
// whole race, so the fleet's mean pace never droops. The PLAYER, by contrast, sheds
// speed through `conditionFactor` as the crew tires and the hull wears. So every
// point of condition the player loses is ground lost outright to a fleet that holds
// pace to the line — which, over a long passage under push, is exactly what turns a
// first-half lead into a back-half collapse. Tune wear (gameEngine `EFFORT_WEAR` /
// `conditionFactor`) with this in mind; the fleet has no counterpart to soften.
//
// `paceScale` is calibrated once (lazily, on the first step that has the field) and
// carried thereafter. Pure given RNG.
export function advanceFleet(
  fleet: Competitor[],
  race: Race,
  field: WindField,
  startHours: number,
  dtHours: number,
  tidalField?: TidalField
): Competitor[] {
  const total = race.distanceNm;
  const start = race.waypoints[0];
  const finish = race.waypoints[race.waypoints.length - 1];
  const axisDeg = bearing(start.lat, start.lon, finish.lat, finish.lon);
  // Reference yardstick (course-wide, tide-free) — computed once when any boat
  // still needs its paceScale, then memoised on each competitor.
  const needsCal = fleet.some((c) => !c.retired && c.finishedHours === null && c.paceScale === undefined);
  const benchMG = needsCal ? refMadeGoodHours(race, field) : 0;
  return fleet.map((c) => {
    if (c.retired || c.finishedHours !== null) return c;

    const paceScale = c.paceScale ?? benchMG / Math.max(c.targetHours, 1e-6);
    const { pos, courseDeg } = competitorState(race, c);
    const wind = sampleWind(field, pos.lat, pos.lon, startHours);
    // Absolute made-good speed through the reference polar, scaled to this boat's
    // pace. No normalising clamp: the swing between light and fresh is the real
    // one, which is what matches the player's tide sensitivity.
    const mgs = madeGoodSpeed(REF_BOAT, courseDeg, wind.fromDeg, wind.speedKn);
    const align = (c.bias ?? 0) * favouredSide(field, pos.lat, pos.lon, startHours, axisDeg);
    // ±8% per step, applied EVERY tick the boat's chosen side stays favoured — and
    // because `favouredSide` is near-constant per seed (see its note), this COMPOUNDS
    // into large course-long leverage. This directional bank, not `variance`, is the
    // dominant seed-to-seed standings shuffle; shrink 0.08 to damp the side-lottery.
    const sideBonus = 1 + 0.08 * align;
    // Per-step gaussish noise (±5%), mean-reverting — roughens the order without
    // steering it (contrast sideBonus, which is directional and compounds).
    const variance = 1 + gaussish() * 0.05;
    // The same tide the player fights, along the local course direction: a fair
    // stream carries the boat, a foul one holds it up. The benchmark is tide-free,
    // so over the fleet this is shared weather, not a difficulty knob.
    const tide = tideAlong(tidalField, pos.lat, pos.lon, startHours, courseDeg);
    const smg = Math.max(mgs * paceScale * sideBonus * variance + tide, TIDE_FLOOR_KN);

    // Rare retirement, more likely when it is blowing hard.
    if (rnd() < 0.00025 * dtHours * (1 + wind.speedKn / 20)) {
      return { ...c, paceScale, retired: true };
    }

    const advanced = c.distanceNm + smg * dtHours;
    if (advanced >= total) {
      const overshoot = advanced - total;
      const frac = 1 - overshoot / Math.max(smg * dtHours, 1e-6);
      return { ...c, paceScale, distanceNm: total, finishedHours: startHours + clamp(frac, 0, 1) * dtHours };
    }
    return { ...c, paceScale, distanceNm: advanced };
  });
}

// The player's live standing on the WATER: 1 + the boats currently further along.
// RAW distance order, no handicap — this is the "boats ahead on the water" place the
// cockpit shows live; the corrected (handicap) standing is `correctedPosition` /
// `liveCorrectedStandings`. The two can diverge, and a first-half water lead that
// fades is real movement here, not a metric artifact.
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
//
// FINISH-ONLY VALID: `playerElapsedHours` is scored raw while rivals are projected
// to the line (`projectedElapsed`), so mid-race — with the player on partial elapsed
// — the number is meaningless (it reads ~1st until the player nearly finishes).
// Production calls it only once `finished` (where covered == total and the numbers
// are exact); for a live corrected standing use `liveCorrectedStandings`, which
// projects the player the same way. Do not call this mid-race.
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

// One boat in the corrected-time standings: its name, its handicap time so far,
// and whether it's the player (so the UI can highlight the player's line and the
// debrief can name a neighbour). `correctedHours` is the boat's elapsed (actual
// or projected) × its rating — the same number that ranks `correctedPosition`.
export interface CorrectedStanding {
  id: string;
  name: string;
  correctedHours: number;
  isPlayer: boolean;
}

// The whole fleet ranked on CORRECTED (handicap) time — the player folded in —
// at the given moment. Read-only over the existing competitor state: it projects
// each still-racing boat's finish from its pace exactly as `correctedPosition`
// does, so the live strip and the finish facts agree with the official result.
// Retired boats drop out. Pure.
export function correctedStandings(
  fleet: Competitor[],
  totalNm: number,
  playerElapsedHours: number,
  playerTcc: number,
  playerName: string
): CorrectedStanding[] {
  const rows: CorrectedStanding[] = fleet
    .filter((c) => !c.retired)
    .map((c) => ({
      id: c.id,
      name: c.name,
      correctedHours: projectedElapsed(c, playerElapsedHours, totalNm) * c.ratingTcc,
      isPlayer: false,
    }));
  rows.push({
    id: 'player',
    name: playerName,
    correctedHours: playerElapsedHours * playerTcc,
    isPlayer: true,
  });
  // Ties broken so the order is deterministic (player ahead on an exact tie).
  return rows.sort(sortStandings);
}

const sortStandings = (a: CorrectedStanding, b: CorrectedStanding) =>
  a.correctedHours - b.correctedHours ||
  Number(b.isPlayer) - Number(a.isPlayer) ||
  a.id.localeCompare(b.id);

// The MID-RACE corrected standings. `correctedStandings` scores the player on
// elapsed-so-far, which is right only at the line (the photo-finish hold and the
// finish debrief) — reusing it while racing compares the player's partial time
// against a fleet projected to the finish, and the "gap" balloons to hours of
// fiction. Here the player is projected to the finish at their current pace,
// exactly as `projectedElapsed` treats every rival, so the ribbon's place and
// gap stay honest the whole way round and converge on the finish semantics as
// the line approaches. Pure.
export function liveCorrectedStandings(
  fleet: Competitor[],
  totalNm: number,
  playerElapsedHours: number,
  playerDistanceNm: number,
  playerTcc: number,
  playerName: string
): CorrectedStanding[] {
  const covered = Math.max(playerDistanceNm, 1e-6);
  const rows = correctedStandings(fleet, totalNm, playerElapsedHours, playerTcc, playerName);
  const player = rows.find((r) => r.isPlayer);
  if (player) player.correctedHours = playerElapsedHours * (totalNm / covered) * playerTcc;
  return rows.sort(sortStandings);
}

// The corrected-time gap, in seconds, between the player and the boat nearest to
// them in the corrected standings (the one just ahead or just astern, whichever
// is closer). Undefined if the player is alone. Drives the photo-finish hold and
// the finish-debrief line. Pure, derived only from existing corrected times.
export function nearestCorrectedGapSeconds(standings: CorrectedStanding[]): number | undefined {
  const idx = standings.findIndex((s) => s.isPlayer);
  if (idx < 0) return undefined;
  const player = standings[idx].correctedHours;
  let bestH: number | undefined;
  for (let i = 0; i < standings.length; i += 1) {
    if (i === idx) continue;
    const gap = Math.abs(standings[i].correctedHours - player);
    if (bestH === undefined || gap < bestH) bestH = gap;
  }
  return bestH === undefined ? undefined : bestH * 3600;
}

// Map positions of competitors still on the course, for the chart. Boats are
// shown from the gun (distance 0 = on the start line) so the fleet is visible
// immediately, not only once it has sailed clear of the start.
export function competitorPoints(fleet: Competitor[], race: Race): GeoPoint[] {
  return fleet
    .filter((c) => !c.retired && c.finishedHours === null)
    .map((c) => competitorState(race, c).pos);
}
