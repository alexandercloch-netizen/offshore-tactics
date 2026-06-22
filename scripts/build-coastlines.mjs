// Build-time generator for chart land masses.
//
// Reads Natural Earth 1:10m land + minor-island polygons, clips them to each
// race's padded bounding box (proper polygon clipping, so lakes stay water),
// lightly simplifies and rounds the geometry, and writes
// `src/data/landmasses.ts`. The output is committed, so the app and CI never
// need network access — re-run this only when the courses change.
//
// Usage:
//   1. Download the sources into /tmp (see README "Regenerating coastlines"):
//        ne_10m_land.json, ne_10m_minor_islands.json
//   2. node scripts/build-coastlines.mjs
//
// Requires the `polygon-clipping` dev dependency.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import polygonClipping from 'polygon-clipping';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = '/tmp';
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'landmasses.ts');

// Race courses as [lat, lon], parsed straight from src/data/races.ts so the
// waypoints are the single source of truth — add a race there and its coastline
// is generated here automatically, with no second list to keep in sync.
const RACES_FILE = path.join(__dirname, '..', 'src', 'data', 'races.ts');

function loadCourses() {
  const src = fs.readFileSync(RACES_FILE, 'utf8');
  // Find each race id and the span of source up to the next one; the only
  // lat:/lon: pairs inside a race block are its waypoints.
  const idRe = /id:\s*'(race-[a-z0-9-]+)'/g;
  const ids = [];
  let m;
  while ((m = idRe.exec(src))) ids.push({ id: m[1], index: m.index });

  const courses = {};
  for (let i = 0; i < ids.length; i += 1) {
    const chunk = src.slice(ids[i].index, i + 1 < ids.length ? ids[i + 1].index : src.length);
    const wpRe = /lat:\s*(-?\d+(?:\.\d+)?),\s*lon:\s*(-?\d+(?:\.\d+)?)/g;
    const course = [];
    let w;
    while ((w = wpRe.exec(chunk))) course.push([parseFloat(w[1]), parseFloat(w[2])]);
    if (course.length >= 2) courses[ids[i].id] = course;
  }
  return courses;
}

const COURSES = loadCourses();

// A square-ish box (in the map's projected space) padded around the course, so
// the clipped land fills the viewport corners regardless of screen aspect.
function raceBbox(course) {
  const lats = course.map((c) => c[0]);
  const lons = course.map((c) => c[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const k = Math.cos((centerLat * Math.PI) / 180) || 1;

  const spanX = (maxLon - minLon) * k;
  const spanY = maxLat - minLat;
  const half = Math.max(Math.max(spanX, spanY) / 2 * 1.45, 0.3);

  return {
    minLon: centerLon - half / k,
    maxLon: centerLon + half / k,
    minLat: centerLat - half,
    maxLat: centerLat + half,
  };
}

function loadFeatures(file) {
  const full = path.join(SRC_DIR, file);
  if (!fs.existsSync(full)) {
    console.error(`Missing source ${full}. Download it first (see header).`);
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(full, 'utf8'));
  return json.features.filter(
    (f) => f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')
  );
}

// Cheap bounding box of a GeoJSON geometry for pre-filtering.
function geometryBbox(geometry) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

function bboxesOverlap(a, b) {
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

function asMultiPolygon(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

// Perpendicular distance from point p to the segment a-b (in degrees).
function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Iterative Douglas-Peucker simplification.
function simplifyRing(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

// Clip every overlapping feature to the rectangle and return a single
// MultiPolygon (array of polygons) covering the box.
function clipFeaturesToBox(features, bbox, clipRect) {
  const out = [];
  for (const feature of features) {
    if (!bboxesOverlap(geometryBbox(feature.geometry), bbox)) continue;
    let clipped;
    try {
      clipped = polygonClipping.intersection(asMultiPolygon(feature.geometry), clipRect);
    } catch {
      continue; // skip degenerate geometry
    }
    for (const poly of clipped) out.push(poly);
  }
  return out;
}

function processRace(raceId, course, land, lakes) {
  const bbox = raceBbox(course);
  const span = Math.max(bbox.maxLon - bbox.minLon, bbox.maxLat - bbox.minLat);
  const tolerance = Math.max(0.004, span / 1200); // light simplification

  const clipRect = [[
    [bbox.minLon, bbox.minLat],
    [bbox.maxLon, bbox.minLat],
    [bbox.maxLon, bbox.maxLat],
    [bbox.minLon, bbox.maxLat],
    [bbox.minLon, bbox.minLat],
  ]];

  let landMP = clipFeaturesToBox(land, bbox, clipRect);

  // Natural Earth's land layer fills lakes, so carve them back out as water.
  const lakesMP = clipFeaturesToBox(lakes, bbox, clipRect);
  if (landMP.length && lakesMP.length) {
    try {
      landMP = polygonClipping.difference(landMP, lakesMP);
    } catch {
      /* keep land as-is if the boolean op fails */
    }
  }

  const polygons = [];
  for (const poly of landMP) {
    const rings = [];
    for (const ring of poly) {
      const simplified = simplifyRing(ring, tolerance).map(([lon, lat]) => [round(lon), round(lat)]);
      if (simplified.length >= 4) rings.push(simplified);
    }
    if (rings.length) polygons.push(rings);
  }
  return polygons;
}

function main() {
  const land = [...loadFeatures('ne_10m_land.json'), ...loadFeatures('ne_10m_minor_islands.json')];
  const lakes = loadFeatures('ne_10m_lakes.json');
  console.log(`Loaded ${land.length} land features, ${lakes.length} lakes.`);

  const result = {};
  let totalPolys = 0;
  let totalPoints = 0;
  for (const [raceId, course] of Object.entries(COURSES)) {
    const polygons = processRace(raceId, course, land, lakes);
    result[raceId] = polygons;
    const points = polygons.reduce((s, rings) => s + rings.reduce((a, r) => a + r.length, 0), 0);
    totalPolys += polygons.length;
    totalPoints += points;
    console.log(`${raceId}: ${polygons.length} polygons, ${points} points`);
  }

  const header = `// AUTO-GENERATED by scripts/build-coastlines.mjs — do not edit by hand.
// Natural Earth 1:10m land + minor islands (public domain), clipped per race.
// Each race maps to an array of polygons; each polygon is an array of rings
// ([lon, lat] pairs); ring 0 is the outer boundary, the rest are holes (lakes).

export type LandRing = [number, number][];
export type LandPolygon = LandRing[];

export const LANDMASSES: Record<string, LandPolygon[]> = ${JSON.stringify(result)};
`;
  fs.writeFileSync(OUT_FILE, header);
  console.log(`\nWrote ${OUT_FILE}: ${totalPolys} polygons, ${totalPoints} points total.`);
}

main();
