import { createWindField, gustRatioFor, sampleWind } from '../engine/wind';
import { mulberry32, resetRng, rnd, setRng } from '../engine/rng';
import { getRaceById } from '../data';
import { EDITION_SOURCES, WEATHER_EDITIONS, editionsForRace } from '../data/weatherEditions';
import { EXCLUDED_EDITIONS } from '../data/weatherEditions.exclusions';
import { SCENARIO_FIELD_VERSION, scenarioStamp, scenarioTagLine } from '../services/weather';
import { WindField } from '../types';

afterEach(() => resetRng());

const keys = Object.keys(WEATHER_EDITIONS);

// Shortest-arc absolute difference between two bearings.
const dirDiff = (a: number, b: number): number => {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
};

// Vector-mean direction of a baked point's series over its first `n` samples.
const meanDir = (fromDeg: number[], n: number): number => {
  let ss = 0;
  let cc = 0;
  for (const d of fromDeg.slice(0, n)) {
    ss += Math.sin((d * Math.PI) / 180);
    cc += Math.cos((d * Math.PI) / 180);
  }
  return ((Math.atan2(ss, cc) * 180) / Math.PI + 360) % 360;
};

describe('the fatality vet (a hard product rule)', () => {
  // We celebrate storied, safely-sailed races. An edition of a running that saw
  // loss of life must NEVER ship — this test is the enforcement, not the UI.
  it('no shipped edition intersects the exclusions', () => {
    for (const key of keys) {
      const s = WEATHER_EDITIONS[key];
      const barred = EXCLUDED_EDITIONS.some(
        (x) => x.raceId === s.raceId && x.year === s.year
      );
      expect(`${key} barred=${barred}`).toBe(`${key} barred=false`);
    }
  });

  it('the exclusions list carries the canon, with provenance', () => {
    const has = (raceId: string, year: number) =>
      EXCLUDED_EDITIONS.some((x) => x.raceId === raceId && x.year === year);
    expect(has('race-fastnet', 1979)).toBe(true);
    expect(has('race-sydney-hobart', 1998)).toBe(true);
    expect(has('race-sydney-hobart', 2024)).toBe(true);
    expect(has('race-chicago-mac', 2011)).toBe(true);
    expect(has('race-newport-bermuda', 2022)).toBe(true);
    for (const x of EXCLUDED_EDITIONS) {
      expect(x.reason).toBe('loss-of-life');
      expect(x.sourceUrl).toMatch(/^https:\/\//);
      // Every excluded raceId names a real race — a typo would silently unbar it.
      expect(getRaceById(x.raceId)).toBeDefined();
    }
  });
});

describe('the baked editions (shape & provenance)', () => {
  it('ships at least the three curated editions', () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        'race-sydney-hobart@2017',
        'race-fastnet@2011',
        'race-newport-bermuda@2016',
      ])
    );
  });

  it('every edition is complete: label, year, blurb, real race, era5, points', () => {
    for (const key of keys) {
      const s = WEATHER_EDITIONS[key];
      expect(s.kind).toBe('historic');
      expect(s.model).toBe('era5');
      expect(s.year).toBeGreaterThan(1900);
      expect(key).toBe(`${s.raceId}@${s.year}`);
      expect(getRaceById(s.raceId)).toBeDefined();
      expect(s.label.length).toBeGreaterThan(0);
      expect((s.blurb ?? '').length).toBeGreaterThan(0);
      expect(s.fieldVersion).toBe(SCENARIO_FIELD_VERSION);
      expect(EDITION_SOURCES[key]).toMatch(/^https:\/\//);
      expect(s.points.length).toBeGreaterThan(0);
      for (const p of s.points) {
        // A day of hourly samples is the floor for a sailable passage; the
        // arrays run in lockstep, hours ascending and race-relative.
        expect(p.hours.length).toBeGreaterThanOrEqual(24);
        expect(p.fromDeg.length).toBe(p.hours.length);
        expect(p.speedKn.length).toBe(p.hours.length);
        expect(p.gustKn?.length).toBe(p.hours.length);
        expect(p.pressureHpa?.length).toBe(p.hours.length);
        expect(p.hours[0]).toBeLessThanOrEqual(0);
        for (let i = 1; i < p.hours.length; i += 1) {
          expect(p.hours[i]).toBeGreaterThan(p.hours[i - 1]);
        }
        for (const v of p.speedKn) expect(v).toBeGreaterThanOrEqual(0);
        for (const d of p.fromDeg) {
          expect(d).toBeGreaterThanOrEqual(0);
          expect(d).toBeLessThanOrEqual(360);
        }
      }
    }
  });

  it('honours the copy discipline: no tragedy, no drama, no body counts', () => {
    for (const key of keys) {
      const text = `${WEATHER_EDITIONS[key].label} ${WEATHER_EDITIONS[key].blurb}`.toLowerCase();
      for (const word of ['death', 'died', 'lost at sea', 'capsize', 'rescue', 'tragedy', 'fatal']) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('each edition sanity-matches its story in the baked numbers', () => {
    // 2017 Hobart — the downwind nor'easter: the Bass Strait point's breeze
    // over the leaders' window comes from the northern quadrant (the course
    // runs south, so that is a following wind) and freshens past 20 kn.
    const hobart = WEATHER_EDITIONS['race-sydney-hobart@2017'];
    const strait = hobart.points[1];
    expect(dirDiff(meanDir(strait.fromDeg, 40), 30)).toBeLessThan(45);
    expect(Math.max(...strait.speedKn.slice(0, 40))).toBeGreaterThan(20);

    // 2011 Fastnet — the fair westerly: the Solent start reads from the
    // westerly quadrant over the opening day.
    const fastnet = WEATHER_EDITIONS['race-fastnet@2011'];
    expect(dirDiff(meanDir(fastnet.points[0].fromDeg, 36), 270)).toBeLessThan(50);

    // 2016 Bermuda — soft off Newport, fresh over the Stream: the Gulf Stream
    // point out-blows the start over the leaders' window.
    const bermuda = WEATHER_EDITIONS['race-newport-bermuda@2016'];
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(bermuda.points[1].speedKn.slice(0, 40))).toBeGreaterThan(
      avg(bermuda.points[0].speedKn.slice(0, 40))
    );
  });

  it('editionsForRace shelves by race, newest first, empty elsewhere', () => {
    expect(editionsForRace('race-sydney-hobart').map((e) => e.year)).toEqual([2017]);
    expect(editionsForRace('race-transpac')).toEqual([]);
    expect(editionsForRace(undefined)).toEqual([]);
  });
});

describe('editions through the scenario seam', () => {
  it('createWindField accepts every edition and consumes the seasonal rnd stream', () => {
    for (const key of keys) {
      const s = WEATHER_EDITIONS[key];
      const race = getRaceById(s.raceId)!;
      // The seam contract: the scenario is only read after every seeded draw,
      // so the sentinel draw after creation matches the seasonal path exactly.
      setRng(mulberry32(97));
      createWindField(race);
      const sentinel = rnd();
      setRng(mulberry32(97));
      const field = createWindField(race, s);
      expect(rnd()).toBe(sentinel);
      expect(field.scenarioBase).toBe(s.points);
      expect(field.front).toBeUndefined();
      expect(field.rotateDegPerH).toBe(0);
    }
  });

  it('is deterministic and JSON round-trips exactly (the save path)', () => {
    for (const key of keys) {
      const s = WEATHER_EDITIONS[key];
      const race = getRaceById(s.raceId)!;
      setRng(mulberry32(13));
      const a = createWindField(race, s);
      setRng(mulberry32(13));
      const b = createWindField(race, s);
      expect(a).toEqual(b);
      // The edition itself survives serialisation (it rides saves & fixtures).
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
      const revived = JSON.parse(JSON.stringify(a)) as WindField;
      const { lat, lon } = race.waypoints[0];
      for (const h of [0, 6, 18, 30]) {
        expect(sampleWind(revived, lat, lon, h)).toEqual(sampleWind(a, lat, lon, h));
      }
    }
  });

  it('samples inside the engine clamps across the whole passage', () => {
    for (const key of keys) {
      const s = WEATHER_EDITIONS[key];
      const race = getRaceById(s.raceId)!;
      setRng(mulberry32(29));
      const field = createWindField(race, s);
      for (const h of [0, 12, 24, 48, 72]) {
        for (const w of race.waypoints) {
          const smp = sampleWind(field, w.lat, w.lon, h);
          expect(smp.speedKn).toBeGreaterThanOrEqual(2);
          expect(smp.speedKn).toBeLessThanOrEqual(50);
          expect(smp.fromDeg).toBeGreaterThanOrEqual(0);
          expect(smp.fromDeg).toBeLessThan(360);
        }
      }
    }
  });

  it('feeds the gust layer its own gust character', () => {
    const s = WEATHER_EDITIONS['race-sydney-hobart@2017'];
    setRng(mulberry32(3));
    const field = createWindField(getRaceById(s.raceId)!, s);
    const ratio = gustRatioFor(field, s.raceId);
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThanOrEqual(1.4);
  });

  it('stamps and tags the run the way the logbook shows it', () => {
    const s = WEATHER_EDITIONS['race-sydney-hobart@2017'];
    const stamp = scenarioStamp(s);
    expect(stamp).toEqual({
      kind: 'historic',
      model: 'era5',
      issuedAt: '2017-12-26T02:00:00Z',
      label: '2017 — the record run',
      year: 2017,
    });
    expect(scenarioTagLine(stamp)).toBe('2017 — the record run · ERA5');
  });
});
