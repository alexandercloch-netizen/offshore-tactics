import {
  buildFlowField,
  sampleFlow,
  windCells,
  tideCells,
  fieldResolution,
  FlowCell,
} from '../components/flowField';
import { sampleTideField, sampleCurrentGrid, createTidalField } from '../engine/current';
import { getRaceById } from '../data';
import { mulberry32, resetRng, setRng } from '../engine/rng';

afterEach(() => resetRng());

// A trivial identity-ish projection so pixel space == (lon, lat): screen x grows
// with lon, y grows with lat. buildFlowField only needs an affine projector.
const project = (lat: number, lon: number) => ({ x: lon, y: lat });

describe('buildFlowField / sampleFlow', () => {
  // A uniform 2×2 grid of a west wind (fromDeg 270 → blows toward the east).
  const cells: FlowCell[] = [
    { lat: 0, lon: 0, dirDeg: 270, speedKn: 10 },
    { lat: 0, lon: 1, dirDeg: 270, speedKn: 10 },
    { lat: 1, lon: 0, dirDeg: 270, speedKn: 10 },
    { lat: 1, lon: 1, dirDeg: 270, speedKn: 10 },
  ];

  it('points wind velocity downwind (a west wind drives particles east)', () => {
    const field = buildFlowField(cells, 2, 2, project, 'wind')!;
    expect(field).not.toBeNull();
    const v = sampleFlow(field, 0, 0);
    expect(v.vx).toBeGreaterThan(0); // east-going
    expect(Math.abs(v.vy)).toBeLessThan(1e-6); // no north/south component
    expect(v.kn).toBeCloseTo(10, 5);
  });

  it('treats tide direction as set (downstream), not origin', () => {
    const tide: FlowCell[] = cells.map((c) => ({ ...c, dirDeg: 90 })); // set due east
    const field = buildFlowField(tide, 2, 2, project, 'tide')!;
    const v = sampleFlow(field, 0.5, 0.5);
    expect(v.vx).toBeGreaterThan(0); // flowing east
    expect(Math.abs(v.vy)).toBeLessThan(1e-6);
  });

  it('clamps samples outside the grid to the edge rather than reading out of bounds', () => {
    const field = buildFlowField(cells, 2, 2, project, 'wind')!;
    const inside = sampleFlow(field, 0.5, 0.5);
    const outside = sampleFlow(field, 99, 99);
    expect(outside.vx).toBeCloseTo(inside.vx, 5); // uniform field → clamped == interior
  });

  it('refuses a degenerate grid', () => {
    expect(buildFlowField(cells, 1, 1, project, 'wind')).toBeNull();
    expect(buildFlowField([], 2, 2, project, 'wind')).toBeNull();
  });
});

describe('sampleTideField (full grid for the colour map + flow)', () => {
  it('returns every cell, slack included, unlike the arrow grid that drops them', () => {
    setRng(mulberry32(3));
    const race = getRaceById('race-round-island')!;
    const field = createTidalField(race);
    const bounds = { minLat: 50.5, maxLat: 50.9, minLon: -1.6, maxLon: -1.0 };
    const full = sampleTideField(field, bounds, 6, 5, 0);
    expect(full.length).toBe(30); // 6×5, none dropped
    // The slack-dropping arrow grid returns no more cells, usually fewer.
    const arrows = sampleCurrentGrid(field, bounds, 6, 5, 0);
    expect(arrows.length).toBeLessThanOrEqual(full.length);
    // Every full-grid cell carries a finite, non-negative rate.
    for (const c of full) {
      expect(Number.isFinite(c.rateKn)).toBe(true);
      expect(c.rateKn).toBeGreaterThanOrEqual(0);
    }
  });

  it('yields a full grid even with no tidal field (all slack)', () => {
    const full = sampleTideField(undefined, { minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 }, 4, 4, 0);
    expect(full.length).toBe(16);
    expect(full.every((c) => c.rateKn === 0)).toBe(true);
  });
});

describe('cell adapters', () => {
  it('windCells carries fromDeg as the direction', () => {
    const out = windCells([{ lat: 1, lon: 2, fromDeg: 200, speedKn: 12 }]);
    expect(out[0]).toEqual({ lat: 1, lon: 2, dirDeg: 200, speedKn: 12 });
  });

  it('tideCells carries setDeg as the direction and rate as the speed', () => {
    const out = tideCells([{ lat: 1, lon: 2, setDeg: 80, rateKn: 1.5 }]);
    expect(out[0]).toEqual({ lat: 1, lon: 2, dirDeg: 80, speedKn: 1.5 });
  });
});

describe('fieldResolution (heatmap density)', () => {
  it('never drops below the floor, so even a small phone map stays smooth', () => {
    const r = fieldResolution(300, 280);
    expect(r.cols).toBeGreaterThanOrEqual(40);
    expect(r.rows).toBeGreaterThanOrEqual(36);
  });

  it('adds density on a larger chart but stays under the node-count caps', () => {
    const big = fieldResolution(1600, 1200);
    const small = fieldResolution(300, 280);
    expect(big.cols).toBeGreaterThan(small.cols);
    expect(big.cols).toBeLessThanOrEqual(56);
    expect(big.rows).toBeLessThanOrEqual(64);
  });

  it('survives a degenerate (pre-layout) zero size without collapsing', () => {
    const r = fieldResolution(0, 0);
    expect(r.cols).toBeGreaterThanOrEqual(40);
    expect(r.rows).toBeGreaterThanOrEqual(36);
  });
});
