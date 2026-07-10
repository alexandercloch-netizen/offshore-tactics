import { resampleWorldToBounds } from '../components/harbour/worldField';
import { FlowCell } from '../components/flowField';
import { GeoBounds } from '../data/worldmap';

// The gate-false regions paint the GLOBAL field clipped to their box. Resampling
// must be honest interpolation: exact at a source node, sensible between them,
// and direction-safe through north — the same contract as the region blend.

const SRC: GeoBounds = { minLat: 0, maxLat: 30, minLon: 0, maxLon: 30 };

// A 4×4 world-shaped grid (north row first) with a known speed ramp: speed rises
// west→east, direction a uniform southerly (fromDeg 180).
function grid(): { cells: FlowCell[]; cols: number; rows: number } {
  const cols = 4;
  const rows = 4;
  const cells: FlowCell[] = [];
  for (let r = 0; r < rows; r += 1) {
    const lat = SRC.maxLat - (r * (SRC.maxLat - SRC.minLat)) / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const lon = SRC.minLon + (c * (SRC.maxLon - SRC.minLon)) / (cols - 1);
      cells.push({ lat, lon, dirDeg: 180, speedKn: 5 + c * 5 }); // 5,10,15,20 across
    }
  }
  return { cells, cols, rows };
}

describe('resampleWorldToBounds', () => {
  it('is exact at a source node', () => {
    // A target box whose corner lands on the source grid's NW node (lat 30,lon 0).
    const target: GeoBounds = { minLat: 20, maxLat: 30, minLon: 0, maxLon: 10 };
    const out = resampleWorldToBounds(grid(), target, 3, 3, SRC);
    // out[0] is the NW target corner = source NW node: speed 5, dir 180.
    expect(out[0].speedKn).toBeCloseTo(5, 6);
    expect(out[0].dirDeg).toBeCloseTo(180, 4);
  });

  it('interpolates speed between nodes', () => {
    // A point midway between the c=0 (5kn) and c=1 (10kn) source columns.
    const target: GeoBounds = { minLat: 30, maxLat: 30, minLon: 5, maxLon: 5 };
    const out = resampleWorldToBounds(grid(), target, 1, 1, SRC);
    expect(out).toHaveLength(1);
    expect(out[0].speedKn).toBeCloseTo(7.5, 4); // halfway 5→10
  });

  it('carries the source direction through the clip', () => {
    const target: GeoBounds = { minLat: 10, maxLat: 25, minLon: 8, maxLon: 22 };
    const out = resampleWorldToBounds(grid(), target, 5, 5, SRC);
    for (const cell of out) expect(cell.dirDeg).toBeCloseTo(180, 3);
  });

  it('fills the requested target resolution, row-major north-first', () => {
    const target: GeoBounds = { minLat: 5, maxLat: 25, minLon: 5, maxLon: 25 };
    const out = resampleWorldToBounds(grid(), target, 6, 8, SRC);
    expect(out).toHaveLength(48);
    expect(out[0].lat).toBeCloseTo(25, 6); // north row first
    expect(out[47].lat).toBeCloseTo(5, 6);
  });

  it('returns empty for a degenerate source', () => {
    expect(resampleWorldToBounds({ cells: [], cols: 0, rows: 0 }, SRC, 4, 4, SRC)).toHaveLength(0);
  });
});
