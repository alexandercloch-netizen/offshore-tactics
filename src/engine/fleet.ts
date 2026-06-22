import { Boat, Competitor, GeoPoint, Race, RaceDivision, WindField } from '../types';
import { pointAtFraction } from './geo';
import { bestVmgAngles, polarSpeed } from './polar';
import { sampleWind } from './wind';
import { rnd } from './rng';

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

// Advance every competitor by the time elapsed this step, reading the same wind
// field as the player. Pure given the RNG (only retirements roll).
export function advanceFleet(
  fleet: Competitor[],
  race: Race,
  boat: Boat,
  field: WindField,
  startHours: number,
  dtHours: number
): Competitor[] {
  const total = race.distanceNm;
  return fleet.map((c) => {
    if (c.retired || c.finishedHours !== null) return c;

    const fraction = clamp(c.distanceNm / total, 0, 1);
    const tp = pointAtFraction(race.waypoints, fraction);
    const wind = sampleWind(field, tp.lat, tp.lon, startHours);
    const smg = Math.max(madeGoodSpeed(boat, tp.bearing, wind.fromDeg, wind.speedKn) * c.speedMul, 0.2);

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
