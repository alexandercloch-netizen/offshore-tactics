import {
  computeTargets,
  interpolatePolar,
  polarBestVmg,
  polarNoGo,
} from '../engine/polarTable';
import { BoatPolar } from '../types';

function makePolar(): BoatPolar {
  const polar: BoatPolar = {
    tws: [6, 12],
    twa: [40, 90, 150],
    speed: [
      [3, 5],
      [5, 8],
      [4, 7],
    ],
    targets: { beatAngle: [], beatSpeed: [], runAngle: [], runSpeed: [] },
    source: 'class',
  };
  polar.targets = computeTargets(polar);
  return polar;
}

describe('interpolatePolar', () => {
  const polar = makePolar();

  it('returns exact values at grid points', () => {
    expect(interpolatePolar(polar, 40, 6)).toBeCloseTo(3, 5);
    expect(interpolatePolar(polar, 90, 12)).toBeCloseTo(8, 5);
    expect(interpolatePolar(polar, 150, 6)).toBeCloseTo(4, 5);
  });

  it('interpolates between rows and columns', () => {
    const v = interpolatePolar(polar, 65, 6); // between 40(3) and 90(5)
    expect(v).toBeGreaterThan(3);
    expect(v).toBeLessThan(5);
  });

  it('is zero inside the no-go zone (below the first TWA)', () => {
    expect(interpolatePolar(polar, 20, 12)).toBe(0);
  });

  it('clamps wind speed beyond the table edges', () => {
    expect(interpolatePolar(polar, 90, 2)).toBeCloseTo(5, 5); // clamp to 6 kn col
    expect(interpolatePolar(polar, 90, 30)).toBeCloseTo(8, 5); // clamp to 12 kn col
  });
});

describe('computeTargets', () => {
  it('finds upwind targets below 90 and downwind targets above 90', () => {
    const polar = makePolar();
    polar.targets.beatAngle.forEach((a) => {
      expect(a).toBeGreaterThanOrEqual(40);
      expect(a).toBeLessThan(90);
    });
    polar.targets.runAngle.forEach((a) => {
      expect(a).toBeGreaterThan(90);
      expect(a).toBeLessThanOrEqual(180);
    });
  });
});

describe('polarNoGo / polarBestVmg', () => {
  const polar = makePolar();

  it('no-go is at or below the tightest beat angle', () => {
    expect(polarNoGo(polar)).toBeLessThanOrEqual(Math.min(...polar.targets.beatAngle));
  });

  it('gives positive up/down VMG at a mid wind speed', () => {
    const v = polarBestVmg(polar, 9);
    expect(v.upVmg).toBeGreaterThan(0);
    expect(v.downVmg).toBeGreaterThan(0);
    expect(v.upAngle).toBeLessThan(90);
    expect(v.downAngle).toBeGreaterThan(90);
  });
});
