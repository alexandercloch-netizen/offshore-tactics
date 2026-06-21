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

// Race courses as [lat, lon] so we can derive each map's bounding box. Keep in
// sync with src/data/races.ts.
const COURSES = {
  'race-round-island': [
    [50.76, -1.3], [50.765, -1.4], [50.72, -1.52], [50.655, -1.6], [50.555, -1.3], [50.68, -1.06], [50.74, -1.09], [50.76, -1.3],
  ],
  'race-chicago-mac': [
    [41.89, -87.59], [43.5, -87.0], [45.05, -86.05], [45.77, -85.5], [45.82, -84.9], [45.85, -84.62],
  ],
  'race-middle-sea': [
    [35.9, 14.52], [36.69, 15.13], [38.27, 15.65], [38.83, 15.25], [37.93, 12.32], [36.84, 11.95], [35.51, 12.61], [35.98, 14.33], [35.9, 14.51],
  ],
  'race-newport-bermuda': [
    [41.45, -71.34], [38.5, -69.5], [32.46, -64.65], [32.36, -64.65],
  ],
  'race-fastnet': [
    [50.76, -1.3], [50.51, -2.46], [50.22, -3.65], [49.96, -5.2], [50.05, -5.8], [51.39, -9.6], [49.87, -6.45], [49.72, -1.94], [49.65, -1.62],
  ],
  'race-caribbean-600': [
    [17.0, -61.75], [17.07, -61.65], [17.55, -61.85], [17.1, -62.62], [17.4, -62.85], [17.63, -63.24], [17.92, -62.83], [18.12, -62.98], [15.85, -61.6], [16.94, -62.35], [17.01, -61.76],
  ],
  'race-sydney-hobart': [
    [-33.83, 151.28], [-36.5, 150.3], [-39.5, 149.5], [-43.24, 148.0], [-43.1, 147.55], [-43.05, 147.42], [-42.89, 147.34],
  ],
  'race-transpac': [
    [33.7, -118.29], [33.3, -118.5], [28.0, -135.0], [23.0, -150.0], [21.25, -157.81],
  ],
};

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
