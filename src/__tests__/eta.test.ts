import {
  estimateRouteHours,
  EFFORT_SPEED,
} from '../engine/gameEngine';
import { planRoute } from '../engine/router';
import { createWindField, sampleForecast, sampleWind } from '../engine/wind';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getRaceById, getBoatById } from '../data';
import { LANDMASSES } from '../data/landmasses';
import { BoatCondition } from '../types';

afterEach(() => resetRng());

const healthy: BoatCondition = { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 };

// Plan the no-bias route for a race and return [boat, field, route].
function setup(raceId: string) {
  setRng(mulberry32(42));
  const race = getRaceById(raceId)!;
  const boat = getBoatById('boat-mistral')!;
  const field = createWindField(race);
  const start = { lat: race.waypoints[0].lat, lon: race.waypoints[0].lon };
  const route = planRoute(boat, field, start, race.waypoints, 1, 0, 0, LANDMASSES[race.id]);
  return { race, boat, field, route };
}

describe('estimateRouteHours', () => {
  it('returns a positive, finite ETA in a sensible ballpark of the course record', () => {
    const { race, boat, field, route } = setup('race-fastnet');
    const eta = estimateRouteHours(boat, healthy, route, field, 0, EFFORT_SPEED.cruise, 1);
    expect(Number.isFinite(eta)).toBe(true);
    expect(eta).toBeGreaterThan(0);
    // Within an order of magnitude of the tuned record — the polar can't be wildly off.
    expect(eta).toBeGreaterThan(race.recordTimeHours * 0.3);
    expect(eta).toBeLessThan(race.recordTimeHours * 4);
  });

  it('pushing hard is faster than conserving', () => {
    const { boat, field, route } = setup('race-caribbean-600');
    // Freeze the wind in time so this isolates the effort dial. (On the live,
    // evolving field a faster boat samples earlier — and so different — wind, so
    // the *preview* ETA isn't strictly monotonic in effort; the race itself,
    // sailed tick-by-tick on the true field, always rewards pushing.)
    const frozen = (f: typeof field, lat: number, lon: number) => sampleWind(f, lat, lon, 0);
    const push = estimateRouteHours(boat, healthy, route, field, 0, EFFORT_SPEED.push, 1, frozen);
    const conserve = estimateRouteHours(boat, healthy, route, field, 0, EFFORT_SPEED.conserve, 1, frozen);
    expect(push).toBeLessThan(conserve);
  });

  it('a tired, battered crew sails slower (longer ETA) than a fresh one', () => {
    const { boat, field, route } = setup('race-sydney-hobart');
    const fresh = estimateRouteHours(boat, healthy, route, field, 0, 1, 1);
    const worn = estimateRouteHours(
      boat,
      { hullIntegrity: 40, crewStamina: 30, crewMorale: 40 },
      route,
      field,
      0,
      1,
      1
    );
    expect(worn).toBeGreaterThan(fresh);
  });

  it("estimated on the believed forecast: a weak navigator strays, a strong one tracks the truth", () => {
    const { boat, field, route } = setup('race-fastnet');
    const truth = estimateRouteHours(boat, healthy, route, field, 0, 1, 1);
    const weak = estimateRouteHours(boat, healthy, route, field, 0, 1, 1, (f, la, lo, h) =>
      sampleForecast(f, la, lo, h, 15)
    );
    const strong = estimateRouteHours(boat, healthy, route, field, 0, 1, 1, (f, la, lo, h) =>
      sampleForecast(f, la, lo, h, 95)
    );
    // The race still sails the true field; only the *estimate* is blurred, more so
    // for a weak navigator.
    expect(Math.abs(weak - truth)).toBeGreaterThan(Math.abs(strong - truth));
  });

  it('is zero for a degenerate route', () => {
    const { boat, field } = setup('race-fastnet');
    expect(estimateRouteHours(boat, healthy, [], field, 0)).toBe(0);
    expect(estimateRouteHours(boat, healthy, [{ lat: 50, lon: -1 }], field, 0)).toBe(0);
  });
});
