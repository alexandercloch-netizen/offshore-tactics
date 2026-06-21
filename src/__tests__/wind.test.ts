import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getRaceById } from '../data';
import { WindField } from '../types';

afterEach(() => resetRng());

// A hand-built field with no randomness, for deterministic assertions.
function field(overrides: Partial<WindField> = {}): WindField {
  return {
    baseDir: 0,
    baseSpeed: 14,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 0,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat: 0,
    refLon: 0,
    feature: { lat: 0, lon: 0, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
    ...overrides,
  };
}

describe('createWindField', () => {
  it('is deterministic for a given seed', () => {
    const race = getRaceById('race-fastnet')!;
    setRng(mulberry32(42));
    const a = createWindField(race);
    setRng(mulberry32(42));
    const b = createWindField(race);
    expect(a).toEqual(b);
  });

  it('anchors near the prevailing wind', () => {
    const race = getRaceById('race-caribbean-600')!;
    setRng(mulberry32(7));
    const f = createWindField(race);
    // within the jitter band of the prevailing direction
    expect(Math.abs(f.baseDir - race.prevailingWind.fromDeg)).toBeLessThanOrEqual(20);
  });
});

describe('sampleWind', () => {
  it('returns a normalized direction and a bounded speed', () => {
    const race = getRaceById('race-sydney-hobart')!;
    setRng(mulberry32(3));
    const f = createWindField(race);
    const s = sampleWind(f, race.waypoints[0].lat, race.waypoints[0].lon, 5);
    expect(s.fromDeg).toBeGreaterThanOrEqual(0);
    expect(s.fromDeg).toBeLessThan(360);
    expect(s.speedKn).toBeGreaterThanOrEqual(2);
    expect(s.speedKn).toBeLessThanOrEqual(50);
  });

  it('varies in space via the gradient', () => {
    const f = field({ gradientAxisDeg: 0, gradientPerNm: 0.1, refLat: 0, refLon: 0 });
    const south = sampleWind(f, -1, 0, 0).speedKn; // 60 nm "behind" the axis
    const north = sampleWind(f, 1, 0, 0).speedKn; // 60 nm "ahead"
    expect(north).toBeGreaterThan(south);
  });

  it('varies in time via systematic rotation', () => {
    const f = field({ rotateDegPerH: 10 });
    const t0 = sampleWind(f, 0, 0, 0).fromDeg;
    const t5 = sampleWind(f, 0, 0, 5).fromDeg;
    expect(Math.abs(t5 - t0)).toBeGreaterThan(5);
  });

  it('drops the wind inside a hole feature', () => {
    const f = field({ feature: { lat: 0, lon: 0, radiusNm: 30, deltaKn: -10, driftDir: 0, driftKn: 0 } });
    const inHole = sampleWind(f, 0, 0, 0).speedKn;
    const outside = sampleWind(f, 5, 0, 0).speedKn;
    expect(inHole).toBeLessThan(outside);
  });
});

describe('weatherFromWind', () => {
  it('maps speed to a descriptive condition and keeps the direction', () => {
    const w = weatherFromWind({ fromDeg: 137, speedKn: 28 });
    expect(w.windDirection).toBe(137);
    expect(w.windSpeedKts).toBe(28);
    expect(w.label).toBeTruthy();
  });
});
