// Build-time generator for the Harbour's world chart.
//
// Reads the same Natural Earth 1:10m sources as build-coastlines.mjs and bakes
// TWO committed layers into `src/data/worldmap.ts`:
//
//   1. WORLD_LAND — one coarse, heavily Douglas-Peucker-simplified silhouette
//      of the whole planet (Antarctica trimmed), for the tappable world map on
//      the home screen. A dashboard silhouette, not a nav chart: the target is
//      a committed file WELL under 150 KB, so the tolerance is brutal and tiny
//      islands are dropped.
//   2. REGION_LAND / REGION_BOUNDS — a medium-tolerance coastline per sailing
//      region (the REGION_RACES keys from src/data/onboarding.ts), clipped to a
//      padded box around all of that region's courses, for the zoomed region
//      view and the conditions hero. Lakes are carved back out so the Great
//      Lakes fleet doesn't race on dry land.
//
// The output is committed; the app and CI never touch the network. Re-run only
// when courses or regions change.
//
// Usage:
//   1. Download the sources into /tmp (see README "Regenerating coastlines"):
//        ne_10m_land.json, ne_10m_minor_islands.json, ne_10m_lakes.json
//   2. node scripts/build-world.mjs
//
// Requires the `polygon-clipping` dev dependency.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import polygonClipping from 'polygon-clipping';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = '/tmp';
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'worldmap.ts');
const RACES_FILE = path.join(__dirname, '..', 'src', 'data', 'races.ts');
const ONBOARDING_FILE = path.join(__dirname, '..', 'src', 'data', 'onboarding.ts');

// The world silhouette's frame: Antarctica and the top of the Arctic carry no
// races and would double the point budget, so the world view is trimmed to the
// sailed latitudes (R2AK reaches ~56°N; Hobart ~43°S).
const WORLD_BOUNDS = { minLat: -58, maxLat: 72, minLon: -180, maxLon: 180 };
const WORLD_TOLERANCE = 0.35; // degrees — brutal, deliberately
const WORLD_MIN_AREA = 1.6; // sq deg bbox — drop islets the silhouette can't show
const WORLD_LAKE_MIN_AREA = 1.6; // only the truly great lakes survive

// ---- Course + region membership, parsed from the data files (single source of
// truth — add a race or move a region and the bake follows). Same regex loader
// as build-coastlines.mjs.
function loadCourses() {
  const src = fs.readFileSync(RACES_FILE, 'utf8');
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

// REGION_RACES from onboarding.ts: `uk: ['race-a', 'race-b'],` lines inside the
// exported record. 'other' borrows other regions' races — no chart box of its own.
function loadRegionRaces() {
  const src = fs.readFileSync(ONBOARDING_FILE, 'utf8');
  const block = /REGION_RACES[^=]*=\s*{([\s\S]*?)};/.exec(src);
  if (!block) throw new Error('REGION_RACES not found in onboarding.ts');
  const regions = {};
  const rowRe = /(\w+):\s*\[([^\]]*)\]/g;
  let m;
  while ((m = rowRe.exec(block[1]))) {
    if (m[1] === 'other') continue;
    regions[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  }
  return regions;
}

const COURSES = loadCourses();
const REGION_RACES = loadRegionRaces();

// ---- Geometry helpers (shared shapes with build-coastlines.mjs) -------------

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

function asMultiPolygon(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

function geometryBbox(geometry) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const poly of asMultiPolygon(geometry)) {
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

function ringBboxArea(ring) {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return (maxLon - minLon) * (maxLat - minLat);
}

function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Iterative Douglas-Peucker (same as build-coastlines.mjs).
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

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

// Simplify + round every ring of a multipolygon, dropping rings that collapse
// and outer rings below the area floor. Returns LandPolygon[] (rings of
// [lon, lat] pairs, ring 0 the boundary, the rest holes).
function shapeMultiPolygon(mp, tolerance, minArea, dp) {
  const polygons = [];
  for (const poly of mp) {
    const rings = [];
    for (let r = 0; r < poly.length; r += 1) {
      if (r === 0 && ringBboxArea(poly[r]) < minArea) break; // the whole polygon is an islet
      const simplified = simplifyRing(poly[r], tolerance).map(([lon, lat]) => [
        round(lon, dp),
        round(lat, dp),
      ]);
      // Rounding can fold neighbours together; dedupe before the length check.
      const dedup = simplified.filter(
        (p, i) => i === 0 || p[0] !== simplified[i - 1][0] || p[1] !== simplified[i - 1][1]
      );
      if (dedup.length >= 4) {
        if (r === 0) rings.push(dedup);
        else if (ringBboxArea(poly[r]) >= minArea) rings.push(dedup); // holes obey the same floor
      } else if (r === 0) {
        break; // no boundary, no polygon
      }
    }
    if (rings.length) polygons.push(rings);
  }
  return polygons;
}

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

function rectOf(bbox) {
  return [[
    [bbox.minLon, bbox.minLat],
    [bbox.maxLon, bbox.minLat],
    [bbox.maxLon, bbox.maxLat],
    [bbox.minLon, bbox.maxLat],
    [bbox.minLon, bbox.minLat],
  ]];
}

// ---- The world silhouette ---------------------------------------------------

function buildWorld(land, lakes) {
  // Simplify FIRST (the boolean ops then run on a few thousand points, not the
  // full 1:10m coastline), clip to the sailed latitudes, then carve the great
  // lakes so the freshwater pins sit on water.
  const worldRect = rectOf(WORLD_BOUNDS);

  const landMP = [];
  for (const f of land) {
    for (const poly of shapeMultiPolygon(asMultiPolygon(f.geometry), WORLD_TOLERANCE, WORLD_MIN_AREA, 1)) {
      landMP.push(poly);
    }
  }
  const lakesMP = [];
  for (const f of lakes) {
    for (const poly of shapeMultiPolygon(asMultiPolygon(f.geometry), WORLD_TOLERANCE, WORLD_LAKE_MIN_AREA, 1)) {
      lakesMP.push(poly);
    }
  }

  let world = polygonClipping.intersection(landMP, worldRect);
  if (lakesMP.length) {
    try {
      world = polygonClipping.difference(world, lakesMP);
    } catch {
      /* keep land as-is if the boolean op fails */
    }
  }
  // The boolean ops re-densify edges slightly; one light finishing pass.
  return shapeMultiPolygon(world, WORLD_TOLERANCE / 2, WORLD_MIN_AREA, 1);
}

// ---- Region charts ------------------------------------------------------------

// A square-ish padded box around ALL of a region's courses (same letterbox
// philosophy as raceBbox in build-coastlines.mjs, wider pad since a region view
// frames several courses, and a floor so a tight region still shows its coast).
function regionBbox(raceIds) {
  const pts = raceIds.flatMap((id) => COURSES[id] ?? []);
  if (!pts.length) throw new Error(`No course points for region races ${raceIds}`);
  const lats = pts.map((p) => p[0]);
  const lons = pts.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const k = Math.cos((centerLat * Math.PI) / 180) || 1;

  const spanX = (maxLon - minLon) * k;
  const spanY = maxLat - minLat;
  const half = Math.max((Math.max(spanX, spanY) / 2) * 1.25, 1.2);

  return {
    minLon: round(centerLon - half / k, 2),
    maxLon: round(centerLon + half / k, 2),
    minLat: round(Math.max(-85, centerLat - half), 2),
    maxLat: round(Math.min(85, centerLat + half), 2),
  };
}

function buildRegion(raceIds, land, lakes) {
  const bbox = regionBbox(raceIds);
  const span = Math.max(bbox.maxLon - bbox.minLon, bbox.maxLat - bbox.minLat);
  // Medium tolerance: legible coastline at dashboard size, small committed
  // file. Capped so the ocean-spanning regions (usWest runs Hawaii→Alaska)
  // keep a recognisable coast.
  const tolerance = Math.min(0.1, Math.max(0.015, span / 400));
  const minArea = tolerance * tolerance * 24;
  const clipRect = rectOf(bbox);

  let landMP = clipFeaturesToBox(land, bbox, clipRect);
  const lakesMP = clipFeaturesToBox(lakes, bbox, clipRect);
  if (landMP.length && lakesMP.length) {
    try {
      landMP = polygonClipping.difference(landMP, lakesMP);
    } catch {
      /* keep land as-is if the boolean op fails */
    }
  }
  return { bbox, polygons: shapeMultiPolygon(landMP, tolerance, minArea, 2) };
}

// ---- Main --------------------------------------------------------------------

function countPoints(polygons) {
  return polygons.reduce((s, rings) => s + rings.reduce((a, r) => a + r.length, 0), 0);
}

function main() {
  const landOnly = loadFeatures('ne_10m_land.json');
  const minorIslands = loadFeatures('ne_10m_minor_islands.json');
  const lakes = loadFeatures('ne_10m_lakes.json');
  console.log(`Loaded ${landOnly.length} land, ${minorIslands.length} islands, ${lakes.length} lakes.`);

  const world = buildWorld(landOnly, lakes);
  console.log(`world: ${world.length} polygons, ${countPoints(world)} points`);

  const regionLand = {};
  const regionBounds = {};
  for (const [region, raceIds] of Object.entries(REGION_RACES)) {
    const { bbox, polygons } = buildRegion(raceIds, [...landOnly, ...minorIslands], lakes);
    regionLand[region] = polygons;
    regionBounds[region] = bbox;
    console.log(`${region}: ${polygons.length} polygons, ${countPoints(polygons)} points`);
  }

  const header = `// AUTO-GENERATED by scripts/build-world.mjs — do not edit by hand.
// Natural Earth 1:10m land + minor islands + lakes (public domain).
// WORLD_LAND: a coarse whole-planet silhouette for the Harbour's world chart;
// REGION_LAND/REGION_BOUNDS: a medium-tolerance coastline per sailing region,
// boxed around all of that region's courses. Same ring shape as landmasses.ts:
// [lon, lat] pairs, ring 0 the outer boundary, the rest holes (lakes).

import { LandPolygon } from './landmasses';

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export const WORLD_BOUNDS: GeoBounds = ${JSON.stringify(WORLD_BOUNDS)};

export const WORLD_LAND: LandPolygon[] = ${JSON.stringify(world)};

export const REGION_BOUNDS: Record<string, GeoBounds> = ${JSON.stringify(regionBounds)};

export const REGION_LAND: Record<string, LandPolygon[]> = ${JSON.stringify(regionLand)};
`;
  fs.writeFileSync(OUT_FILE, header);
  const kb = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
  console.log(`\nWrote ${OUT_FILE}: ${kb} KB.`);
}

main();
