import { mulberry32, rnd, rndInt, rndPick, setRng, resetRng } from '../engine/rng';

afterEach(() => resetRng());

describe('mulberry32', () => {
  it('produces a deterministic sequence for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('returns values in [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('injectable rng helpers', () => {
  it('rnd() uses the injected source', () => {
    setRng(mulberry32(99));
    const direct = mulberry32(99)();
    expect(rnd()).toBeCloseTo(direct, 10);
  });

  it('rndInt stays within range and rndPick returns a member', () => {
    setRng(mulberry32(3));
    for (let i = 0; i < 100; i += 1) {
      const n = rndInt(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
    const items = ['a', 'b', 'c'];
    expect(items).toContain(rndPick(items));
  });
});
