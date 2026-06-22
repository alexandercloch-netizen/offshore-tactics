import { PointOfSail, Waypoint } from '../types';

const R_NM = 3440.065; // Earth radius in nautical miles
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

// Great-circle distance between two lat/lon points, in nautical miles.
export function haversineNm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Initial bearing (degrees, 0 = N) from point A to point B.
export function bearing(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLon = toRad(bLon - aLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Cumulative along-track distances (nm) at each waypoint; index 0 is 0.
export function cumulativeDistances(waypoints: Waypoint[]): number[] {
  const cumulative: number[] = [0];
  for (let i = 1; i < waypoints.length; i += 1) {
    const prev = waypoints[i - 1];
    const wp = waypoints[i];
    cumulative.push(
      cumulative[i - 1] + haversineNm(prev.lat, prev.lon, wp.lat, wp.lon)
    );
  }
  return cumulative;
}

export function courseLengthNm(waypoints: Waypoint[]): number {
  const cumulative = cumulativeDistances(waypoints);
  return cumulative[cumulative.length - 1] ?? 0;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  bearing: number; // heading of the segment the point sits on
  segmentIndex: number;
}

// Position along the real course at a given fraction (0..1) of the total
// geographic length, with the bearing of the segment it lies on.
export function pointAtFraction(
  waypoints: Waypoint[],
  fraction: number
): TrackPoint {
  if (waypoints.length === 0) {
    return { lat: 0, lon: 0, bearing: 0, segmentIndex: 0 };
  }
  if (waypoints.length === 1) {
    const wp = waypoints[0];
    return { lat: wp.lat, lon: wp.lon, bearing: 0, segmentIndex: 0 };
  }
  const cumulative = cumulativeDistances(waypoints);
  const total = cumulative[cumulative.length - 1];
  const target = Math.max(0, Math.min(1, fraction)) * total;

  let seg = 0;
  while (seg < cumulative.length - 2 && cumulative[seg + 1] < target) {
    seg += 1;
  }
  const a = waypoints[seg];
  const b = waypoints[seg + 1];
  const segLen = cumulative[seg + 1] - cumulative[seg] || 1;
  const t = Math.max(0, Math.min(1, (target - cumulative[seg]) / segLen));
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
    bearing: bearing(a.lat, a.lon, b.lat, b.lon),
    segmentIndex: seg,
  };
}

// Forward step: the point reached by sailing `distNm` from (lat, lon) on the
// given compass bearing. Equirectangular approximation — fine for short steps.
export function movePoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distNm: number
): { lat: number; lon: number } {
  const brg = toRad(bearingDeg);
  const dLat = (distNm * Math.cos(brg)) / 60;
  const cosLat = Math.cos(toRad(lat)) || 1e-6;
  const dLon = (distNm * Math.sin(brg)) / (60 * cosLat);
  return { lat: lat + dLat, lon: lon + dLon };
}

// Smallest absolute angle (0..180) between two compass bearings.
export function angularDelta(a: number, b: number): number {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return diff;
}

// Point of sail from the boat's heading relative to where the wind blows FROM.
export function pointOfSailFor(heading: number, windFrom: number): PointOfSail {
  const delta = angularDelta(heading, windFrom);
  if (delta < 60) return 'Upwind';
  if (delta < 120) return 'Reach';
  return 'Downwind';
}

export interface CourseBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

// Lat/lon bounding box of a course's marks.
export function courseBounds(waypoints: Waypoint[]): CourseBounds {
  const lats = waypoints.map((w) => w.lat);
  const lons = waypoints.map((w) => w.lon);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}

// Height-to-width ratio of a course in the chart's equirectangular projection
// (longitude scaled by cos(mean latitude)). Used to size the race map to the
// shape of the course rather than a fixed letterbox.
export function courseAspect(waypoints: Waypoint[]): number {
  const b = courseBounds(waypoints);
  const k = Math.cos((((b.minLat + b.maxLat) / 2) * Math.PI) / 180) || 1;
  const spanX = (b.maxLon - b.minLon) * k || 1e-6;
  const spanY = b.maxLat - b.minLat || 1e-6;
  return spanY / spanX;
}
