import { pointInLand } from '../engine/land';
import { LANDMASSES } from '../data/landmasses';
import { RACES, getBoatById, getRaceById } from '../data';
import { createWindField } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import {
  DEFAULT_STRATEGY,
  initialProgress,
  raceDivision,
  stepRace,
} from '../engine/gameEngine';
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

  it('treats races without coastline data as all water', () => {
    expect(pointInLand(LANDMASSES['race-r2ak'], 50, -125)).toBe(false);
    expect(pointInLand(undefined, 0, 0)).toBe(false);
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

describe('routed tracks stay off land (all races)', () => {
  const MARGIN_NM = 6; // tolerate coastal start/finish/marks sitting on the coarse coastline

  RACES.filter((r) => LANDMASSES[r.id]?.length).forEach((race) => {
    it(`${race.name} keeps its track in the water`, () => {
      setRng(mulberry32(42));
      const land = LANDMASSES[race.id];
      const trail = sailTrail(race.id);
      expect(trail.length).toBeGreaterThan(2);

      const onLand = trail.filter((p) => {
        if (!pointInLand(land, p.lat, p.lon)) return false;
        // Exempt points hugging a mandatory mark (real harbours/headlands).
        const nearMark = race.waypoints.some(
          (w) => haversineNm(p.lat, p.lon, w.lat, w.lon) <= MARGIN_NM
        );
        return !nearMark;
      });

      expect(onLand).toEqual([]);
    });
  });
});
