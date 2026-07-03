import { projectionParams, buildProjector, chartViewportBounds } from '../components/projection';
import { courseAspect } from '../engine/geo';
import { Waypoint } from '../types';

// A small, real-ish coastal course (Solent-shaped) and a wide/tall one, so the
// projection maths is exercised across aspect ratios.
const solent: Waypoint[] = [
  { name: 'Start', type: 'start', lat: 50.76, lon: -1.3 },
  { name: 'Needles', type: 'turn', lat: 50.66, lon: -1.58 },
  { name: 'St Catherines', type: 'mark', lat: 50.57, lon: -1.3 },
  { name: 'Finish', type: 'finish', lat: 50.76, lon: -1.15 },
];

const W = 320;
const H = 200;

describe('projectionParams', () => {
  it('fits the course inside the padded viewport', () => {
    const p = projectionParams(solent, W, H);
    expect(p.scale).toBeGreaterThan(0);
    // Longitude compression k = cos(mean lat) is in (0,1] for a non-equatorial course.
    expect(p.k).toBeGreaterThan(0);
    expect(p.k).toBeLessThanOrEqual(1);
    // Centred: at least one axis is padded by CHART_PAD (26), the other letterboxed.
    expect(p.offsetX).toBeGreaterThanOrEqual(0);
    expect(p.offsetY).toBeGreaterThanOrEqual(0);
  });

  it('projects the corner marks inside the viewport bounds', () => {
    const project = buildProjector(solent, W, H);
    for (const wp of solent) {
      const { x, y } = project(wp.lat, wp.lon);
      expect(x).toBeGreaterThanOrEqual(-0.001);
      expect(x).toBeLessThanOrEqual(W + 0.001);
      expect(y).toBeGreaterThanOrEqual(-0.001);
      expect(y).toBeLessThanOrEqual(H + 0.001);
    }
  });

  it('is affine — north is up, east is right', () => {
    const project = buildProjector(solent, W, H);
    const south = project(50.5, -1.3);
    const north = project(50.9, -1.3);
    expect(north.y).toBeLessThan(south.y); // north maps to a smaller screen-y
    const west = project(50.7, -1.6);
    const east = project(50.7, -1.1);
    expect(east.x).toBeGreaterThan(west.x); // east maps to a larger screen-x
  });

  it('degenerate (single-point) span does not divide by zero', () => {
    const point: Waypoint[] = [
      { name: 'A', type: 'start', lat: 40, lon: -70 },
      { name: 'B', type: 'finish', lat: 40, lon: -70 },
    ];
    const p = projectionParams(point, W, H);
    expect(Number.isFinite(p.scale)).toBe(true);
    expect(Number.isFinite(p.offsetX)).toBe(true);
  });
});

describe('chartViewportBounds', () => {
  it('inverts the projection: the corners map back to the viewport edges', () => {
    const project = buildProjector(solent, W, H);
    const b = chartViewportBounds(solent, W, H);
    // Top-left corner (0,0) → (maxLat, minLon); bottom-right (W,H) → (minLat, maxLon).
    const topLeft = project(b.maxLat, b.minLon);
    const bottomRight = project(b.minLat, b.maxLon);
    expect(topLeft.x).toBeCloseTo(0, 3);
    expect(topLeft.y).toBeCloseTo(0, 3);
    expect(bottomRight.x).toBeCloseTo(W, 3);
    expect(bottomRight.y).toBeCloseTo(H, 3);
  });

  it('covers at least the course bounding box (fills the whole map)', () => {
    const b = chartViewportBounds(solent, W, H);
    const lats = solent.map((w) => w.lat);
    const lons = solent.map((w) => w.lon);
    expect(b.minLat).toBeLessThanOrEqual(Math.min(...lats) + 1e-6);
    expect(b.maxLat).toBeGreaterThanOrEqual(Math.max(...lats) - 1e-6);
    expect(b.minLon).toBeLessThanOrEqual(Math.min(...lons) + 1e-6);
    expect(b.maxLon).toBeGreaterThanOrEqual(Math.max(...lons) - 1e-6);
  });
});

describe('courseAspect', () => {
  it('is height ÷ width in the equirectangular projection', () => {
    // A course spanning 1° lat and 1° lon near 60°N: cos(60°)=0.5 compresses lon,
    // so the projected width is halved and the aspect (h/w) doubles vs raw degrees.
    const course: Waypoint[] = [
      { name: 'A', type: 'start', lat: 60, lon: 0 },
      { name: 'B', type: 'finish', lat: 61, lon: 1 },
    ];
    expect(courseAspect(course)).toBeCloseTo(1 / Math.cos((60.5 * Math.PI) / 180), 2);
  });

  it('is positive and finite for a real course', () => {
    const a = courseAspect(solent);
    expect(a).toBeGreaterThan(0);
    expect(Number.isFinite(a)).toBe(true);
  });
});
