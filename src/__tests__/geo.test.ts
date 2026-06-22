import {
  angularDelta,
  bearing,
  courseAspect,
  courseBounds,
  courseLengthNm,
  cumulativeDistances,
  haversineNm,
  pointAtFraction,
  pointOfSailFor,
} from '../engine/geo';
import { Waypoint } from '../types';

describe('haversineNm', () => {
  it('measures ~60 nm per degree of latitude', () => {
    expect(haversineNm(0, 0, 1, 0)).toBeCloseTo(60, 0);
  });

  it('measures ~60 nm per degree of longitude at the equator', () => {
    expect(haversineNm(0, 0, 0, 1)).toBeCloseTo(60, 0);
  });

  it('is zero for identical points', () => {
    expect(haversineNm(50, -1, 50, -1)).toBe(0);
  });
});

describe('bearing', () => {
  it('points north and east correctly', () => {
    expect(bearing(0, 0, 1, 0)).toBeCloseTo(0, 0);
    expect(bearing(0, 0, 0, 1)).toBeCloseTo(90, 0);
  });
});

describe('angularDelta', () => {
  it('returns the smallest angle between bearings', () => {
    expect(angularDelta(10, 350)).toBe(20);
    expect(angularDelta(0, 180)).toBe(180);
    expect(angularDelta(90, 90)).toBe(0);
  });
});

describe('pointOfSailFor', () => {
  it('classifies upwind, reach and downwind from heading vs wind', () => {
    expect(pointOfSailFor(0, 0)).toBe('Upwind');
    expect(pointOfSailFor(0, 90)).toBe('Reach');
    expect(pointOfSailFor(0, 180)).toBe('Downwind');
  });
});

describe('course geometry', () => {
  const course: Waypoint[] = [
    { name: 'A', lat: 0, lon: 0, type: 'start' },
    { name: 'B', lat: 0, lon: 1, type: 'turn' },
    { name: 'C', lat: 0, lon: 2, type: 'finish' },
  ];

  it('accumulates monotonically increasing distances starting at 0', () => {
    const cum = cumulativeDistances(course);
    expect(cum).toHaveLength(course.length);
    expect(cum[0]).toBe(0);
    expect(cum[1]).toBeGreaterThan(0);
    expect(cum[2]).toBeGreaterThan(cum[1]);
  });

  it('reports a total course length', () => {
    expect(courseLengthNm(course)).toBeCloseTo(120, 0);
  });

  it('interpolates the start, midpoint and finish', () => {
    const start = pointAtFraction(course, 0);
    const mid = pointAtFraction(course, 0.5);
    const finish = pointAtFraction(course, 1);
    expect(start.lon).toBeCloseTo(0, 5);
    expect(mid.lon).toBeCloseTo(1, 1);
    expect(finish.lon).toBeCloseTo(2, 5);
    expect(finish.segmentIndex).toBeGreaterThanOrEqual(0);
  });
});

describe('course bounds & aspect', () => {
  const wps: Waypoint[] = [
    { name: 'A', lat: 50, lon: -2, type: 'start' },
    { name: 'B', lat: 51, lon: -1, type: 'finish' },
  ];

  it('bounds the marks', () => {
    expect(courseBounds(wps)).toEqual({ minLat: 50, maxLat: 51, minLon: -2, maxLon: -1 });
  });

  it('reports height-to-width ratio in the cos-lat projection', () => {
    // spanLat = 1, spanLon = 1 * cos(~50.5°) ≈ 0.636, so aspect = 1 / 0.636 > 1.
    const k = Math.cos((50.5 * Math.PI) / 180);
    expect(courseAspect(wps)).toBeCloseTo(1 / k, 2);
  });

  it('is positive even for a degenerate (single-point span) course', () => {
    const flat: Waypoint[] = [
      { name: 'A', lat: 10, lon: 0, type: 'start' },
      { name: 'B', lat: 10, lon: 5, type: 'finish' },
    ];
    expect(courseAspect(flat)).toBeGreaterThan(0);
    expect(Number.isFinite(courseAspect(flat))).toBe(true);
  });
});
