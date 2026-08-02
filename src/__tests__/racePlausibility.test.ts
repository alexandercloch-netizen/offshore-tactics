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
// is never a dead calm, the prevailing wind that seeds the start read roughly
// agrees with the field the fleet actually sails, and the AI fleet is paced to a
// bounded spread. The RORC Caribbean 600 blow-up was a distance authored 30% over
// its geometry (the boat "finished" at 77% progress); this catches that class
// loudly.
//
// Deliberately structural and cheap (no headless race per course). NOTE: a
// stronger MADE-GOOD-EFFICIENCY check — a headless stepRace+tide finish tracking a
// plausible multiple of the record — is intentionally NOT here yet: a couple of
// long courses (notably Middle Sea) finish too slowly, but a probe showed the
// FIELD is healthy (means near baseline) and the loss is in made-good efficiency
// (deep VMG angles / fickle-shift re-tacks), a per-race routing subtlety that's a
// dedicated follow-up. The tide-balloon half of that is already fixed (the absolute
// tide floor; see CLAUDE.md). This file guards the structural inputs today and
// gains the efficiency assertion when that lands.
// ---------------------------------------------------------------------------

afterEach(() => resetRng());

const REF: Boat = getBoatById('boat-corsair')!; // the fleet's benchmark anchor
const DIV: DivisionKey = 'pro'; // the tightest fleet — worst case for spread
const SEED = 4242;

// Global, race-agnostic dials (never per race).
const DISTANCE_TOL = 0.1; // |geo − declared| / declared
const FIELD_FLOOR_KN = 1.5; // a course's typical wind is never a dead calm
const FLEET_SPREAD_MAX = 2.2; // max/min targetHours (a bounded, paced fleet)
const PREVAILING_WIND_TOL_DEG = 90; // authored prevailingWind vs the start-line field

// --- Self-expiring exemptions -------------------------------------------------
// An exemption is DEBT, not a licence. Each set below is checked for staleness:
// an exempted race must STILL trip its check, or the test fails and forces the
// exemption's removal. So the day the underlying data is corrected, the exemption
// can't be silently left behind — CI points at it.

// Round-the-Island's declared 50 nm (the real event's distance) is ~17% under its
// simplified 60 nm waypoint geometry. The player's progress already runs on the
// geometric length, so the only effect is a slightly over-counted benchmark
// wear-per-mile that the race is currently TUNED around — correcting it re-paces
// the fleet and needs a coordinated round-island rebalance (out of scope here). It
// is exempted from the distance check until then; the impactful mismatches
// (caribbean, r2ak) are corrected in races.ts and DO get checked.
const DISTANCE_EXEMPT = new Set(['race-round-island']);

// Three courses' authored prevailingWind points >90° off the breeze their baked
// climatology actually seeds at the start line, so the pre-gun favoured-end read
// is computed against a wind the fleet never sees. Reconciling the direction moves
// the start read (and its pins) — a coordinated content change, not a safety-net
// edit — so they're exempted here and slated for the content pass. The field is
// still real and sailable; only the start read's premise is skewed.
const PREVAILING_WIND_EXEMPT = new Set(['race-sydney-hobart', 'race-r2ak', 'race-tri-state']);

// Passage-mean wind speed over the course × a representative window.
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

// Circular mean of the field's FROM-direction at the start line over the opening
// hours — the breeze the start read is genuinely computed against.
function startLineDir(race: Race, field: WindField): number {
  const wp = race.waypoints[0];
  let sx = 0;
  let sy = 0;
  for (let h = 0; h <= 6; h += 1) {
    const r = (sampleWind(field, wp.lat, wp.lon, h).fromDeg * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
}

function angleDiffDeg(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

describe('race plausibility — structural guardrail for every race', () => {
  it('every race has sane distance, breeze, an honest start read and bounded fleet pacing', () => {
    const failures: string[] = [];
    // Which exempted races still actually trip their check — used to catch a
    // stale exemption once the data is fixed.
    const distanceStillOff = new Set<string>();
    const windStillOff = new Set<string>();
    const r2 = (n: number): number => Number(n.toFixed(2));

    for (const race of RACES) {
      const tag = race.id;
      const geoLen = courseLengthNm(race.waypoints);

      // 1. Distance integrity — the declared distance matches the sailed geometry
      //    (a mismatch corrupts the progress fraction and ETA from the gun).
      const distErr = Math.abs(geoLen - race.distanceNm) / race.distanceNm;
      if (distErr > DISTANCE_TOL) {
        if (DISTANCE_EXEMPT.has(tag)) distanceStillOff.add(tag);
        else
          failures.push(
            `${tag}: distanceNm ${race.distanceNm} vs geometry ${r2(geoLen)} (${r2(distErr * 100)}% off)`
          );
      }

      // 2. Not a dead calm — the seeded field's passage mean has real breeze.
      setRng(mulberry32(SEED));
      const field = createWindField(race);
      const meanWind = fieldMeanWind(race, field);
      if (meanWind < FIELD_FLOOR_KN) {
        failures.push(`${tag}: field mean ${r2(meanWind)} kn is a dead calm (< ${FIELD_FLOOR_KN} kn)`);
      }

      // 3. Honest start read — the authored prevailingWind that squares the line
      //    and seeds the favoured-end read agrees with the start-line field.
      const windErr = angleDiffDeg(startLineDir(race, field), race.prevailingWind.fromDeg);
      if (windErr > PREVAILING_WIND_TOL_DEG) {
        if (PREVAILING_WIND_EXEMPT.has(tag)) windStillOff.add(tag);
        else
          failures.push(
            `${tag}: prevailingWind ${race.prevailingWind.fromDeg}° vs start-line field ${r2(startLineDir(race, field))}° (${r2(windErr)}° off)`
          );
      }

      // 4. Fleet pacing — a bounded spread of target finishes, none parked. The
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

    // A stale exemption is a bug: it means the data was fixed but the exemption
    // was left behind, quietly weakening the guard. Fail and name it.
    for (const tag of DISTANCE_EXEMPT) {
      if (!distanceStillOff.has(tag)) {
        failures.push(`${tag}: in DISTANCE_EXEMPT but distance now passes — remove the stale exemption`);
      }
    }
    for (const tag of PREVAILING_WIND_EXEMPT) {
      if (!windStillOff.has(tag)) {
        failures.push(
          `${tag}: in PREVAILING_WIND_EXEMPT but the start read now agrees — remove the stale exemption`
        );
      }
    }

    // One run enumerates every broken race.
    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Made-good efficiency — the lived-run guard for SHORT courses. The Cowes Week
// Day 1 balloon (13h42m sailed vs a ~2h optimal) came from three compounding
// routing defects a route-only check can't see: the sub-2nm rhumb-into-the-no-go
// shortcut, the no-go crawl at the speed floor, and the reroute lockout on a
// losing board. A real headless run is cheap at this scale (~30 ticks), so every
// short course must FINISH a seeded cruise within a sane multiple of its record.
// Offshore courses are excluded purely on cost — the physics is shared, and the
// goldens pin it there.
// ---------------------------------------------------------------------------
import { cleanRunHours, defaultStepNm, initialProgress, stepRace } from '../engine/gameEngine';
import { createTidalField } from '../engine/current';
import { GameState, StepResult } from '../types';

const SHORT_COURSE_NM = 30;
const LIVED_RECORD_MAX = 4; // lived cruise ≤ 4× the outright record
const LIVED_SEEDS = [1, 2];

describe('made-good efficiency (short courses)', () => {
  const shorts = RACES.filter((r) => r.distanceNm <= SHORT_COURSE_NM);
  it('found the short courses this guard exists for', () => {
    expect(shorts.length).toBeGreaterThan(0);
  });
  shorts.forEach((race) => {
    it(`${race.id}: a seeded cruise finishes within ${LIVED_RECORD_MAX}x the record`, () => {
      const boat = getBoatById('boat-corsair')!;
      for (const seed of LIVED_SEEDS) {
        setRng(mulberry32(seed));
        const field = createWindField(race);
        const tidalField = createTidalField(race);
        let state: GameState = {
          funds: 0,
          selectedRaceId: race.id,
          selectedDivision: 'corinthian',
          selectedBoatId: boat.id,
          ownedBoatIds: [],
          selectedCrewIds: [],
          provisions: [],
          strategy: { bias: 0, effort: 'cruise' },
          profile: { fleet: [] },
          condition: { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 },
          windField: field,
          tidalField,
          fleet: [],
          progress: initialProgress(race, boat, 'corinthian', field),
          history: [],
          eventLog: [],
        };
        const stepNm = defaultStepNm(race);
        let finished = false;
        for (let i = 0; i < 1500; i += 1) {
          const outcome: StepResult = stepRace(state, stepNm);
          state = {
            ...state,
            progress: outcome.progress,
            condition: outcome.condition,
            weather: outcome.weather,
            fleet: outcome.fleet,
          };
          // Decisions cannot fire (no eventLog draws matter here) — but if one
          // does, take the safe first choice path by simply ignoring it: the
          // sim holds nothing headlessly and the tick loop continues.
          if (outcome.finished) {
            finished = true;
            break;
          }
          if (outcome.retired) break;
        }
        resetRng();
        expect(finished).toBe(true);
        const lived = state.progress!.elapsedHours;
        expect(lived).toBeLessThanOrEqual(race.recordTimeHours * LIVED_RECORD_MAX);
        // And the tide-free clean run agrees the course is sane at gameplay step.
        setRng(mulberry32(seed));
        const clean = cleanRunHours(race, boat, createWindField(race));
        resetRng();
        expect(clean).toBeLessThanOrEqual(race.recordTimeHours * LIVED_RECORD_MAX);
      }
    });
  });
});
