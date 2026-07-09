// Build-time generator for the world weather lattice.
//
// Lays a regular 10° grid over WORLD_BOUNDS (36 columns × 13 rows, north row
// first — the same row-major contract as windBlend/buildFlowField) and
// classifies each cell against the SOURCE-resolution Natural Earth polygons
// (the same files scripts/build-coastlines.mjs reads — NOT the simplified
// display silhouette in worldmap.ts, which misplaces a coast by 10–30 km).
// A cell is OCEAN when its centre sits ≥25 km offshore, clipped to 60S–65N;
// everything else is land/ice plumbing that the chart paints over. The ocean
// subset is the exact point list `fetchWorldFlow` sends in ONE batched GET, so
// the script asserts it stays under the measured single-request ceiling (480).
//
// The output is committed, so the app and CI never need these source files —
// re-run this only if the grid or the offshore rule changes.
//
// Usage:
//   1. Download the sources into /tmp (see README "Regenerating coastlines"):
//        ne_10m_land.json, ne_10m_minor_islands.json
//   2. node scripts/build-world-lattice.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = '/tmp';
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'worldLattice.ts');

// The grid: cell centres every 10°, inside WORLD_BOUNDS (lat 72..−58,
// lon −180..180). North row first, west column first — row-major.
const COLS = 36; // lon centres −175 … +175
const ROWS = 13; // lat centres 67 … −53
const cellLat = (row) => 67 - row * 10;
const cellLon = (col) => -175 + col * 10;

// The honesty rules for an "ocean" node: genuinely offshore (an ECMWF sea cell,
// not a beach), and inside the latitudes the game's oceans actually span.
const MIN_OFFSHORE_KM = 25;
const OCEAN_LAT_MIN = -60;
const OCEAN_LAT_MAX = 65;
// The measured single-GET ceiling for open-meteo's batched current-wind call.
const MAX_OCEAN_NODES = 480;

// ---- Natural Earth source polygons ------------------------------------------

function loadRings(file) {
  const json = JSON.parse(fs.readFileSync(path.join(SRC_DIR, file), 'utf8'));
  const rings = [];
  for (const feature of json.features) {
    const g = feature.geometry;
    if (!g) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    for (const poly of polys) {
      // Outer ring only: a hole is a lake, and a lake point is not ocean either.
      const ring = poly[0];
      if (!ring || ring.length < 4) continue;
      let minLon = Infinity;
      let maxLon = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      for (const [lon, lat] of ring) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
      rings.push({ ring, minLon, maxLon, minLat, maxLat });
    }
  }
  return rings;
}

const RINGS = [...loadRings('ne_10m_land.json'), ...loadRings('ne_10m_minor_islands.json')];

function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function onLand(lon, lat) {
  for (const r of RINGS) {
    if (lon < r.minLon || lon > r.maxLon || lat < r.minLat || lat > r.maxLat) continue;
    if (inRing(lon, lat, r.ring)) return true;
  }
  return false;
}

// ---- Distance to the nearest coastline ---------------------------------------
//
// Segments bucketed by integer degree so a 25 km query only touches its own
// neighbourhood; distances in a local equirectangular plane (exact enough at
// this scale), with longitudes wrapped so the Bering Strait doesn't read as a
// whole world away.

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON = 111.32;
const wrapLon = (d) => ((d + 540) % 360) - 180;

const buckets = new Map();
const bucketKey = (x, y) => `${x}:${y}`;
for (const r of RINGS) {
  const ring = r.ring;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const seg = [ring[j][0], ring[j][1], ring[i][0], ring[i][1]];
    const x0 = Math.floor(Math.min(seg[0], seg[2]));
    const x1 = Math.floor(Math.max(seg[0], seg[2]));
    const y0 = Math.floor(Math.min(seg[1], seg[3]));
    const y1 = Math.floor(Math.max(seg[1], seg[3]));
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        const key = bucketKey(Math.floor(wrapLon(x + 0.5)), y);
        let list = buckets.get(key);
        if (!list) buckets.set(key, (list = []));
        list.push(seg);
      }
    }
  }
}

function segmentDistanceKm(lon, lat, seg) {
  const kx = KM_PER_DEG_LON * Math.cos((lat * Math.PI) / 180);
  const ax = wrapLon(seg[0] - lon) * kx;
  const ay = (seg[1] - lat) * KM_PER_DEG_LAT;
  const bx = wrapLon(seg[2] - lon) * kx;
  const by = (seg[3] - lat) * KM_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  const px = ax + t * dx;
  const py = ay + t * dy;
  return Math.hypot(px, py);
}

// Is there ANY coastline within `withinKm` of the point?
function coastWithinKm(lon, lat, withinKm) {
  const latPad = Math.ceil(withinKm / KM_PER_DEG_LAT + 1);
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const lonPad = Math.ceil(withinKm / (KM_PER_DEG_LON * cosLat) + 1);
  for (let dx = -lonPad; dx <= lonPad; dx += 1) {
    for (let dy = -latPad; dy <= latPad; dy += 1) {
      const bx = Math.floor(wrapLon(Math.floor(lon) + dx + 0.5));
      const by = Math.floor(lat) + dy;
      const list = buckets.get(bucketKey(bx, by));
      if (!list) continue;
      for (const seg of list) {
        if (segmentDistanceKm(lon, lat, seg) < withinKm) return true;
      }
    }
  }
  return false;
}

// ---- Classify the grid --------------------------------------------------------

const cells = [];
for (let r = 0; r < ROWS; r += 1) {
  for (let c = 0; c < COLS; c += 1) {
    cells.push({ lat: cellLat(r), lon: cellLon(c) });
  }
}

const oceanIndex = [];
for (let i = 0; i < cells.length; i += 1) {
  const { lat, lon } = cells[i];
  if (lat < OCEAN_LAT_MIN || lat > OCEAN_LAT_MAX) continue;
  if (onLand(lon, lat)) continue;
  if (coastWithinKm(lon, lat, MIN_OFFSHORE_KM)) continue;
  oceanIndex.push(i);
}

if (oceanIndex.length === 0) throw new Error('no ocean cells — sources missing or corrupt?');
if (oceanIndex.length > MAX_OCEAN_NODES) {
  throw new Error(
    `ocean lattice has ${oceanIndex.length} nodes — over the ${MAX_OCEAN_NODES} single-GET ceiling`
  );
}

// For every cell (land included), the fetch-order position of its nearest ocean
// node — the display-plumbing map fetchWorldFlow rehydrates the full grid with.
const havKm = (a, b) => {
  const t = (d) => (d * Math.PI) / 180;
  const h =
    Math.sin(t(b.lat - a.lat) / 2) ** 2 +
    Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};
const nearestOcean = cells.map((cell, i) => {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < oceanIndex.length; k += 1) {
    if (oceanIndex[k] === i) return k; // an ocean cell is its own sample
    const d = havKm(cell, cells[oceanIndex[k]]);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
});

// ---- Emit ----------------------------------------------------------------------

const header = `// AUTO-GENERATED by \`node scripts/build-world-lattice.mjs\` — do not edit by hand.
// Natural Earth 1:10m land + minor islands (public domain), source resolution.
//
// The world weather lattice: a regular 10° grid over WORLD_BOUNDS, row-major
// with the NORTH row first (the same contract as windBlend/buildFlowField —
// cell i sits at row Math.floor(i / COLS), col i % COLS). WORLD_OCEAN_INDEX
// lists the cells whose centres are genuinely at sea (≥${MIN_OFFSHORE_KM} km offshore against
// the source-resolution coastline, ${OCEAN_LAT_MIN}°–${OCEAN_LAT_MAX}° lat) in FETCH ORDER — the exact
// point list of fetchWorldFlow's one batched GET, and the row order of the
// baked WORLD_CLIMATOLOGY. WORLD_NEAREST_OCEAN maps EVERY cell to the
// fetch-order position of its nearest ocean node, so a fetched/baked ocean set
// rehydrates to the full grid; land cells are painted over by the land layer,
// so that fill is display plumbing, never a data claim.

export const WORLD_LATTICE_COLS = ${COLS};
export const WORLD_LATTICE_ROWS = ${ROWS};

export interface WorldLatticeCell {
  lat: number;
  lon: number;
}

export const WORLD_LATTICE_CELLS: WorldLatticeCell[] = ${JSON.stringify(cells)};

// Cell indices of the ocean nodes, in fetch order (${oceanIndex.length} nodes).
export const WORLD_OCEAN_INDEX: number[] = ${JSON.stringify(oceanIndex)};

// Per cell: the position in WORLD_OCEAN_INDEX of its nearest ocean node
// (an ocean cell maps to itself).
export const WORLD_NEAREST_OCEAN: number[] = ${JSON.stringify(nearestOcean)};
`;

fs.writeFileSync(OUT_FILE, header);
process.stdout.write(
  `Wrote ${cells.length} cells (${COLS}×${ROWS}), ${oceanIndex.length} ocean nodes ` +
    `(ceiling ${MAX_OCEAN_NODES}) to ${path.relative(process.cwd(), OUT_FILE)}\n`
);
