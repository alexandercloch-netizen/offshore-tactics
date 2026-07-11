import { createWindField, sampleWind } from '../engine/wind';
import { fleetBenchmarkHours } from '../engine/gameEngine';
import { mulberry32, resetRng, rnd, setRng } from '../engine/rng';
import { getBoatById, getRaceById } from '../data';
import { WindField } from '../types';
import GOLDEN from './fixtures/goldenWindFields.json';
import {
  DRIFTER_SCENARIO,
  FRONTAL_VEER_SCENARIO,
  GALE_SCENARIO,
  TWO_POINT_SCENARIO,
} from './fixtures/weatherScenarios';

afterEach(() => resetRng());

const fastnet = () => getRaceById('race-fastnet')!;

// Shortest-arc absolute difference between two bearings.
const dirDiff = (a: number, b: number): number => {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
};

describe('createWindField without a scenario (the golden pin)', () => {
  // THE load-bearing guarantee of the WeatherScenario seam: seasonal is the
  // ABSENCE of a scenario, and the default path is byte-identical to the
  // pre-seam engine — the same rnd() draw order and count, the same field.
  // The fixtures were captured from the engine before the seam existed.
  it('reproduces the pre-seam field byte-for-byte (Fastnet)', () => {
    setRng(mulberry32(GOLDEN.fastnetSeed));
    const field = createWindField(fastnet());
    expect(JSON.stringify(field)).toBe(JSON.stringify(GOLDEN.fastnet));
    // Sentinel: the NEXT draw matches too, so the seam consumed exactly as many
    // rnd() calls as the pre-seam engine — no draw added, dropped or reordered.
    expect(rnd()).toBe(GOLDEN.fastnetSentinel);
  });

  it('reproduces the pre-seam field byte-for-byte (Sydney–Hobart)', () => {
    setRng(mulberry32(GOLDEN.hobartSeed));
    const field = createWindField(getRaceById('race-sydney-hobart')!);
    expect(JSON.stringify(field)).toBe(JSON.stringify(GOLDEN.hobart));
    expect(rnd()).toBe(GOLDEN.hobartSentinel);
  });

  it('leaves sampleWind on the golden field unchanged by the seam', () => {
    // The golden field round-trips through JSON exactly as the save path does,
    // and samples identically to a freshly created one.
    setRng(mulberry32(GOLDEN.fastnetSeed));
    const fresh = createWindField(fastnet());
    const revived = JSON.parse(JSON.stringify(GOLDEN.fastnet)) as WindField;
    const race = fastnet();
    for (const h of [0, 6, 18]) {
      const a = sampleWind(fresh, race.waypoints[0].lat, race.waypoints[0].lon, h);
      const b = sampleWind(revived, race.waypoints[0].lat, race.waypoints[0].lon, h);
      expect(a).toEqual(b);
    }
  });
});

describe('createWindField with a scenario', () => {
  it('consumes exactly the same rnd() stream as the seasonal path', () => {
    // The scenario is read only after every seeded draw, so the sentinel draw
    // after creation is identical with and without one.
    setRng(mulberry32(GOLDEN.fastnetSeed));
    createWindField(fastnet(), GALE_SCENARIO);
    expect(rnd()).toBe(GOLDEN.fastnetSentinel);
  });

  it('is deterministic: same seed + same scenario = identical field', () => {
    setRng(mulberry32(7));
    const a = createWindField(fastnet(), FRONTAL_VEER_SCENARIO);
    setRng(mulberry32(7));
    const b = createWindField(fastnet(), FRONTAL_VEER_SCENARIO);
    expect(a).toEqual(b);
  });

  it('retires the synthetic front and rotation (the series carries the real ones)', () => {
    setRng(mulberry32(11));
    const f = createWindField(fastnet(), GALE_SCENARIO);
    expect(f.front).toBeUndefined();
    expect(f.rotateDegPerH).toBe(0);
    expect(f.scenarioBase).toBe(GALE_SCENARIO.points);
    // The mesoscale detail survives on top of the model base.
    expect(f.features && f.features.length).toBeGreaterThanOrEqual(2);
    expect(f.texture).toBeDefined();
    expect(f.diurnalAmpKn).toBeGreaterThan(0);
  });

  it('builds through the gale as the series does, inside the 2–50 kn clamps', () => {
    setRng(mulberry32(11));
    const f = createWindField(fastnet(), GALE_SCENARIO);
    const race = fastnet();
    const { lat, lon } = race.waypoints[0];
    const early = sampleWind(f, lat, lon, 1);
    const late = sampleWind(f, lat, lon, 26);
    expect(late.speedKn).toBeGreaterThan(early.speedKn + 15); // 15 kn → mid-40s in the series
    // Clamps hold across space and the whole blow.
    for (const h of [0, 6, 12, 18, 24, 30, 36]) {
      for (const w of race.waypoints) {
        const s = sampleWind(f, w.lat, w.lon, h);
        expect(s.speedKn).toBeGreaterThanOrEqual(2);
        expect(s.speedKn).toBeLessThanOrEqual(50);
        expect(s.fromDeg).toBeGreaterThanOrEqual(0);
        expect(s.fromDeg).toBeLessThan(360);
      }
    }
  });

  it('stays soft in the drifter — texture scales down with the breeze', () => {
    setRng(mulberry32(11));
    const f = createWindField(fastnet(), DRIFTER_SCENARIO);
    const race = fastnet();
    for (const h of [0, 8, 16, 24]) {
      for (const w of race.waypoints) {
        expect(sampleWind(f, w.lat, w.lon, h).speedKn).toBeLessThan(20);
      }
    }
  });

  it('veers with the front in the series, not the synthetic one', () => {
    setRng(mulberry32(23));
    const f = createWindField(fastnet(), FRONTAL_VEER_SCENARIO);
    const { lat, lon } = fastnet().waypoints[0];
    const pre = sampleWind(f, lat, lon, 3).fromDeg; // southerly ahead of the line
    const post = sampleWind(f, lat, lon, 27).fromDeg; // nor'wester behind it
    // The authored veer is 120°; the oscillating shift can hedge ±~30° of it.
    expect(dirDiff(pre, post)).toBeGreaterThan(60);
    expect(dirDiff(post, 300)).toBeLessThan(60);
  });

  it('carries the model spatial gradient when the scenario has several points', () => {
    setRng(mulberry32(31));
    const f = createWindField(fastnet(), TWO_POINT_SCENARIO);
    const nearLight = sampleWind(f, 50.0, -3.0, 6).speedKn; // by the 8 kn point
    const nearFresh = sampleWind(f, 51.0, -5.5, 6).speedKn; // by the 24 kn point
    expect(nearFresh).toBeGreaterThan(nearLight + 6);
  });

  it('serialises exactly as today: the frozen save samples identically', () => {
    setRng(mulberry32(47));
    const f = createWindField(fastnet(), GALE_SCENARIO);
    const revived = JSON.parse(JSON.stringify(f)) as WindField;
    expect(JSON.stringify(revived)).toBe(JSON.stringify(f));
    const { lat, lon } = fastnet().waypoints[1];
    for (const h of [0, 5, 20, 35]) {
      expect(sampleWind(revived, lat, lon, h)).toEqual(sampleWind(f, lat, lon, h));
    }
  });

  it('sails a full headless race, and the fleet benchmark self-calibrates to the weather', () => {
    // fleetBenchmarkHours drives the whole stepRace movement+wear model through
    // the field, so this proves a scenario race runs end to end — and that the
    // AI fleet paces to the weather actually sailed: quick through a gale,
    // patient through a drifter.
    const race = fastnet();
    const boat = getBoatById('boat-corsair')!;
    setRng(mulberry32(5));
    const galeHours = fleetBenchmarkHours(race, createWindField(race, GALE_SCENARIO), boat);
    setRng(mulberry32(5));
    const driftHours = fleetBenchmarkHours(race, createWindField(race, DRIFTER_SCENARIO), boat);
    expect(Number.isFinite(galeHours)).toBe(true);
    expect(galeHours).toBeGreaterThan(0);
    expect(driftHours).toBeGreaterThan(galeHours);
  });

  // The benchmark paces the fleet, so it must self-calibrate to the ACTUAL crew
  // — skill AND the starting condition crew count drives through provisioning —
  // not a generic club-average boat. Without this, a config could start
  // last-by-construction on corrected time before a tactic is even played.
  // (A short, open-water crossing keeps this benchmark sweep quick for CI.)
  describe('the fleet benchmark reflects the actual crew', () => {
    const race = () => getRaceById('race-malta-syracuse')!;
    const boat = () => getBoatById('boat-corsair')!;
    // The SAME seasonal field for every arm of a comparison, so only the crew
    // input differs (cleanRunHours draws no RNG; the field is deterministic).
    const field = () => {
      setRng(mulberry32(9));
      return createWindField(race());
    };

    it('a sharper crew shortens the benchmark (skill scales boat speed)', () => {
      // Two crack hands vs a single journeyman — the sharp crew makes the boat
      // faster, so its clean-run benchmark is quicker.
      const sharp = fleetBenchmarkHours(race(), field(), boat(), ['crew-vega', 'crew-thorne']);
      const green = fleetBenchmarkHours(race(), field(), boat(), ['crew-fontaine']);
      expect(sharp).toBeLessThan(green);
    });

    it('crew count feeds the benchmark through the provisioning-seeded condition', () => {
      // The benchmark tracks the actual roster, crew COUNT included. This engine
      // has NO capacity-handling speed penalty; crew count reaches boat speed the
      // SAME way the live race applies it — through `initialCondition`'s
      // provisioning load (crew-days = count × passage). On the SAME thin stores,
      // a big boat crewed full has more mouths to feed than the same boat sailed
      // short-handed, so it starts hungrier (worn) and its clean-run benchmark is
      // slower. (In normal play both arms are auto-provisioned to their own crew,
      // so an adequately-fed short-handed boat is NOT penalised — matching what the
      // player actually sails.) The fuller roster here is also a shade less skilled
      // on average, which pushes the same way; both are honest properties of the
      // real crew the benchmark must reflect.
      const thinStores = [{ provisionId: 'prov-rations', quantity: 2 }];
      const full10 = [
        'crew-vega', 'crew-thorne', 'crew-okafor', 'crew-halvorsen', 'crew-lindqvist',
        'crew-mercer', 'crew-tan', 'crew-rossi', 'crew-nakamura', 'crew-mbeki',
      ];
      const short5 = full10.slice(0, 5);
      const fullBench = fleetBenchmarkHours(race(), field(), boat(), full10, thinStores);
      const shortBench = fleetBenchmarkHours(race(), field(), boat(), short5, thinStores);
      // More hands on the same rations → bigger shortfall → worn crew → slower.
      // (This provisioning shortfall is also how a well-fed crew beats an
      // unprovisioned one — the same `initialCondition` channel, tested via count.)
      expect(fullBench).toBeGreaterThan(shortBench);
    });
  });
});
