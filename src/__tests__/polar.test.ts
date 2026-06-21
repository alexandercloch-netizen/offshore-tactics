import { bestVmgAngles, noGoAngle, polarSpeed } from '../engine/polar';
import { getBoatById } from '../data';

const boat = getBoatById('boat-mistral')!;

describe('polarSpeed', () => {
  it('cannot sail inside the no-go zone', () => {
    const ng = noGoAngle(boat);
    expect(polarSpeed(boat, ng - 5, 14)).toBe(0);
    expect(polarSpeed(boat, 0, 14)).toBe(0);
  });

  it('makes way once cracked off onto a reach', () => {
    expect(polarSpeed(boat, 90, 14)).toBeGreaterThan(0);
    expect(polarSpeed(boat, 135, 14)).toBeGreaterThan(0);
  });

  it('folds signed and reflex angles into 0..180', () => {
    expect(polarSpeed(boat, 90, 14)).toBeCloseTo(polarSpeed(boat, -90, 14), 6);
    expect(polarSpeed(boat, 100, 14)).toBeCloseTo(polarSpeed(boat, 260, 14), 6);
  });

  it('is slower in light air than in a breeze on the same angle', () => {
    expect(polarSpeed(boat, 100, 6)).toBeLessThan(polarSpeed(boat, 100, 14));
  });
});

describe('bestVmgAngles', () => {
  it('finds sensible upwind and downwind VMG angles', () => {
    const v = bestVmgAngles(boat, 14);
    expect(v.upAngle).toBeGreaterThan(noGoAngle(boat) - 1);
    expect(v.upAngle).toBeLessThan(90);
    expect(v.downAngle).toBeGreaterThan(90);
    expect(v.downAngle).toBeLessThanOrEqual(180);
    expect(v.upVmg).toBeGreaterThan(0);
    expect(v.downVmg).toBeGreaterThan(0);
  });
});

describe('noGoAngle', () => {
  it('rewards better-pointing boats with a tighter no-go', () => {
    const good = { ...boat, upwind: 95 };
    const poor = { ...boat, upwind: 40 };
    expect(noGoAngle(good)).toBeLessThan(noGoAngle(poor));
  });
});
