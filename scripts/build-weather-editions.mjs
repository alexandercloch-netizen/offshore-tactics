// Build-time generator for the curated historic race editions.
//
// For each configured edition (a storied, safely-sailed running of one of our
// races) it pulls the REAL hourly wind — speed, direction, gusts, in knots —
// and surface pressure from Open-Meteo's ERA5 reanalysis archive for the actual
// event dates, sampled along the course (1 point for a short course, 3 for a
// long one, mirroring src/services/weather.ts), and writes
// `src/data/weatherEditions.ts`: a map of '<raceId>@<year>' → WeatherScenario
// (kind 'historic', model 'era5', hours race-relative to the historic gun).
// The output is committed, so the app, CI and guests never need the network —
// the same pattern as scripts/build-weather.mjs.
//
// SAFETY: unlike the climatology script there is NO seed fallback. An edition
// is real weather or it is nothing — on any fetch failure this script writes
// nothing and exits non-zero, so a blocked network can never bake invented
// history into the committed file.
//
// PRODUCT RULE (binding): editions are chosen from storied, safely-sailed
// races. Any edition that saw loss of life is barred — the vet lives in
// src/data/weatherEditions.exclusions.ts and is enforced by
// src/__tests__/weatherEditions.test.ts. Honour the race, never the tragedy.
//
// Usage:
//   NODE_USE_ENV_PROXY=1 node scripts/build-weather-editions.mjs
//
// Open-Meteo is free and needs no API key. If running behind an egress
// allow-list, permit `archive-api.open-meteo.com`.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACES_FILE = path.join(__dirname, '..', 'src', 'data', 'races.ts');
const OUT_FILE = path.join(__dirname, '..', 'src', 'data', 'weatherEditions.ts');

// Must match src/services/weather.ts — a scenario means the same thing wherever
// it was baked. Bump SCENARIO_FIELD_VERSION there and re-run this script.
const FIELD_VERSION = 1;
const MULTI_POINT_NM = 150;

// The curated editions. `startUtc` is the historic gun (hours in the baked
// series are relative to it); `days` covers the passage for the whole fleet.
// Every entry must clear the exclusions vet — see the test.
const EDITIONS = [
  {
    raceId: 'race-sydney-hobart',
    year: 2017,
    label: '2017 — the record run',
    blurb:
      'The fastest Hobart ever sailed. A rare nor’easter ran the fleet downwind almost ' +
      'the whole way south — kites up out of the Heads, a fresh following breeze through ' +
      'Bass Strait — and LDV Comanche took line honours in 1 day, 9 hours and 15 minutes.',
    // 13:00 AEDT, Boxing Day 2017.
    startUtc: '2017-12-26T02:00:00Z',
    days: 3,
    sourceUrl: 'https://rolexsydneyhobart.com',
  },
  {
    raceId: 'race-fastnet',
    year: 2011,
    label: '2011 — record pace to the Rock',
    blurb:
      'A fair westerly and a fast, free track: the fleet reached out to the Rock at record ' +
      'pace and the outright course record fell. Crack sheets, find the pressure offshore ' +
      'and keep her rolling.',
    // Midday BST, Sunday 14 August 2011.
    startUtc: '2011-08-14T11:00:00Z',
    days: 5,
    sourceUrl: 'https://www.rolexfastnetrace.com',
  },
  {
    raceId: 'race-newport-bermuda',
    year: 2016,
    label: '2016 — the big-breeze Thrash',
    blurb:
      'The record year of the Thrash to the Onion Patch: a soft start off Newport, then a ' +
      'building north-quadrant breeze across the Gulf Stream that sent Comanche to ' +
      'St David’s Lighthouse in under 35 hours — the fastest passage the race had seen.',
    // Early-afternoon EDT start, Friday 17 June 2016.
    startUtc: '2016-06-17T18:00:00Z',
    days: 4,
    sourceUrl: 'https://www.bermudarace.com',
  },
];

// ---- Course geometry, read straight from races.ts (the single source of truth) ----

function loadCourses() {
  const src = fs.readFileSync(RACES_FILE, 'utf8');
  const idRe = /id:\s*'(race-[a-z0-9-]+)'/g;
  const ids = [];
  let m;
  while ((m = idRe.exec(src))) ids.push({ id: m[1], index: m.index });

  const courses = new Map();
  for (let i = 0; i < ids.length; i += 1) {
    const chunk = src.slice(ids[i].index, i + 1 < ids.length ? ids[i + 1].index : src.length);
    const wpRe = /lat:\s*(-?\d+(?:\.\d+)?),\s*lon:\s*(-?\d+(?:\.\d+)?)/g;
    const course = [];
    let w;
    while ((w = wpRe.exec(chunk))) course.push({ lat: parseFloat(w[1]), lon: parseFloat(w[2]) });
    if (course.length >= 2) courses.set(ids[i].id, course);
  }
  return courses;
}

const toRad = (d) => (d * Math.PI) / 180;
function haversineNm(a, b) {
  const R = 3440.065;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Where to sample the historic weather: one point for a short course; for a
// long one the start, the finish, and the waypoint nearest half distance — so
// the baked series carries the real spatial gradient along the passage.
function samplePoints(course) {
  const round3 = (v) => Math.round(v * 1000) / 1000;
  let total = 0;
  const cum = [0];
  for (let i = 1; i < course.length; i += 1) {
    total += haversineNm(course[i - 1], course[i]);
    cum.push(total);
  }
  if (total < MULTI_POINT_NM) {
    const lat = course.reduce((s, w) => s + w.lat, 0) / course.length;
    const lon = course.reduce((s, w) => s + w.lon, 0) / course.length;
    return [{ lat: round3(lat), lon: round3(lon) }];
  }
  let midIdx = 0;
  for (let i = 0; i < course.length; i += 1) {
    if (Math.abs(cum[i] - total / 2) < Math.abs(cum[midIdx] - total / 2)) midIdx = i;
  }
  const picks = [course[0], course[midIdx], course[course.length - 1]];
  return picks.map((w) => ({ lat: round3(w.lat), lon: round3(w.lon) }));
}

// ---- The ERA5 fetch — real data or a hard failure, never a seed ----

const r1 = (n) => Math.round(n * 10) / 10;

async function fetchPoint(pt, startMs, startDate, endDate) {
  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${pt.lat}&longitude=${pt.lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure` +
    `&wind_speed_unit=kn&models=era5&timeformat=unixtime`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const h = json.hourly ?? {};
    const times = h.time ?? [];
    const speeds = h.wind_speed_10m ?? [];
    const dirs = h.wind_direction_10m ?? [];
    const gusts = h.wind_gusts_10m ?? [];
    const pressures = h.surface_pressure ?? [];

    const hours = [];
    const fromDeg = [];
    const speedKn = [];
    const gustKn = [];
    const pressureHpa = [];
    for (let i = 0; i < times.length; i += 1) {
      const t = times[i];
      const speed = speeds[i];
      const dir = dirs[i];
      if (t == null || speed == null || dir == null) continue; // skip gaps, keep lockstep
      const hr = (t * 1000 - startMs) / 3_600_000;
      if (hr < -1) continue; // one pre-gun sample is plenty; the series clamps at its ends
      hours.push(Math.round(hr * 100) / 100);
      speedKn.push(r1(speed));
      fromDeg.push(Math.round(dir));
      gustKn.push(r1(gusts[i] ?? speed));
      pressureHpa.push(r1(pressures[i] ?? 1013));
    }
    // A real edition covers the whole passage hour by hour — anything thinner
    // means the archive answered incompletely, and we refuse to ship it.
    if (hours.length < 24) throw new Error(`too few samples (${hours.length})`);
    return {
      lat: json.latitude ?? pt.lat,
      lon: json.longitude ?? pt.lon,
      hours,
      fromDeg,
      speedKn,
      gustKn,
      pressureHpa,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Mean speed and vector-mean direction of a baked point, for the build log —
// the human check that each edition's numbers match its story.
function character(point) {
  const n = point.speedKn.length;
  const mean = point.speedKn.reduce((s, v) => s + v, 0) / n;
  const max = Math.max(...point.speedKn);
  let ss = 0;
  let cc = 0;
  for (const d of point.fromDeg) {
    ss += Math.sin(toRad(d));
    cc += Math.cos(toRad(d));
  }
  const dir = ((Math.atan2(ss, cc) * 180) / Math.PI + 360) % 360;
  return `${r1(mean)} kn (max ${r1(max)}) from ${Math.round(dir)}°`;
}

async function main() {
  const courses = loadCourses();
  const out = {};
  const sources = {};

  for (const ed of EDITIONS) {
    const course = courses.get(ed.raceId);
    if (!course) throw new Error(`${ed.raceId}: race not found in races.ts`);
    const startMs = Date.parse(ed.startUtc);
    if (Number.isNaN(startMs)) throw new Error(`${ed.raceId}@${ed.year}: bad startUtc`);
    const startDate = ed.startUtc.slice(0, 10);
    const endDate = new Date(startMs + ed.days * 86_400_000).toISOString().slice(0, 10);

    const pts = samplePoints(course);
    const points = [];
    for (const pt of pts) {
      points.push(await fetchPoint(pt, startMs, startDate, endDate));
    }

    const key = `${ed.raceId}@${ed.year}`;
    out[key] = {
      kind: 'historic',
      raceId: ed.raceId,
      label: ed.label,
      blurb: ed.blurb,
      model: 'era5',
      issuedAt: ed.startUtc,
      year: ed.year,
      points,
      fieldVersion: FIELD_VERSION,
    };
    sources[key] = ed.sourceUrl;
    process.stdout.write(`  ✓ ${key} — ${points.map(character).join(' | ')}\n`);
  }

  const entries = Object.keys(out)
    .map((key) => `  '${key}': ${JSON.stringify(out[key])},`)
    .join('\n');
  const sourceEntries = Object.keys(sources)
    .map((key) => `  '${key}': '${sources[key]}',`)
    .join('\n');

  const header = `// Curated historic race editions — REAL weather, reconstructed from the ERA5
// reanalysis via Open-Meteo's archive, for storied, safely-sailed runnings of
// our races. GENERATED by \`node scripts/build-weather-editions.mjs\`; do not
// hand-edit. Unlike the climatology there is NO seed fallback: an edition is
// real weather or it does not ship, so this file only ever holds the genuine
// article. Bundled data — editions work offline, for guests, with no flag.
//
// Editions never post to the global leaderboard (the submit gate fails closed
// on any scenario stamp), and every entry must clear the fatality vet in
// weatherEditions.exclusions.ts — enforced by weatherEditions.test.ts.

import type { WeatherScenario } from '../types';

// Keyed '<raceId>@<year>'. \`hours\` are race-relative to the historic gun.
export const WEATHER_EDITIONS: Record<string, WeatherScenario> = {
`;

  const footer = `};

// Provenance: where each edition's story is recorded.
export const EDITION_SOURCES: Record<string, string> = {
${sourceEntries}
};

// The editions of one race, newest first — the briefing's Archive shelf.
// Races with no editions get an empty list (and render nothing).
export function editionsForRace(raceId?: string): WeatherScenario[] {
  return Object.values(WEATHER_EDITIONS)
    .filter((s) => s.raceId === raceId)
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
}
`;

  fs.writeFileSync(OUT_FILE, `${header}${entries}\n${footer}`);
  process.stdout.write(
    `\nWrote ${Object.keys(out).length} editions to ${path.relative(process.cwd(), OUT_FILE)}.\n`
  );
}

main().catch((err) => {
  // Write NOTHING on failure: a half-baked or seeded edition must never ship.
  process.stderr.write(`\nbuild-weather-editions FAILED: ${err.message}\n`);
  process.stderr.write('No file written. Fix the network/config and re-run.\n');
  process.exit(1);
});
