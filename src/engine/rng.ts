// Injectable random source so the game is non-deterministic in play but fully
// deterministic under test. Engine and data modules call `rnd()` instead of
// Math.random; tests call `setRng(mulberry32(seed))` to pin the sequence.

export type Rng = () => number;

// Small, fast, well-distributed seeded PRNG.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let current: Rng = Math.random;

export function setRng(rng: Rng): void {
  current = rng;
}

export function resetRng(): void {
  current = Math.random;
}

export function rnd(): number {
  return current();
}

// Uniform float in [min, max).
export function rndRange(min: number, max: number): number {
  return min + rnd() * (max - min);
}

// Integer in [0, n).
export function rndInt(n: number): number {
  return Math.floor(rnd() * n);
}

export function rndPick<T>(items: T[]): T {
  return items[rndInt(items.length)];
}
