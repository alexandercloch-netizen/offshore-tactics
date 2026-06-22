import {
  createWindField,
  sampleWind,
  sampleWindGrid,
  weatherFromWind,
  weatherOutlook,
  featureState,
} from '../engine/wind';
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

describe('sampleWindGrid', () => {
  const bounds = { minLat: 50, maxLat: 51, minLon: -2, maxLon: -1 };

  it('returns cols*rows samples spanning the bounds inclusively', () => {
    const grid = sampleWindGrid(field(), bounds, 4, 3, 0);
    expect(grid).toHaveLength(12);
    const lats = grid.map((g) => g.lat);
    const lons = grid.map((g) => g.lon);
    expect(Math.min(...lats)).toBeCloseTo(50, 6);
    expect(Math.max(...lats)).toBeCloseTo(51, 6);
    expect(Math.min(...lons)).toBeCloseTo(-2, 6);
    expect(Math.max(...lons)).toBeCloseTo(-1, 6);
  });

  it('matches sampleWind at each grid point', () => {
    const f = field({ gradientPerNm: 0.04 });
    const grid = sampleWindGrid(f, bounds, 3, 3, 2);
    grid.forEach((g) => {
      const s = sampleWind(f, g.lat, g.lon, 2);
      expect(g.fromDeg).toBeCloseTo(s.fromDeg, 6);
      expect(g.speedKn).toBeCloseTo(s.speedKn, 6);
    });
  });

  it('produces finite, bounded wind speeds across the grid', () => {
    const grid = sampleWindGrid(field(), bounds, 5, 5, 5);
    grid.forEach((g) => {
      expect(Number.isFinite(g.speedKn)).toBe(true);
      expect(g.speedKn).toBeGreaterThanOrEqual(2);
      expect(g.speedKn).toBeLessThanOrEqual(50);
    });
  });
});

describe('weatherOutlook', () => {
  // A strong puff that drifts north toward (0,0), arriving in ~2 hours.
  const approaching = field({
    baseSpeed: 12,
    feature: { lat: -1, lon: 0, radiusNm: 30, deltaKn: 16, driftDir: 0, driftKn: 30 },
  });

  it('flags building breeze on the horizon', () => {
    const o = weatherOutlook(approaching, 0, 0, 0, 2);
    expect(o.soonKn).toBeGreaterThan(o.nowKn + 3);
    expect(o.trend).toBe('building');
    expect(o.warn).toBe(true);
    expect(o.headline).toMatch(/building/i);
  });

  it('reads a steady field as steady, with no warning', () => {
    const o = weatherOutlook(field({ baseSpeed: 12 }), 0, 0, 0, 2);
    expect(o.trend).toBe('steady');
    expect(o.warn).toBe(false);
  });

  it('detects an easing breeze as the puff drifts away', () => {
    // Puff sitting on the point now, drifting north away from it.
    const leaving = field({
      baseSpeed: 12,
      feature: { lat: 0, lon: 0, radiusNm: 30, deltaKn: 16, driftDir: 0, driftKn: 30 },
    });
    const o = weatherOutlook(leaving, 0, 0, 0, 2);
    expect(o.soonKn).toBeLessThan(o.nowKn - 3);
    expect(o.trend).toBe('easing');
  });

  it('warns when it is already blowing hard even if steady', () => {
    const o = weatherOutlook(field({ baseSpeed: 32 }), 0, 0, 0, 2);
    expect(o.peakKn).toBeGreaterThanOrEqual(28);
    expect(o.warn).toBe(true);
  });
});

describe('featureState', () => {
  it('reports the puff/hole centre, drifting over time', () => {
    const f = field({
      feature: { lat: 0, lon: 0, radiusNm: 40, deltaKn: 12, driftDir: 0, driftKn: 6 },
    });
    const now = featureState(f, 0);
    expect(now.puff).toBe(true);
    expect(now.lat).toBeCloseTo(0, 6);
    expect(now.radiusNm).toBe(40);
    const later = featureState(f, 5); // drifts north (bearing 0) for 5h at 6kn
    expect(later.lat).toBeGreaterThan(now.lat);
  });

  it('flags a hole when the delta is negative', () => {
    const f = field({
      feature: { lat: 1, lon: 2, radiusNm: 20, deltaKn: -8, driftDir: 90, driftKn: 0 },
    });
    expect(featureState(f, 0).puff).toBe(false);
  });
});
