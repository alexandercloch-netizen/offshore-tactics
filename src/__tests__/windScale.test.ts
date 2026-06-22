import { windHeatColor } from '../components/windScale';

describe('windHeatColor', () => {
  it('returns an rgb() string across the range', () => {
    for (const kn of [0, 5, 12, 20, 30, 45, 60]) {
      expect(windHeatColor(kn)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    }
  });

  it('clamps below zero to the calm end and above max to the storm end', () => {
    expect(windHeatColor(-5)).toBe(windHeatColor(0));
    expect(windHeatColor(120)).toBe(windHeatColor(55));
  });

  it('shifts colour as the breeze builds (calm differs from gale)', () => {
    expect(windHeatColor(2)).not.toBe(windHeatColor(40));
  });
});
