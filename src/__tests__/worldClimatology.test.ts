import fs from 'fs';
import path from 'path';
import {
  WORLD_CLIMATOLOGY,
  WORLD_CLIMATOLOGY_OCEAN_COUNT,
  WORLD_CLIMATOLOGY_SOURCE,
} from '../data/worldClimatology';
import {
  WORLD_LATTICE_CELLS,
  WORLD_LATTICE_COLS,
  WORLD_LATTICE_ROWS,
  WORLD_NEAREST_OCEAN,
  WORLD_OCEAN_INDEX,
} from '../data/worldLattice';
import { seasonalWorldFlow } from '../services/weather';

// Contract for the baked world ocean climatology: complete (every ocean node,
// every month), quantised into honest ranges, dashboard-sized, and read back
// EXACTLY by seasonalWorldFlow — the seasonal world is the guest/CI story, so
// none of this may ever need the network.

describe('coverage & alignment', () => {
  it('carries one row per ocean node, aligned with the lattice fetch order', () => {
    expect(WORLD_CLIMATOLOGY).toHaveLength(WORLD_OCEAN_INDEX.length);
    expect(WORLD_CLIMATOLOGY_OCEAN_COUNT).toBe(WORLD_OCEAN_INDEX.length);
  });

  it('gives every node all 12 months of speed, direction and constancy', () => {
    for (const row of WORLD_CLIMATOLOGY) {
      expect(row).toHaveLength(36);
      for (let m = 0; m < 12; m += 1) {
        const speed = row[m];
        const dir = row[12 + m];
        const q = row[24 + m];
        expect(Number.isInteger(speed)).toBe(true);
        expect(speed).toBeGreaterThanOrEqual(0);
        expect(speed).toBeLessThanOrEqual(160); // half-knots, 0–80 kn
        expect(Number.isInteger(dir)).toBe(true);
        expect(dir).toBeGreaterThanOrEqual(0);
        expect(dir).toBeLessThanOrEqual(119); // 3° steps
        expect(Number.isInteger(q)).toBe(true);
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(10); // tenths
      }
    }
  });

  it('stays a dashboard payload (<80 KB committed)', () => {
    const file = path.join(__dirname, '..', 'data', 'worldClimatology.ts');
    expect(fs.statSync(file).size).toBeLessThan(80_000);
  });
});

describe('seasonalWorldFlow', () => {
  it('returns the full world grid in the lattice row-major order', () => {
    const flow = seasonalWorldFlow(6);
    expect(flow.cols).toBe(WORLD_LATTICE_COLS);
    expect(flow.rows).toBe(WORLD_LATTICE_ROWS);
    expect(flow.cells).toHaveLength(WORLD_LATTICE_CELLS.length);
    expect(flow.q).toHaveLength(WORLD_LATTICE_CELLS.length);
    flow.cells.forEach((cell, i) => {
      expect(cell.lat).toBe(WORLD_LATTICE_CELLS[i].lat);
      expect(cell.lon).toBe(WORLD_LATTICE_CELLS[i].lon);
    });
  });

  it('undoes the quantisation exactly at every ocean node', () => {
    for (const month of [0, 6, 11]) {
      const flow = seasonalWorldFlow(month);
      WORLD_OCEAN_INDEX.forEach((cellIndex, fetchPos) => {
        const row = WORLD_CLIMATOLOGY[fetchPos];
        expect(flow.cells[cellIndex].speedKn).toBe(row[month] / 2);
        expect(flow.cells[cellIndex].dirDeg).toBe(row[12 + month] * 3);
        expect(flow.q[cellIndex]).toBe(row[24 + month] / 10);
      });
    }
  });

  it('rehydrates land cells from their nearest ocean node', () => {
    const flow = seasonalWorldFlow(3);
    const oceanSet = new Set(WORLD_OCEAN_INDEX);
    for (let i = 0; i < WORLD_LATTICE_CELLS.length; i += 1) {
      if (oceanSet.has(i)) continue;
      const source = WORLD_CLIMATOLOGY[WORLD_NEAREST_OCEAN[i]];
      expect(flow.cells[i].speedKn).toBe(source[3] / 2);
      expect(flow.cells[i].dirDeg).toBe(source[15] * 3);
      expect(flow.q[i]).toBe(source[27] / 10);
    }
  });

  it('keeps direction on the compass and q in [0, 1]', () => {
    const flow = seasonalWorldFlow(9);
    for (let i = 0; i < flow.cells.length; i += 1) {
      expect(flow.cells[i].dirDeg).toBeGreaterThanOrEqual(0);
      expect(flow.cells[i].dirDeg).toBeLessThan(360);
      expect(flow.cells[i].speedKn).toBeGreaterThanOrEqual(0);
      expect(flow.q[i]).toBeGreaterThanOrEqual(0);
      expect(flow.q[i]).toBeLessThanOrEqual(1);
    }
  });

  it('clamps a wild month index instead of exploding', () => {
    expect(seasonalWorldFlow(-3).cells[0].speedKn).toBe(seasonalWorldFlow(0).cells[0].speedKn);
    expect(seasonalWorldFlow(42).cells[0].dirDeg).toBe(seasonalWorldFlow(11).cells[0].dirDeg);
  });
});

// Real-data physics: only meaningful when the committed bake is the genuine
// ERA5 run (the seed baseline is band-wise by construction and skips this).
describe('climatological honesty of the real bake', () => {
  const angleDelta = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };
  const nodeNear = (lat: number, lon: number): number => {
    let best = 0;
    let bestD = Infinity;
    WORLD_OCEAN_INDEX.forEach((cellIndex, fetchPos) => {
      const c = WORLD_LATTICE_CELLS[cellIndex];
      const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
      if (d < bestD) {
        bestD = d;
        best = fetchPos;
      }
    });
    return best;
  };

  it('sees the Arabian Sea monsoon reverse between January and July', () => {
    if (WORLD_CLIMATOLOGY_SOURCE !== 'era5') return;
    const row = WORLD_CLIMATOLOGY[nodeNear(15, 65)];
    expect(angleDelta(row[12] * 3, row[18] * 3)).toBeGreaterThan(90);
  });

  it('finds steady trades and shiftier mid-latitude westerlies', () => {
    if (WORLD_CLIMATOLOGY_SOURCE !== 'era5') return;
    const trades = WORLD_CLIMATOLOGY[nodeNear(17, -45)];
    const westerlies = WORLD_CLIMATOLOGY[nodeNear(47, -35)];
    // January constancy: the trade belt should read notably steadier.
    expect(trades[24] / 10).toBeGreaterThan(westerlies[24] / 10);
    expect(trades[24] / 10).toBeGreaterThanOrEqual(0.7);
  });
});
