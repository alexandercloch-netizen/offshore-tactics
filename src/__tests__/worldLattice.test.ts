import {
  WORLD_LATTICE_CELLS,
  WORLD_LATTICE_COLS,
  WORLD_LATTICE_ROWS,
  WORLD_NEAREST_OCEAN,
  WORLD_OCEAN_INDEX,
} from '../data/worldLattice';
import { WORLD_BOUNDS, WORLD_LAND } from '../data/worldmap';
import { haversineNm } from '../engine/geo';

// Coverage contract for the baked world weather lattice: a regular 10° grid in
// windBlend/buildFlowField's row-major north-first order, an ocean subset that
// is genuinely at sea and small enough for ONE batched GET, and a total
// nearest-ocean map so a fetched ocean set always rehydrates to the full grid.

describe('the lattice grid', () => {
  it('is the full 36×13 regular 10° grid, north row first, west column first', () => {
    expect(WORLD_LATTICE_COLS).toBe(36);
    expect(WORLD_LATTICE_ROWS).toBe(13);
    expect(WORLD_LATTICE_CELLS).toHaveLength(36 * 13);
    for (let r = 0; r < WORLD_LATTICE_ROWS; r += 1) {
      for (let c = 0; c < WORLD_LATTICE_COLS; c += 1) {
        const cell = WORLD_LATTICE_CELLS[r * WORLD_LATTICE_COLS + c];
        expect(cell.lat).toBe(67 - r * 10);
        expect(cell.lon).toBe(-175 + c * 10);
      }
    }
  });

  it('stays inside the world chart box', () => {
    for (const cell of WORLD_LATTICE_CELLS) {
      expect(cell.lat).toBeGreaterThanOrEqual(WORLD_BOUNDS.minLat);
      expect(cell.lat).toBeLessThanOrEqual(WORLD_BOUNDS.maxLat);
      expect(cell.lon).toBeGreaterThanOrEqual(WORLD_BOUNDS.minLon);
      expect(cell.lon).toBeLessThanOrEqual(WORLD_BOUNDS.maxLon);
    }
  });
});

describe('the ocean subset', () => {
  it('fits one batched GET (the measured 480-point ceiling) and is not empty', () => {
    expect(WORLD_OCEAN_INDEX.length).toBeGreaterThan(200); // most of the planet is sea
    expect(WORLD_OCEAN_INDEX.length).toBeLessThanOrEqual(480);
  });

  it('lists valid, unique cell indices in ascending fetch order', () => {
    const seen = new Set<number>();
    let prev = -1;
    for (const i of WORLD_OCEAN_INDEX) {
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(WORLD_LATTICE_CELLS.length);
      expect(seen.has(i)).toBe(false);
      expect(i).toBeGreaterThan(prev);
      seen.add(i);
      prev = i;
    }
  });

  it('clips to the honest ocean latitudes (60S–65N)', () => {
    for (const i of WORLD_OCEAN_INDEX) {
      const cell = WORLD_LATTICE_CELLS[i];
      expect(cell.lat).toBeGreaterThanOrEqual(-60);
      expect(cell.lat).toBeLessThanOrEqual(65);
    }
  });

  // The bake classifies against the SOURCE-resolution Natural Earth polygons
  // (≥25 km offshore); CI doesn't carry those, so the committed simplified
  // silhouette is the sanity proxy: a genuinely-offshore node must never sit
  // on even the coarse land (holes are lakes — inside one is still not ocean).
  const inRing = (lon: number, lat: number, ring: number[][]): boolean => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  it('puts every ocean node in the water of the world silhouette', () => {
    for (const i of WORLD_OCEAN_INDEX) {
      const cell = WORLD_LATTICE_CELLS[i];
      let onLand = false;
      for (const polygon of WORLD_LAND) {
        if (!inRing(cell.lon, cell.lat, polygon[0])) continue;
        let inHole = false;
        for (let r = 1; r < polygon.length; r += 1) {
          if (inRing(cell.lon, cell.lat, polygon[r])) inHole = true;
        }
        if (!inHole) {
          onLand = true;
          break;
        }
      }
      expect(onLand).toBe(false);
    }
  });
});

describe('the nearest-ocean rehydration map', () => {
  it('is total: one entry per cell, each a valid fetch position', () => {
    expect(WORLD_NEAREST_OCEAN).toHaveLength(WORLD_LATTICE_CELLS.length);
    for (const k of WORLD_NEAREST_OCEAN) {
      expect(Number.isInteger(k)).toBe(true);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(WORLD_OCEAN_INDEX.length);
    }
  });

  it('maps every ocean cell to its own sample', () => {
    WORLD_OCEAN_INDEX.forEach((cellIndex, fetchPos) => {
      expect(WORLD_NEAREST_OCEAN[cellIndex]).toBe(fetchPos);
    });
  });

  it('really is the nearest ocean node, cell by cell', () => {
    for (let i = 0; i < WORLD_LATTICE_CELLS.length; i += 1) {
      const cell = WORLD_LATTICE_CELLS[i];
      const chosen = WORLD_LATTICE_CELLS[WORLD_OCEAN_INDEX[WORLD_NEAREST_OCEAN[i]]];
      const chosenNm = haversineNm(cell.lat, cell.lon, chosen.lat, chosen.lon);
      for (const oi of WORLD_OCEAN_INDEX) {
        const other = WORLD_LATTICE_CELLS[oi];
        const d = haversineNm(cell.lat, cell.lon, other.lat, other.lon);
        expect(chosenNm).toBeLessThanOrEqual(d + 1e-6);
      }
    }
  });
});
