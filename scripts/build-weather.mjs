// Build-time generator for per-race wind climatology.
//
// Reads each race's course + season straight from src/data/races.ts (the single
// source of truth), and for the waters at the course centre pulls real wind
// statistics for the racing month from Open-Meteo's free archive API — mean
// speed & direction, gustiness, and directional spread — then writes
// `src/data/weatherClimatology.ts`. The output is committed, so the app and CI
// never need network access; re-run this to refresh the baseline (the same
// pattern as scripts/build-coastlines.mjs).
//
// Offline (or if the API is unreachable / a host isn't allow-listed), it falls
// back to a deterministic `seed` baseline derived from the race's prevailing
// wind, so the generated file is always complete and the build stays green.
//
// Usage:
//   node scripts/build-weather.mjs            # uses real data where reachable
//   OFFLINE=1 node scripts/build-weather.mjs  # force the seed baseline
//
// Open-Meteo is free and needs no API key. If running behind an egress
// allow-list, permit `archive-api.open-meteo.com`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACES_FILE = path.join(__dirname, '..', 'src', 'data', 'races.ts');
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'weatherClimatology.ts');

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
// A recent, fully-available year for the archive (ERA5 lags ~5 days).
const ARCHIVE_YEAR = 2024;

// Parse the races: for each, its waypoints (for the centre), prevailing wind and
// season month. Only the fields we need, by their stable shapes in races.ts.
function loadRaces() {
  const src = fs.readFileSync(RACES_FILE, 'utf8');
  const idRe = /id:\s*'(race-[a-z0-9-]+)'/g;
  const ids = [];
  let m;
  while ((m = idRe.exec(src))) ids.push({ id: m[1], index: m.index });

  const races = [];
  for (let i = 0; i < ids.length; i += 1) {
    const chunk = src.slice(ids[i].index, i + 1 < ids.length ? ids[i + 1].index : src.length);

    const wpRe = /lat:\s*(-?\d+(?:\.\d+)?),\s*lon:\s*(-?\d+(?:\.\d+)?)/g;
    const course = [];
    let w;
    while ((w = wpRe.exec(chunk))) course.push([parseFloat(w[1]), parseFloat(w[2])]);
    if (course.length < 2) continue;

    const pw = chunk.match(/prevailingWind:\s*\{\s*fromDeg:\s*(-?\d+(?:\.\d+)?),\s*speedKn:\s*(-?\d+(?:\.\d+)?)/);
    const seasonM = chunk.match(/season:\s*'([^']+)'/);
    const seasonWord = (seasonM ? seasonM[1] : '').toLowerCase().match(/[a-z]+/);
    const month = seasonWord && MONTHS[seasonWord[0]] ? MONTHS[seasonWord[0]] : 6;

    const lat = course.reduce((s, c) => s + c[0], 0) / course.length;
    const lon = course.reduce((s, c) => s + c[1], 0) / course.length;
    races.push({
      id: ids[i].id,
      lat: Math.round(lat * 1000) / 1000,
      lon: Math.round(lon * 1000) / 1000,
      month,
      prevailingFromDeg: pw ? parseFloat(pw[1]) : 225,
      prevailingSpeedKn: pw ? parseFloat(pw[2]) : 12,
    });
  }
  return races;
}

const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const norm360 = (d) => ((d % 360) + 360) % 360;

// Deterministic fallback when there's no live data: the prevailing wind, with
// sensible defaults for gustiness and directional spread.
function seedClimate(race) {
  return {
    fromDeg: norm360(race.prevailingFromDeg),
    speedKn: race.prevailingSpeedKn,
    gustFactor: 0.2,
    variabilityDeg: 20,
    source: 'seed',
  };
}

// Aggregate an hourly month of wind into mean speed, vector-mean direction,
// gust factor and circular directional spread.
function aggregate(speeds, dirs) {
  const n = speeds.length;
  const meanSpeed = speeds.reduce((s, v) => s + v, 0) / n;
  const variance = speeds.reduce((s, v) => s + (v - meanSpeed) ** 2, 0) / n;
  const sd = Math.sqrt(variance);

  let sumSin = 0;
  let sumCos = 0;
  for (const d of dirs) {
    const r = (d * Math.PI) / 180;
    sumSin += Math.sin(r);
    sumCos += Math.cos(r);
  }
  const meanDir = norm360((Math.atan2(sumSin / n, sumCos / n) * 180) / Math.PI);
  const R = Math.min(1, Math.hypot(sumSin / n, sumCos / n));
  const circStdDeg = R > 0 ? Math.sqrt(-2 * Math.log(R)) * (180 / Math.PI) : 90;

  return {
    fromDeg: r1(meanDir),
    speedKn: r1(meanSpeed),
    gustFactor: r2(Math.max(0.05, Math.min(0.6, meanSpeed > 0 ? sd / meanSpeed : 0.2))),
    variabilityDeg: r1(Math.max(5, Math.min(70, circStdDeg))),
    source: 'open-meteo',
    sampledAt: new Date().toISOString().slice(0, 10),
  };
}

async function fetchClimate(race) {
  const mm = String(race.month).padStart(2, '0');
  const end = new Date(ARCHIVE_YEAR, race.month, 0).getDate(); // last day of month
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${race.lat}&longitude=${race.lon}` +
    `&start_date=${ARCHIVE_YEAR}-${mm}-01&end_date=${ARCHIVE_YEAR}-${mm}-${String(end).padStart(2, '0')}` +
    `&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const speeds = (json.hourly?.wind_speed_10m ?? []).filter((v) => v != null);
    const dirs = (json.hourly?.wind_direction_10m ?? []).filter((v) => v != null);
    if (speeds.length < 24 || dirs.length < 24) throw new Error('too few samples');
    return aggregate(speeds, dirs);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const races = loadRaces();
  const offline = process.env.OFFLINE === '1';
  const out = {};
  let real = 0;

  for (const race of races) {
    if (offline) {
      out[race.id] = seedClimate(race);
      continue;
    }
    try {
      out[race.id] = await fetchClimate(race);
      real += 1;
      process.stdout.write(`  ✓ ${race.id} (open-meteo)\n`);
    } catch (err) {
      out[race.id] = seedClimate(race);
      process.stdout.write(`  · ${race.id} (seed — ${err.message})\n`);
    }
  }

  const entries = Object.keys(out)
    .sort()
    .map((id) => `  '${id}': ${JSON.stringify(out[id])},`)
    .join('\n');

  const header = `// Per-race wind climatology — the realistic seasonal baseline each race's wind
// field is seeded from. GENERATED by \`node scripts/build-weather.mjs\`; do not
// hand-edit. With network access the script pulls real wind statistics from
// Open-Meteo for each course's waters in its racing season; offline it falls
// back to a \`seed\` baseline derived from the race's prevailing wind, so the app
// and CI never need the network (the same pattern as the coastlines).
//
// The engine reads this in \`createWindField\`: a present entry refines the
// field's direction, strength, gustiness and directional variability. Ranked
// races stay fully deterministic — this only changes the per-race baseline.

export interface RaceClimate {
  fromDeg: number; // mean wind direction the breeze blows FROM
  speedKn: number; // mean wind speed
  gustFactor: number; // gust/lull spread as a fraction of the mean (0–~0.5)
  variabilityDeg: number; // directional spread; scales the field's oscillating shift
  source: 'open-meteo' | 'seed';
  sampledAt?: string; // ISO date the Open-Meteo snapshot was taken
}

export const WEATHER_CLIMATOLOGY: Record<string, RaceClimate> = {
`;

  fs.writeFileSync(OUT_FILE, `${header}${entries}\n};\n`);
  process.stdout.write(
    `\nWrote ${Object.keys(out).length} races to ${path.relative(process.cwd(), OUT_FILE)} ` +
      `(${real} from Open-Meteo, ${Object.keys(out).length - real} seeded).\n`
  );
}

main();
