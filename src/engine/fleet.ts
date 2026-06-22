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

// Build the AI fleet (everyone but the player). Faster, tighter fleets in the
// pro division; slower and more spread out for Corinthian.
export function createFleet(race: Race, division: RaceDivision): Competitor[] {
  const count = Math.max(division.fleetSize - 1, 0);
  const mean = 1.02 - (division.paceTarget - 1) * 0.5;
  const spread = Math.max((division.paceTarget - 1) * 0.4, 0.04);
  const fleet: Competitor[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');
    fleet.push({
      id: `ai-${race.id}-${i}`,
      name,
      speedMul: clamp(mean + gaussish() * spread, 0.7, 1.12),
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

// Advance every competitor by the time elapsed this step, reading the same wind
// field as the player. Each boat's made-good speed is its skill (speedMul),
// times a bonus for being on the favoured side of the course, times a little
// puff-luck variance — so positions change through the race rather than staying
// frozen in skill order. Pure given the RNG (variance + retirement rolls).
export function advanceFleet(
  fleet: Competitor[],
  race: Race,
  boat: Boat,
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
    const base = madeGoodSpeed(boat, tp.bearing, wind.fromDeg, wind.speedKn);
    // Reward backing the right side, and add a small element of luck.
    const align = (c.bias ?? 0) * favouredSide(field, tp.lat, tp.lon, startHours, axisDeg);
    const sideBonus = 1 + 0.07 * align;
    const variance = 1 + gaussish() * 0.04;
    const smg = Math.max(base * c.speedMul * sideBonus * variance, 0.2);

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
