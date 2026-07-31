import { pointInLand } from '../engine/land';
import { LANDMASSES } from '../data/landmasses';
import { RACES, getBoatById, getRaceById } from '../data';
import { createWindField } from '../engine/wind';
import { createFleet, competitorPoints } from '../engine/fleet';
import {
  DEFAULT_STRATEGY,
  buildResult,
  defaultStepNm,
  downsampleTrack,
  initialProgress,
  raceDivision,
  stepRace,
} from '../engine/gameEngine';
import { planRoute } from '../engine/router';
import { haversineNm } from '../engine/geo';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { GameState } from '../types';
import { healthy, sailTrail, nearMark, landCrossings, inlandIncursions } from './landShared';

// The land-safety suite is split three ways so jest can run the heavy blocks
// concurrently (it can't parallelise one file): this file holds the fast checks,
// `landTide.test.ts` the running-tide block, `landForecast.test.ts` the forecast
// routing block. Shared helpers live in `landShared.ts`.

afterEach(() => resetRng());

describe('pointInLand', () => {
  it('puts central Michigan on land and mid-Lake-Michigan in the water', () => {
    const land = LANDMASSES['race-chicago-mac'];
    expect(pointInLand(land, 43.6, -84.8)).toBe(true); // inland Michigan
    expect(pointInLand(land, 43.5, -87.0)).toBe(false); // mid-lake (a real waypoint)
  });

  it('treats an unknown race as all water', () => {
    expect(pointInLand(LANDMASSES['race-nonexistent'], 50, -125)).toBe(false);
    expect(pointInLand(undefined, 0, 0)).toBe(false);
  });
});

// Coastline data is generated from races.ts by scripts/build-coastlines.mjs, a
// separate offline step. This guard fails loudly if a race is added without
// re-running it: every race must have an entry so the audit below can't silently
// skip a race that actually needs land. (An empty array is allowed for a
// genuinely open-ocean course — the key just has to exist.)
describe('coastline coverage', () => {
  RACES.forEach((race) => {
    it(`${race.name} has a coastline entry`, () => {
      expect(Object.prototype.hasOwnProperty.call(LANDMASSES, race.id)).toBe(true);
    });
  });
});

describe('routed tracks stay off land (all races)', () => {
  RACES.filter((r) => LANDMASSES[r.id]?.length).forEach((race) => {
    it(`${race.name} keeps its track in the water`, () => {
      setRng(mulberry32(42));
      const land = LANDMASSES[race.id];
      const trail = sailTrail(race.id);
      expect(trail.length).toBeGreaterThan(2);

      // No trail vertex sits on land...
      const onLand = trail.filter((p) => pointInLand(land, p.lat, p.lon) && !nearMark(race, p));
      expect(onLand).toEqual([]);
      // ...and no trail *segment* cuts across land between two clean vertices.
      expect(landCrossings(race, land, trail)).toEqual([]);
    });
  });
});

// The AI fleet rides the land-safe course spine (not the straight rhumb between
// marks, which cuts across islands), and every fleet position is snapped to open
// water — so a competitor can never be drawn on land, on ANY course (even the
// sub-resolution channels, where the snap pulls the dot to the nearest water).
describe('the AI fleet stays off land (all races)', () => {
  RACES.filter((r) => LANDMASSES[r.id]?.length).forEach((race) => {
    it(`${race.name} keeps its fleet in the water`, () => {
      setRng(mulberry32(7));
      const land = LANDMASSES[race.id];
      const fleet = createFleet(race, raceDivision(race, 'pro'));
      let onLand = 0;
      let total = 0;
      for (let f = 0; f <= 1.0001; f += 0.04) {
        const at = fleet.map((c) => ({ ...c, distanceNm: f * race.distanceNm }));
        for (const p of competitorPoints(at, race)) {
          total += 1;
          if (pointInLand(land, p.lat, p.lon)) onLand += 1;
        }
      }
      expect(total).toBeGreaterThan(0);
      expect(onLand).toBe(0);
    });
  });
});

// The displayed course preview (briefing + in-race forward route) is the full
// planned route, not just the sailed trail. Guard that it, too, stays in the
// water — a rhumb line straight through an island was the original defect.
describe('the planned course preview stays off land (all races)', () => {
  const MARGIN_NM = 6;

  RACES.filter((r) => LANDMASSES[r.id]?.length).forEach((race) => {
    it(`${race.name} previews a route in the water`, () => {
      setRng(mulberry32(7));
      const land = LANDMASSES[race.id];
      const boat = getBoatById('boat-mistral')!;
      const field = createWindField(race);
      const start = { lat: race.waypoints[0].lat, lon: race.waypoints[0].lon };
      const route = planRoute(boat, field, start, race.waypoints, 1, 0, 0, land);
      expect(route.length).toBeGreaterThan(2);

      const onLand = route.filter((p) => {
        if (!pointInLand(land, p.lat, p.lon)) return false;
        const nearMark = race.waypoints.some(
          (w) => haversineNm(p.lat, p.lon, w.lat, w.lon) <= MARGIN_NM
        );
        return !nearMark;
      });
      expect(onLand).toEqual([]);
    });
  });
});

// The post-race debrief draws the sailed track and the optimal line from a
// *downsampled* copy stored on the result (kept small for the save). Uniform
// decimation used to drop the headland corners, so the straight lines between
// the survivors chorded across the island — the boat appeared to sail over land
// on the results screen even though it never did live. Guard the stored track.
describe('the post-race debrief track stays off land', () => {
  function sailToResult(raceId: string, boatId: string, division: 'corinthian' | 'pro', seed: number) {
    setRng(mulberry32(seed));
    const race = getRaceById(raceId)!;
    const boat = getBoatById(boatId)!;
    const windField = createWindField(race);
    let state = {
      funds: 0,
      selectedRaceId: raceId,
      selectedDivision: division,
      selectedBoatId: boat.id,
      ownedBoatIds: [],
      selectedCrewIds: [],
      provisions: [],
      strategy: DEFAULT_STRATEGY,
      profile: { fleet: [] },
      condition: healthy,
      windField,
      fleet: createFleet(race, raceDivision(race, division)),
      progress: initialProgress(race, boat, division, windField),
      history: [],
      eventLog: [],
    } as unknown as GameState;
    // The real gameplay step (fine), so the trail is dense — exactly the case
    // that exposed the chord-across-land bug once it was downsampled.
    const step = defaultStepNm(race);
    let out = stepRace(state, step);
    for (let i = 0; i < 6000; i += 1) {
      out = stepRace(state, step);
      state = { ...state, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
      if (out.finished || out.retired) break;
    }
    return buildResult(state, out);
  }

  // Round the Island in a quick boat (the reported case): a tight loop around an
  // island is the worst case for decimation chording across land.
  it('Round the Island debrief keeps the sailed track and optimal line in the water', () => {
    const race = getRaceById('race-round-island')!;
    const land = LANDMASSES[race.id];
    for (const seed of [3, 7, 21]) {
      const result = sailToResult('race-round-island', 'boat-mistral', 'pro', seed);
      expect(result.finished).toBe(true);
      expect((result.trail?.length ?? 0)).toBeGreaterThan(2);
      expect(inlandIncursions(race, land, result.trail ?? [])).toEqual([]);
      expect(inlandIncursions(race, land, result.optimalRoute ?? [])).toEqual([]);
    }
  });

  // Stress the simplifier directly: even decimated brutally hard (max 6–20 points
  // around a whole island), the land-aware safety net must keep every surviving
  // segment in the water. Naive uniform decimation chords straight across the
  // island here; this is the guarantee that catches it regardless of budget.
  it('keeps a hard-decimated island loop off land (the safety net works at any budget)', () => {
    const race = getRaceById('race-round-island')!;
    const land = LANDMASSES[race.id];
    setRng(mulberry32(3));
    const dense = sailTrail('race-round-island'); // a full lap's track
    expect(dense.length).toBeGreaterThan(8);
    for (const budget of [6, 8, 12, 20]) {
      const cut = downsampleTrack(dense, land, budget);
      expect(inlandIncursions(race, land, cut)).toEqual([]);
    }
  });
});
