import { pointInLand } from '../engine/land';
import { LANDMASSES } from '../data/landmasses';
import { RACES } from '../data';
import { defaultStepNm } from '../engine/gameEngine';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { sailTrail, nearMark, landCrossings, SUBRESOLUTION_COAST } from './landShared';

// Split out of land.test.ts so it runs concurrently (jest can't parallelise one
// file). Tide on, at the *gameplay* step (the coarse step hid the bug). The boat
// makes good the tide as a time rate and stays on its routed track, and a
// movement-layer guard steers it around any land clip the router leaves — so the
// track must stay in the water on a running tide. Sub-resolution channels are
// excluded (see landShared.SUBRESOLUTION_COAST). One seed: this is a geometry
// guard (does the track cross land), not a statistical one — a single run catches
// a land clip.

afterEach(() => resetRng());

describe('routed tracks stay off land with the tide running', () => {
  RACES.filter(
    (r) => r.tide && r.tide.peakRateKn > 0 && LANDMASSES[r.id]?.length && !SUBRESOLUTION_COAST.has(r.id)
  ).forEach((race) => {
    it(`${race.name} stays in the water on a running tide`, () => {
      setRng(mulberry32(42));
      const land = LANDMASSES[race.id];
      const trail = sailTrail(race.id, true, defaultStepNm(race));
      expect(trail.length).toBeGreaterThan(2);
      const onLand = trail.filter((p) => pointInLand(land, p.lat, p.lon) && !nearMark(race, p));
      expect(onLand).toEqual([]);
      expect(landCrossings(race, land, trail)).toEqual([]);
    });
  });
});
