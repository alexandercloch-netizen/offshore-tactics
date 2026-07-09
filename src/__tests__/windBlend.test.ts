import {
  blendCoverageOk,
  blendWindGrid,
  meanFromDeg,
  WindPoint,
} from '../components/harbour/windBlend';
import { GeoBounds, REGION_BOUNDS } from '../data/worldmap';
import { regionRaces } from '../components/harbour/regions';

// The Harbour's blended field must be honest interpolation: exact at every
// real sample, sensible between them, and direction-safe through north.

const box: GeoBounds = { minLat: 50, maxLat: 51, minLon: -2, maxLon: 0 };

const pt = (lat: number, lon: number, fromDeg: number, speedKn: number): WindPoint => ({
  lat,
  lon,
  fromDeg,
  speedKn,
});

describe('blendWindGrid', () => {
  it('is exact at a sample point', () => {
    // A 3×3 grid over the box puts a node exactly on the centre sample.
    const cells = blendWindGrid([pt(50.5, -1, 225, 14)], box, 3, 3);
    const centre = cells[4];
    expect(centre.dirDeg).toBeCloseTo(225, 6);
    expect(centre.speedKn).toBeCloseTo(14, 6);
  });

  it('blends speed between two samples and leans toward the nearer one', () => {
    const cells = blendWindGrid([pt(50.5, -2, 270, 10), pt(50.5, 0, 270, 20)], box, 5, 3);
    const mid = cells[1 * 5 + 2]; // centre node, equidistant
    expect(mid.speedKn).toBeCloseTo(15, 1);
    const nearLight = cells[1 * 5 + 1];
    expect(nearLight.speedKn).toBeLessThan(mid.speedKn);
  });

  it('blends direction through north, never via the phantom southerly', () => {
    const cells = blendWindGrid([pt(50.5, -2, 350, 10), pt(50.5, 0, 10, 10)], box, 5, 3);
    const mid = cells[1 * 5 + 2];
    // 350° and 010° meet at due north (0°), not 180°.
    const folded = Math.min(mid.dirDeg, 360 - mid.dirDeg);
    expect(folded).toBeLessThan(1);
  });

  it('keeps real breeze strength between opposing directions', () => {
    // Vector-averaging speeds would cancel to ~0 here; scalars must not.
    const cells = blendWindGrid([pt(50.5, -2, 0, 12), pt(50.5, 0, 180, 12)], box, 5, 3);
    const mid = cells[1 * 5 + 2];
    expect(mid.speedKn).toBeCloseTo(12, 1);
  });

  it('returns an empty grid for no samples, full row-major coverage otherwise', () => {
    expect(blendWindGrid([], box, 4, 4)).toHaveLength(0);
    const cells = blendWindGrid([pt(50.5, -1, 90, 8)], box, 4, 6);
    expect(cells).toHaveLength(24);
    // Row-major, north row first (matches sampleWindGrid's contract).
    expect(cells[0].lat).toBeCloseTo(box.maxLat, 6);
    expect(cells[23].lat).toBeCloseTo(box.minLat, 6);
  });
});

describe('blendCoverageOk — the 500 km honesty gate', () => {
  // The real question the gate answers: are this region's course waypoints
  // dense enough that IDW across its box is a read, not an invention?
  const anchors = (key: 'uk' | 'usWest') =>
    regionRaces(key).flatMap((race) => race.waypoints.map((w) => ({ lat: w.lat, lon: w.lon })));

  it('passes the UK box — its three courses genuinely cover the Western Approaches', () => {
    expect(blendCoverageOk(anchors('uk'), REGION_BOUNDS.uk)).toBe(true);
  });

  it('fails the usWest box — 4,700 km of Pacific between four courses is not coverage', () => {
    expect(blendCoverageOk(anchors('usWest'), REGION_BOUNDS.usWest)).toBe(false);
  });

  it('is false with no samples at all', () => {
    expect(blendCoverageOk([], box)).toBe(false);
  });

  it('honours the maxKm knob and covers a snug box with one point', () => {
    // The little test box spans well under 500 km; one mid-box point covers it.
    expect(blendCoverageOk([{ lat: 50.5, lon: -1 }], box)).toBe(true);
    // Squeeze the tolerance below the corner distance and it must refuse.
    expect(blendCoverageOk([{ lat: 50.5, lon: -1 }], box, 10)).toBe(false);
  });
});

describe('meanFromDeg', () => {
  it('averages through north', () => {
    const mean = meanFromDeg([pt(0, 0, 350, 1), pt(0, 0, 10, 1)])!;
    expect(Math.min(mean, 360 - mean)).toBeLessThan(1);
  });

  it('is undefined with no points and stable for one', () => {
    expect(meanFromDeg([])).toBeUndefined();
    expect(meanFromDeg([pt(0, 0, 123, 5)])).toBeCloseTo(123, 6);
  });
});
