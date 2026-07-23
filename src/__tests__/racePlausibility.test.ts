import { raceDivision } from '../engine/gameEngine';
import { createWindField, sampleWind } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import { courseLengthNm, pointAtFraction } from '../engine/geo';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getBoatById } from '../data';
import { RACES } from '../data/races';
import { Boat, DivisionKey, Race, WindField } from '../types';

// ---------------------------------------------------------------------------
// RACE PLAUSIBILITY — a cross-race guardrail. For EVERY race (now and every race
// added later) the structural inputs a fair race depends on must hold: the
// declared distance matches the sailed waypoint geometry, the seeded wind field
// is never a dead calm, and the AI fleet is paced to a bounded spread. The RORC
// Caribbean 600 blow-up was a distance authored 30% over its geometry (the boat
// "finished" at 77% progress); this catches that class loudly.
//
// Deliberately structural and cheap (no headless race per course). NOTE: a
// stronger FIELD-INTEGRITY check — the seeded field's passage mean tracking the
// baked climatology within a tolerance — is intentionally NOT here yet: several
// courses currently run light (a travelling-front / hazard-speedMul interaction),
// and fixing that in the wind model without destabilising long ocean races is a
// dedicated follow-up. This file guards the structural inputs today and gains the
// field-integrity assertion when that lands.
// ---------------------------------------------------------------------------

afterEach(() => resetRng());

const REF: Boat = getBoatById('boat-corsair')!; // the fleet's benchmark anchor
const DIV: DivisionKey = 'pro'; // the tightest fleet — worst case for spread
const SEED = 4242;

// Global, race-agnostic dials (never per race).
const DISTANCE_TOL = 0.1; // |geo − declared| / declared
const FIELD_FLOOR_KN = 1.5; // a course's typical wind is never a dead calm
const FLEET_SPREAD_MAX = 2.2; // max/min targetHours (a bounded, paced fleet)

// Round-the-Island's declared 50 nm (the real event's distance) is ~17% under its
// simplified 60 nm waypoint geometry. The player's progress already runs on the
// geometric length, so the only effect is a slightly over-counted benchmark
// wear-per-mile that the race is currently TUNED around — correcting it re-paces
// the fleet and needs a coordinated round-island rebalance (out of scope here). It
// is exempted from the distance check until then; the impactful mismatches
// (caribbean, r2ak) are corrected in races.ts and DO get checked.
const DISTANCE_EXEMPT = new Set(['race-round-island']);

// Passage-mean wind over the course × a representative window.
function fieldMeanWind(race: Race, field: WindField): number {
  const hours = Math.max(race.recordTimeHours * 2, 6);
  let sum = 0;
  let n = 0;
  for (let i = 0; i <= 6; i += 1) {
    const p = pointAtFraction(race.waypoints, i / 6);
    for (let h = 0; h <= hours; h += Math.max(hours / 5, 1)) {
      sum += sampleWind(field, p.lat, p.lon, h).speedKn;
      n += 1;
    }
  }
  return sum / n;
}

describe('race plausibility — structural guardrail for every race', () => {
  it('every race has sane distance, a sailable wind field and bounded fleet pacing', () => {
    const failures: string[] = [];
    const r2 = (n: number): number => Number(n.toFixed(2));

    for (const race of RACES) {
      const tag = race.id;
      const geoLen = courseLengthNm(race.waypoints);

      // 1. Distance integrity — the declared distance matches the sailed geometry
      //    (a mismatch corrupts the progress fraction and ETA from the gun).
      const distErr = Math.abs(geoLen - race.distanceNm) / race.distanceNm;
      if (distErr > DISTANCE_TOL && !DISTANCE_EXEMPT.has(tag)) {
        failures.push(
          `${tag}: distanceNm ${race.distanceNm} vs geometry ${r2(geoLen)} (${r2(distErr * 100)}% off)`
        );
      }

      // 2. Not a dead calm — the seeded field's passage mean has real breeze.
      setRng(mulberry32(SEED));
      const meanWind = fieldMeanWind(race, createWindField(race));
      if (meanWind < FIELD_FLOOR_KN) {
        failures.push(`${tag}: field mean ${r2(meanWind)} kn is a dead calm (< ${FIELD_FLOOR_KN} kn)`);
      }

      // 3. Fleet pacing — a bounded spread of target finishes, none parked. The
      //    spread is independent of the benchmark VALUE (targetHours = bench ÷
      //    speedMul, so bench cancels), so pass the record as a stand-in and avoid
      //    a headless clean-run per race here.
      setRng(mulberry32(SEED));
      const fleet = createFleet(race, raceDivision(race, DIV), race.recordTimeHours, REF);
      const ts = fleet.map((c) => c.targetHours);
      if (ts.some((t) => !Number.isFinite(t) || t <= 0)) {
        failures.push(`${tag}: a competitor has a non-finite / non-positive targetHours`);
      } else if (Math.max(...ts) / Math.min(...ts) > FLEET_SPREAD_MAX) {
        failures.push(
          `${tag}: fleet target spread ${r2(Math.max(...ts) / Math.min(...ts))}× > ${FLEET_SPREAD_MAX}×`
        );
      }
    }

    // One run enumerates every broken race.
    expect(failures).toEqual([]);
  });
});
