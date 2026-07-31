import { pointInLand } from '../engine/land';
import { LANDMASSES } from '../data/landmasses';
import { RACES, getBoatById } from '../data';
import { createWindField, sampleForecast } from '../engine/wind';
import { planRoute, WindSampler } from '../engine/router';
import { haversineNm } from '../engine/geo';
import { mulberry32, resetRng, setRng } from '../engine/rng';

// Split out of land.test.ts so it runs concurrently. The briefing draws the route
// the crew *believes* it will sail — weather-routed on the forecast (blurred away
// from truth by the Navigator's skill), for each start bias (left / optimal /
// right). That's the surface where a planned line was seen crossing land, and it
// differs from the true-field preview: a fuzzier forecast bends the route, so a
// margin that's clear on truth can still wander ashore. We test the WEAKEST
// Navigator (navSkill 10) — the most blur, i.e. the actual failure case; it's a
// geometry guard, not a statistical sweep, so one skill level over the three
// biases is the meaningful coverage.

afterEach(() => resetRng());

describe('the briefing forecast route stays off land (all races)', () => {
  const MARGIN_NM = 6;
  const NAV_SKILL = 10; // weakest crew blurs the forecast most — the worst case

  RACES.filter((r) => LANDMASSES[r.id]?.length).forEach((race) => {
    it(`${race.name} plans a forecast route in the water`, () => {
      const land = LANDMASSES[race.id];
      const boat = getBoatById('boat-mistral')!;
      const start = { lat: race.waypoints[0].lat, lon: race.waypoints[0].lon };
      const sampler: WindSampler = (f, lat, lon, h) => sampleForecast(f, lat, lon, h, NAV_SKILL);

      for (const bias of [-1, 0, 1] as const) {
        setRng(mulberry32(7));
        const field = createWindField(race);
        const route = planRoute(boat, field, start, race.waypoints, 1, 0, bias, land, sampler);
        expect(route.length).toBeGreaterThan(2);

        const onLand = route.filter((p) => {
          if (!pointInLand(land, p.lat, p.lon)) return false;
          return !race.waypoints.some((w) => haversineNm(p.lat, p.lon, w.lat, w.lon) <= MARGIN_NM);
        });
        // Surface which combination failed if it ever regresses.
        expect({ navSkill: NAV_SKILL, bias, onLand }).toEqual({ navSkill: NAV_SKILL, bias, onLand: [] });
      }
    });
  });
});
