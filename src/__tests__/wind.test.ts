import {
  createWindField,
  sampleWind,
  sampleWindGrid,
  sampleForecastGrid,
  sampleForecastSpread,
  sampleForecastSpreadGrid,
  weatherFromWind,
  weatherOutlook,
  featureState,
  featureStates,
  gustRatioFor,
} from '../engine/wind';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getRaceById, RACES } from '../data';
import { WEATHER_CLIMATOLOGY } from '../data/weatherClimatology';
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

  it('anchors near the seasonal baseline', () => {
    const race = getRaceById('race-caribbean-600')!;
    setRng(mulberry32(7));
    const f = createWindField(race);
    // The baseline is the baked climatology when present, else the prevailing wind.
    const baseDir = WEATHER_CLIMATOLOGY[race.id]?.fromDeg ?? race.prevailingWind.fromDeg;
    let diff = Math.abs(f.baseDir - baseDir) % 360;
    if (diff > 180) diff = 360 - diff;
    expect(diff).toBeLessThanOrEqual(20); // within the jitter band
  });

  it('builds a textured field: several systems, a front, diurnal swing', () => {
    const race = getRaceById('race-fastnet')!;
    setRng(mulberry32(11));
    const f = createWindField(race);
    expect(f.features && f.features.length).toBeGreaterThanOrEqual(2);
    expect(f.features![0]).toEqual(f.feature); // headline stays first, for the chart
    expect(f.front).toBeDefined();
    expect(f.diurnalAmpKn).toBeGreaterThan(0);
    expect(f.texture).toBeDefined();
  });
});

describe('weather climatology coverage', () => {
  // Every race needs a baked climatology entry (run scripts/build-weather.mjs
  // after adding a race) — the field degrades gracefully without one, but this
  // keeps the seasonal baseline in sync, the way coastline coverage does.
  it('has a sane entry for every race', () => {
    for (const race of RACES) {
      const c = WEATHER_CLIMATOLOGY[race.id];
      expect(c).toBeDefined();
      expect(c.fromDeg).toBeGreaterThanOrEqual(0);
      expect(c.fromDeg).toBeLessThan(360);
      expect(c.speedKn).toBeGreaterThan(0);
      expect(['open-meteo', 'seed']).toContain(c.source);
    }
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

  it('sums every drifting system when `features` is present', () => {
    // Two holes on opposite sides; the point between them feels both.
    const f = field({
      baseSpeed: 20,
      features: [
        { lat: 0.2, lon: 0, radiusNm: 30, deltaKn: -8, driftDir: 0, driftKn: 0 },
        { lat: -0.2, lon: 0, radiusNm: 30, deltaKn: -8, driftDir: 0, driftKn: 0 },
      ],
    });
    const middle = sampleWind(f, 0, 0, 0).speedKn;
    const farAway = sampleWind(f, 3, 0, 0).speedKn;
    expect(middle).toBeLessThan(farAway); // both holes bite at the centre
  });

  it('veers and shifts strength as a front sweeps past', () => {
    // A front whose line moves north over time; sampling a fixed point should
    // see the direction change as the line crosses it.
    const f = field({
      baseDir: 200,
      baseSpeed: 16,
      front: { bearing: 0, posNmAt0: -120, speedKn: 30, widthNm: 20, dirShiftDeg: 40, speedDeltaKn: 8 },
    });
    const before = sampleWind(f, 0, 0, 0);
    const after = sampleWind(f, 0, 0, 8); // line has swept well past
    expect(Math.abs(after.fromDeg - before.fromDeg)).toBeGreaterThan(10);
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

describe('featureStates (all drifting systems)', () => {
  it('lists every system, the headline first, each drifted to the hour', () => {
    const headline = { lat: 0, lon: 0, radiusNm: 40, deltaKn: 12, driftDir: 0, driftKn: 6 };
    const hole = { lat: 1, lon: 1, radiusNm: 25, deltaKn: -6, driftDir: 90, driftKn: 3 };
    const f = field({ feature: headline, features: [headline, hole] });
    const states = featureStates(f, 2);
    expect(states).toHaveLength(2);
    expect(states[0]).toEqual(featureState(f, 2)); // headline agrees with the singular read
    expect(states[1].puff).toBe(false);
    expect(states[1].lon).toBeGreaterThan(1); // drifted east
  });

  it('falls back to the lone headline on a hand-built field', () => {
    const f = field();
    expect(featureStates(f, 0)).toHaveLength(1);
  });
});

describe('gustRatioFor', () => {
  it('reads the scenario gust series when one is sailing', () => {
    const f = field({
      scenarioBase: [
        {
          lat: 0,
          lon: 0,
          hours: [0, 1, 2],
          fromDeg: [0, 0, 0],
          speedKn: [10, 10, 10],
          gustKn: [13, 13, 13],
        },
      ],
    });
    expect(gustRatioFor(f)).toBeCloseTo(1.3, 5);
  });

  it('caps a squally scenario at 1.4', () => {
    const f = field({
      scenarioBase: [
        { lat: 0, lon: 0, hours: [0], fromDeg: [0], speedKn: [10], gustKn: [20] },
      ],
    });
    expect(gustRatioFor(f)).toBe(1.4);
  });

  it('falls back to the baked climatology, then a sane default', () => {
    const f = field();
    const raceId = Object.keys(WEATHER_CLIMATOLOGY)[0];
    const expected = Math.min(1 + Math.max(0, WEATHER_CLIMATOLOGY[raceId].gustFactor), 1.4);
    expect(gustRatioFor(f, raceId)).toBeCloseTo(expected, 5);
    expect(gustRatioFor(f)).toBe(1.2);
    expect(gustRatioFor(f)).toBeGreaterThan(1);
  });
});

describe('forecast spread (the uncertainty envelope)', () => {
  it('is zero now and grows with the lookahead', () => {
    const f = field();
    expect(sampleForecastSpread(f, 0, 0, 0, 70)).toBe(0);
    const near = sampleForecastSpread(f, 0.3, 0.3, 6, 70);
    const far = sampleForecastSpread(f, 0.3, 0.3, 36, 70);
    expect(near).toBeGreaterThanOrEqual(0);
    expect(far).toBeGreaterThan(near);
  });

  it('narrows for a sharper Navigator', () => {
    const f = field();
    const green = sampleForecastSpread(f, 0.2, 0.2, 24, 30);
    const sharp = sampleForecastSpread(f, 0.2, 0.2, 24, 95);
    expect(sharp).toBeLessThan(green);
  });

  it('is deterministic and does NOT trace the displayed forecast blur', () => {
    const f = field();
    // Deterministic: no rng — two reads agree exactly.
    expect(sampleForecastSpread(f, 0.5, 0.5, 20, 60)).toBe(
      sampleForecastSpread(f, 0.5, 0.5, 20, 60)
    );
    // Fresh salts: the spread field's spatial shape differs from the blurred
    // forecast's deviation from truth (they'd correlate perfectly if the same
    // noise were reused). Compare sign patterns across a spread of points.
    const bounds = { minLat: 0, maxLat: 2, minLon: 0, maxLon: 2 };
    const truth = sampleWindGrid(f, bounds, 5, 5, 24);
    const shown = sampleForecastGrid(f, bounds, 5, 5, 24, 50);
    const spread = sampleForecastSpreadGrid(f, bounds, 5, 5, 24, 50);
    let matches = 0;
    for (let i = 0; i < truth.length; i += 1) {
      const blurErr = Math.abs(shown[i].speedKn - truth[i].speedKn) / Math.max(truth[i].speedKn, 1);
      const wide = spread[i].speedKn / Math.max(truth[i].speedKn, 1);
      // "Big blur error where the band is wide" — count coincidences.
      if ((blurErr > 0.15) === (wide > 0.15)) matches += 1;
    }
    expect(matches).toBeLessThan(truth.length); // not in lockstep
    // And the grid mirrors the pointwise read.
    expect(spread[0].speedKn).toBeCloseTo(
      sampleForecastSpread(f, bounds.minLat, bounds.minLon, 24, 50),
      10
    );
  });
});
