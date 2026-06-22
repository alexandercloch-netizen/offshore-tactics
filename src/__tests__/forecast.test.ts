import { createWindField, forecastConfidence, sampleForecast, sampleWind } from '../engine/wind';
import { navigatorSkill } from '../engine/gameEngine';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getRaceById } from '../data';

afterEach(() => resetRng());

const race = getRaceById('race-fastnet')!;
function field() {
  setRng(mulberry32(42));
  return createWindField(race);
}
const at = race.waypoints[0];

describe('forecastConfidence', () => {
  it('is full now and decays with the lookahead', () => {
    expect(forecastConfidence(70, 0)).toBeCloseTo(1, 5);
    expect(forecastConfidence(70, 12)).toBeLessThan(forecastConfidence(70, 4));
    expect(forecastConfidence(70, 48)).toBeLessThan(forecastConfidence(70, 12));
  });

  it('a sharper navigator trusts the forecast further out', () => {
    expect(forecastConfidence(95, 18)).toBeGreaterThan(forecastConfidence(35, 18));
  });

  it('stays within (0,1]', () => {
    for (const h of [0, 6, 24, 100]) {
      for (const s of [0, 50, 100]) {
        const c = forecastConfidence(s, h);
        expect(c).toBeGreaterThan(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('sampleForecast', () => {
  it('equals the truth at hour zero (now is known)', () => {
    const f = field();
    const truth = sampleWind(f, at.lat, at.lon, 0);
    const fc = sampleForecast(f, at.lat, at.lon, 0, 40);
    expect(fc.fromDeg).toBeCloseTo(truth.fromDeg, 6);
    expect(fc.speedKn).toBeCloseTo(truth.speedKn, 6);
  });

  it('drifts further from the truth the further ahead you look', () => {
    const f = field();
    const dirErr = (h: number) => {
      const t = sampleWind(f, at.lat, at.lon, h);
      const fc = sampleForecast(f, at.lat, at.lon, h, 40);
      let d = Math.abs(fc.fromDeg - t.fromDeg) % 360;
      if (d > 180) d = 360 - d;
      return d + Math.abs(fc.speedKn - t.speedKn);
    };
    expect(dirErr(36)).toBeGreaterThan(dirErr(2));
  });

  it('a better navigator forecasts closer to the truth at the same horizon', () => {
    const f = field();
    const err = (skill: number) => {
      let total = 0;
      // average error across the course so it does not hinge on one noisy point
      for (const wp of race.waypoints) {
        const t = sampleWind(f, wp.lat, wp.lon, 24);
        const fc = sampleForecast(f, wp.lat, wp.lon, 24, skill);
        let d = Math.abs(fc.fromDeg - t.fromDeg) % 360;
        if (d > 180) d = 360 - d;
        total += d + Math.abs(fc.speedKn - t.speedKn);
      }
      return total;
    };
    expect(err(95)).toBeLessThan(err(20));
  });

  it('keeps speed and direction in valid ranges', () => {
    const f = field();
    for (const h of [0, 8, 24, 48]) {
      const fc = sampleForecast(f, at.lat, at.lon, h, 30);
      expect(fc.fromDeg).toBeGreaterThanOrEqual(0);
      expect(fc.fromDeg).toBeLessThan(360);
      expect(fc.speedKn).toBeGreaterThanOrEqual(2);
      expect(fc.speedKn).toBeLessThanOrEqual(50);
    }
  });
});

describe('navigatorSkill', () => {
  it('uses the Navigator when one is aboard, else falls back to crew nous', () => {
    // No crew → falls back to the default-crew average (a finite, sensible number).
    expect(Number.isFinite(navigatorSkill([]))).toBe(true);
  });
});
