import { pointInLand, segmentCrossesLand } from '../engine/land';
import { LANDMASSES, LandPolygon } from '../data/landmasses';
import { RACES, getBoatById, getRaceById } from '../data';
import { createWindField } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import {
  DEFAULT_STRATEGY,
  initialProgress,
  raceDivision,
  stepRace,
} from '../engine/gameEngine';
import { planRoute } from '../engine/router';
import { haversineNm } from '../engine/geo';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { BoatCondition, GameState } from '../types';

afterEach(() => resetRng());

const healthy: BoatCondition = { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 };

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

// Sail a race headless (ignoring decision prompts, which don't move the boat) and
// return the track actually sailed.
function sailTrail(raceId: string): { lat: number; lon: number }[] {
  const race = getRaceById(raceId)!;
  const boat = getBoatById('boat-mistral')!;
  const windField = createWindField(race);
  let state = {
    funds: 0,
    selectedRaceId: raceId,
    selectedDivision: 'corinthian',
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: [],
    provisions: [],
    strategy: DEFAULT_STRATEGY,
    profile: { fleet: [] },
    condition: healthy,
    windField,
    fleet: createFleet(race, raceDivision(race, 'corinthian')),
    progress: initialProgress(race, boat, 'corinthian', windField),
    history: [],
    eventLog: [],
  } as unknown as GameState;

  // Coarser steps than gameplay — enough to trace the whole routed track and
  // catch any land incursion, without a slow tick-by-tick sim in CI.
  const step = Math.max(race.distanceNm * 0.04, 1);
  for (let i = 0; i < 2000; i += 1) {
    const out = stepRace(state, step);
    state = { ...state, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
    if (out.finished || out.retired) break;
  }
  return state.progress!.trail;
}

// A point sits "at" a mark if it's within the coarse-coastline tolerance of one.
const MARGIN_NM = 6; // tolerate coastal start/finish/marks sitting on the coarse coastline
function nearMark(race: { waypoints: { lat: number; lon: number }[] }, p: { lat: number; lon: number }): boolean {
  return race.waypoints.some((w) => haversineNm(p.lat, p.lon, w.lat, w.lon) <= MARGIN_NM);
}

// Count the segments of a polyline that cut across land. A vertex check alone
// misses the real defect — two clean vertices with land between them — so we
// test the segments the boat actually sails. Segments touching a mandatory mark
// are exempt (real harbours/headlands sit on the coarse coastline).
function landCrossings(
  race: { waypoints: { lat: number; lon: number }[] },
  land: LandPolygon[] | undefined,
  pts: { lat: number; lon: number }[]
): { lat: number; lon: number }[][] {
  const crossings: { lat: number; lon: number }[][] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    if (nearMark(race, pts[i]) || nearMark(race, pts[i + 1])) continue;
    if (segmentCrossesLand(land, pts[i], pts[i + 1])) crossings.push([pts[i], pts[i + 1]]);
  }
  return crossings;
}

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
