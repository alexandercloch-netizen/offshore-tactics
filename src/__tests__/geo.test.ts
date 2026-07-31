import {
  angularDelta,
  bearing,
  courseAspect,
  courseBounds,
  courseLengthNm,
  courseWindProfile,
  cumulativeDistances,
  haversineNm,
  isLoopCourse,
  pointAtFraction,
  pointOfSailFor,
} from '../engine/geo';
import { Waypoint } from '../types';

describe('courseWindProfile', () => {
  const wp = (lat: number, lon: number): Waypoint => ({ name: `${lat},${lon}`, lat, lon, type: 'turn' });

  it('reads a due-north course in a northerly as all upwind', () => {
    const legs = [wp(0, 0), wp(1, 0)]; // heading ~0° (north)
    const p = courseWindProfile(legs, 0); // wind from the north
    expect(p.upwind).toBeCloseTo(1, 5);
    expect(p.reach + p.downwind).toBeCloseTo(0, 5);
  });

  it('reads that same course in a southerly as all downwind', () => {
    const p = courseWindProfile([wp(0, 0), wp(1, 0)], 180); // wind from the south, sailing north
    expect(p.downwind).toBeCloseTo(1, 5);
  });

  it('distance-weights legs and always sums to 1', () => {
    // A long northbound beat then a short eastbound reach, wind from the north.
    const p = courseWindProfile([wp(0, 0), wp(2, 0), wp(2, 0.2)], 0);
    expect(p.upwind).toBeGreaterThan(p.reach);
    expect(p.upwind + p.reach + p.downwind).toBeCloseTo(1, 5);
  });

  it('is 0/0/0 for a degenerate zero-length course', () => {
    expect(courseWindProfile([wp(10, 10), wp(10, 10)], 0)).toEqual({ upwind: 0, reach: 0, downwind: 0 });
  });
});

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

describe('isLoopCourse', () => {
  const wp = (name: string, type: Waypoint['type'], lat: number, lon: number): Waypoint => ({
    name,
    type,
    lat,
    lon,
  });

  it('is true when start and finish share a buoy (Round the Island)', () => {
    const course = [
      wp('Cowes', 'start', 50.76, -1.3),
      wp('The Needles', 'turn', 50.655, -1.6),
      wp('Cowes', 'finish', 50.76, -1.3),
    ];
    expect(isLoopCourse(course)).toBe(true);
  });

  it('is false for a point-to-point course', () => {
    const course = [
      wp('Newport', 'start', 41.45, -71.34),
      wp('Bermuda', 'finish', 32.36, -64.65),
    ];
    expect(isLoopCourse(course)).toBe(false);
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
