import { isochroneLeg, planRoute } from '../engine/router';
import { bearing, haversineNm } from '../engine/geo';
import { getBoatById, getRaceById } from '../data';
import { GeoPoint, WindField } from '../types';

const boat = getBoatById('boat-mistral')!;

// Steady, uniform wind from the given direction — no shifts, gradient or feature.
function steady(fromDeg: number, speedKn: number): WindField {
  return {
    baseDir: fromDeg,
    baseSpeed: speedKn,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 0,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat: 0,
    refLon: 0,
    feature: { lat: 0, lon: 0, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

function pathLength(path: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += haversineNm(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon);
  }
  return total;
}

describe('isochroneLeg', () => {
  it('tacks upwind: the routed path is longer than the rhumb line', () => {
    const from: GeoPoint = { lat: 0, lon: 0 };
    const to: GeoPoint = { lat: 1, lon: 0 }; // due north
    const field = steady(0, 14); // wind from the north => dead upwind
    const path = isochroneLeg(boat, field, from, to, 0);
    const direct = haversineNm(from.lat, from.lon, to.lat, to.lon);

    expect(path.length).toBeGreaterThan(2); // at least one tack
    expect(pathLength(path)).toBeGreaterThan(direct * 1.1);
    const end = path[path.length - 1];
    expect(haversineNm(end.lat, end.lon, to.lat, to.lon)).toBeLessThan(2);
  });

  it('reaches: the routed path is close to the rhumb line', () => {
    const from: GeoPoint = { lat: 0, lon: 0 };
    const to: GeoPoint = { lat: 0, lon: 1 }; // due east
    const field = steady(0, 14); // wind from north => beam reach
    const path = isochroneLeg(boat, field, from, to, 0);
    const direct = haversineNm(from.lat, from.lon, to.lat, to.lon);

    expect(pathLength(path)).toBeLessThan(direct * 1.3);
    const end = path[path.length - 1];
    expect(haversineNm(end.lat, end.lon, to.lat, to.lon)).toBeLessThan(2);
  });

  it('returns a trivial path for a very short SAILABLE leg', () => {
    const from: GeoPoint = { lat: 0, lon: 0 };
    const to: GeoPoint = { lat: 0.01, lon: 0 };
    // Wind from the east: the 0.6 nm hop due north is a beam reach — the
    // shortcut stays a plain rhumb, byte-identical to the old contract.
    expect(isochroneLeg(boat, steady(90, 14), from, to, 0)).toEqual([from, to]);
  });

  it('beats a very short leg that lies in the no-go zone', () => {
    const from: GeoPoint = { lat: 0, lon: 0 };
    const to: GeoPoint = { lat: 0.01, lon: 0 };
    // Wind FROM north: the rhumb is dead upwind. The old shortcut returned it
    // anyway and the sim crawled the speed floor for hours (the Cowes Day 1
    // balloon); now the leg comes back as one clean tack via the VMG corner.
    const path = isochroneLeg(boat, steady(0, 14), from, to, 0);
    expect(path.length).toBe(3);
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
    // Both boards are sailable — neither segment points into the no-go zone.
    for (let i = 1; i < path.length; i += 1) {
      const brg = bearing(path[i - 1].lat, path[i - 1].lon, path[i].lat, path[i].lon);
      const twa = Math.min(Math.abs(brg - 0), 360 - Math.abs(brg - 0));
      expect(twa).toBeGreaterThanOrEqual(30);
    }
  });
});

describe('planRoute', () => {
  it('routes the active leg and rhumbs the remaining marks to the finish', () => {
    const race = getRaceById('race-caribbean-600')!;
    const marks = race.waypoints;
    const from: GeoPoint = { lat: marks[0].lat, lon: marks[0].lon };
    const route = planRoute(boat, steady(75, 16), from, marks, 1, 0);

    expect(route.length).toBeGreaterThanOrEqual(marks.length - 1);
    const end = route[route.length - 1];
    const finish = marks[marks.length - 1];
    expect(haversineNm(end.lat, end.lon, finish.lat, finish.lon)).toBeLessThan(1);
  });

  it('banks left vs right to opposite sides of the rhumb line', () => {
    const race = getRaceById('race-newport-bermuda')!;
    const marks = race.waypoints;
    const from: GeoPoint = { lat: marks[0].lat, lon: marks[0].lon };
    const field = steady(225, 15);

    const left = planRoute(boat, field, from, marks, 1, 0, -1);
    const right = planRoute(boat, field, from, marks, 1, 0, 1);

    // Sample the routes a third of the way along and check they diverge.
    const lMid = left[Math.floor(left.length / 3)];
    const rMid = right[Math.floor(right.length / 3)];
    expect(haversineNm(lMid.lat, lMid.lon, rMid.lat, rMid.lon)).toBeGreaterThan(5);

    // Both still finish at the last mark.
    const finish = marks[marks.length - 1];
    for (const route of [left, right]) {
      const end = route[route.length - 1];
      expect(haversineNm(end.lat, end.lon, finish.lat, finish.lon)).toBeLessThan(1);
    }
  });
});
