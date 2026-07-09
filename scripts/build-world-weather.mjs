// Build-time generator for the world ocean wind climatology.
//
// Reads the committed world lattice (src/data/worldLattice.ts — regenerate it
// first if the grid changed) and, for every ocean node, pulls a full year of
// ERA5 daily wind from Open-Meteo's archive API: mean speed and dominant
// direction, aggregated per MONTH into
//   • the scalar-mean speed (what actually blows),
//   • the vector-mean FROM direction (350° and 010° meet at north, never at a
//     phantom southerly — the same circular mean as build-weather.mjs), and
//   • the constancy q = |vector mean| / scalar mean (0 = the direction is a
//     fiction, 1 = trade-wind steady) — the honesty gate a seasonal direction
//     glyph must clear before it is drawn.
// Values are quantised (speed in half-knots, direction in 3° steps, q in
// tenths) so the committed file stays a dashboard payload (<80 KB, pinned by
// test). The archive API is slow but linear (~10 s per 6 points), so the bake
// runs in chunks of 6, sequentially, with progress logging — a full run is
// ~9 minutes. Fine for a committed-output script.
//
// Offline (or if the API is unreachable), it falls back to a deterministic
// latitude-band climatology — trades / westerlies / doldrums by |lat|, with a
// winter-hemisphere strengthening and honest q per band — so the generated
// file is always complete and the build stays green (the same pattern as
// scripts/build-weather.mjs).
//
// Usage:
//   node scripts/build-world-weather.mjs            # real ERA5 where reachable
//   OFFLINE=1 node scripts/build-world-weather.mjs  # force the seed baseline
//
// Open-Meteo is free and needs no API key. If running behind an egress
// allow-list, permit `archive-api.open-meteo.com`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LATTICE_FILE = path.join(__dirname, '..', 'src', 'data', 'worldLattice.ts');
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'worldClimatology.ts');

// A recent, fully-available year for the archive (ERA5 lags ~5 days) — the
// same vintage as scripts/build-weather.mjs.
const ARCHIVE_YEAR = 2024;
const CHUNK = 6; // measured: 6 points ≈ 10 s; the archive scales linearly
const TRIES = 4; // per chunk, with backoff — a nine-minute bake earns patience

// ---- The committed lattice is the single source of truth ---------------------

function loadLattice() {
  const src = fs.readFileSync(LATTICE_FILE, 'utf8');
  const cells = JSON.parse(src.match(/WORLD_LATTICE_CELLS[^=]*= (\[.*?\]);/s)[1]);
  const oceanIndex = JSON.parse(src.match(/WORLD_OCEAN_INDEX[^=]*= (\[.*?\]);/s)[1]);
  return { cells, oceanIndex };
}

// ---- Aggregation ---------------------------------------------------------------

const norm360 = (d) => ((d % 360) + 360) % 360;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Quantisation: speed in half-knots (0–80 kn), direction in 3° steps, q in
// tenths. seasonalWorldFlow (services/weather.ts) is the exact inverse.
const qSpeed = (kn) => clamp(Math.round(kn * 2), 0, 160);
const qDir = (deg) => Math.round(norm360(deg) / 3) % 120;
const qConstancy = (q) => clamp(Math.round(q * 10), 0, 10);

// One node's daily year → 36 ints: [12 speeds, 12 dirs, 12 q], January first.
function aggregateMonths(days) {
  const speeds = [];
  const dirs = [];
  const qs = [];
  for (let month = 0; month < 12; month += 1) {
    let n = 0;
    let scalar = 0;
    let u = 0;
    let v = 0;
    for (const d of days) {
      if (d.month !== month) continue;
      n += 1;
      scalar += d.speedKn;
      const a = (d.fromDeg * Math.PI) / 180;
      u += Math.sin(a) * d.speedKn;
      v += Math.cos(a) * d.speedKn;
    }
    if (n === 0) throw new Error('a month with no days — archive hole');
    const meanSpeed = scalar / n;
    const meanDir = norm360((Math.atan2(u / n, v / n) * 180) / Math.PI);
    const q = meanSpeed > 0 ? Math.min(1, Math.hypot(u / n, v / n) / meanSpeed) : 0;
    speeds.push(qSpeed(meanSpeed));
    dirs.push(qDir(meanDir));
    qs.push(qConstancy(q));
  }
  return [...speeds, ...dirs, ...qs];
}

// ---- The deterministic offline baseline -----------------------------------------
//
// Latitude bands, the sailor's picture of the planet: doldrums astride the
// equator (light, fickle), trades either side (fresh, steady), the variables,
// then the westerlies (strong, shifty — q honestly low), roaring harder in the
// south. Winter hemisphere blows ~18% harder, peaking January north / July south.

function seedNode(lat) {
  const a = Math.abs(lat);
  let fromDeg;
  let speedKn;
  let q;
  if (a <= 5) {
    fromDeg = 90;
    speedKn = 6;
    q = 0.25; // doldrums: a direction barely worth naming
  } else if (a <= 25) {
    fromDeg = lat > 0 ? 60 : 120; // NE / SE trades
    speedKn = 15;
    q = 0.8;
  } else if (a <= 35) {
    fromDeg = 240;
    speedKn = 9;
    q = 0.35; // the variables / horse latitudes
  } else if (a <= 60) {
    fromDeg = lat > 0 ? 250 : 280;
    speedKn = lat > 0 ? 17 : 21; // the forties roar
    q = 0.45;
  } else {
    fromDeg = 90; // polar easterlies
    speedKn = 12;
    q = 0.4;
  }
  const row = [];
  const dirs = [];
  const qs = [];
  for (let month = 0; month < 12; month += 1) {
    const phase = ((month - (lat >= 0 ? 0 : 6)) / 12) * 2 * Math.PI;
    row.push(qSpeed(speedKn * (1 + 0.18 * Math.cos(phase))));
    dirs.push(qDir(fromDeg));
    qs.push(qConstancy(q));
  }
  return [...row, ...dirs, ...qs];
}

// ---- The archive fetch -----------------------------------------------------------

async function fetchChunk(points) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${points.map((p) => p.lat).join(',')}` +
    `&longitude=${points.map((p) => p.lon).join(',')}` +
    `&start_date=${ARCHIVE_YEAR}-01-01&end_date=${ARCHIVE_YEAR}-12-31` +
    `&daily=wind_speed_10m_mean,wind_direction_10m_dominant&wind_speed_unit=kn`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const locations = Array.isArray(json) ? json : [json];
    if (locations.length !== points.length) throw new Error('location count mismatch');
    return locations.map((loc) => {
      const times = loc.daily?.time ?? [];
      const speeds = loc.daily?.wind_speed_10m_mean ?? [];
      const dirs = loc.daily?.wind_direction_10m_dominant ?? [];
      const days = [];
      for (let i = 0; i < times.length; i += 1) {
        if (speeds[i] == null || dirs[i] == null) continue;
        days.push({
          month: parseInt(String(times[i]).slice(5, 7), 10) - 1,
          speedKn: speeds[i],
          fromDeg: dirs[i],
        });
      }
      if (days.length < 300) throw new Error(`too few clean days (${days.length})`);
      return aggregateMonths(days);
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchChunkWithRetry(points, label) {
  let lastErr;
  for (let attempt = 1; attempt <= TRIES; attempt += 1) {
    try {
      return await fetchChunk(points);
    } catch (err) {
      lastErr = err;
      if (attempt < TRIES) {
        const backoff = attempt * 5000;
        process.stdout.write(`  ! ${label} attempt ${attempt} failed (${err.message}) — retrying in ${backoff / 1000}s\n`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }
  throw lastErr;
}

// ---- Emit ------------------------------------------------------------------------

function writeOut(rows, oceanCount, source) {
  const body = rows.map((row) => `[${row.join(',')}]`).join(',\n');
  const header = `// AUTO-GENERATED by \`node scripts/build-world-weather.mjs\` — do not edit by hand.
// ${source === 'era5' ? `ERA5 (Open-Meteo archive), full year ${ARCHIVE_YEAR} daily wind per ocean node.` : 'Seed baseline (latitude-band climatology) — regenerate online for real ERA5.'}
//
// Monthly wind climatology for every ocean node of the world lattice, one row
// per node ALIGNED WITH WORLD_OCEAN_INDEX (src/data/worldLattice.ts). Each row
// is 36 ints, January first:
//   [0..11]  monthly scalar-mean wind speed, in HALF-KNOTS (value / 2 = kn)
//   [12..23] monthly vector-mean FROM direction, in 3° steps (value × 3 = deg)
//   [24..35] monthly constancy q, in tenths (value / 10; 0 = directionless,
//            1 = trade-wind steady) — gates any seasonal direction glyph.
// Read it through seasonalWorldFlow (services/weather.ts), which undoes the
// quantisation and rehydrates the full grid via WORLD_NEAREST_OCEAN.

export const WORLD_CLIMATOLOGY_SOURCE: 'era5' | 'seed' = '${source}';
export const WORLD_CLIMATOLOGY_YEAR = ${ARCHIVE_YEAR};
export const WORLD_CLIMATOLOGY_OCEAN_COUNT = ${oceanCount};

export const WORLD_CLIMATOLOGY: number[][] = [
${body},
];
`;
  fs.writeFileSync(OUT_FILE, header);
  const bytes = fs.statSync(OUT_FILE).size;
  process.stdout.write(
    `\nWrote ${rows.length} ocean nodes × 12 months (${source}) to ` +
      `${path.relative(process.cwd(), OUT_FILE)} (${(bytes / 1024).toFixed(1)} KB)\n`
  );
}

async function main() {
  const { cells, oceanIndex } = loadLattice();
  const nodes = oceanIndex.map((i) => cells[i]);

  if (process.env.OFFLINE === '1') {
    writeOut(nodes.map((n) => seedNode(n.lat)), nodes.length, 'seed');
    return;
  }

  const rows = [];
  const chunks = Math.ceil(nodes.length / CHUNK);
  const started = Date.now();
  for (let c = 0; c < chunks; c += 1) {
    const points = nodes.slice(c * CHUNK, (c + 1) * CHUNK);
    const label = `chunk ${c + 1}/${chunks}`;
    try {
      rows.push(...(await fetchChunkWithRetry(points, label)));
    } catch (err) {
      if (c === 0) {
        // The very first chunk never landed: we're offline. Fall back whole-file
        // (never a silent real/seed mix) — the same grace as build-weather.mjs.
        process.stdout.write(`  · archive unreachable (${err.message}) — writing the seed baseline\n`);
        writeOut(nodes.map((n) => seedNode(n.lat)), nodes.length, 'seed');
        return;
      }
      // A mid-run failure is a flake, not offline: abort WITHOUT writing, so the
      // committed file is never part-real part-seed. Re-run to finish.
      throw new Error(`${label} failed after ${TRIES} tries (${err.message}) — nothing written; re-run`);
    }
    const elapsed = (Date.now() - started) / 1000;
    process.stdout.write(
      `  ✓ chunk ${c + 1}/${chunks} (${rows.length}/${nodes.length} nodes, ${elapsed.toFixed(0)}s)\n`
    );
  }
  writeOut(rows, nodes.length, 'era5');
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
