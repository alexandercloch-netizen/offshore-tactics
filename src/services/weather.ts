import {
  GeoPoint,
  Race,
  SailingRegion,
  WeatherScenario,
  WeatherScenarioPoint,
  WeatherScenarioStamp,
  WindSample,
} from '../types';
import { BoardConditions } from '../engine/sailNow';
import { FlowCell } from '../components/flowField';
import { REGION_BOUNDS } from '../data/worldmap';
import {
  WORLD_LATTICE_CELLS,
  WORLD_LATTICE_COLS,
  WORLD_LATTICE_ROWS,
  WORLD_NEAREST_OCEAN,
  WORLD_OCEAN_INDEX,
} from '../data/worldLattice';
import { WORLD_CLIMATOLOGY } from '../data/worldClimatology';
import { haversineNm } from '../engine/geo';

// Live weather scenarios ("sail today's forecast") from Open-Meteo's free
// forecast API. Strictly optional and fail-soft: the fetch runs only behind the
// EXPO_PUBLIC_LIVE_WEATHER flag, sends coordinates and hours only (no user
// data), and ANY failure resolves to null — the game then simply sails the
// seasonal conditions, exactly as it always has. CI, tests and the guest path
// never touch the network.

// The model is PINNED, never `best_match`: a scenario must mean the same thing
// on every device and every day the same forecast is sailed.
export const WEATHER_MODEL = 'ecmwf_ifs025';
export const WEATHER_MODEL_LABEL = 'ECMWF';
// Bump when the scenario→wind-field mapping changes shape.
export const SCENARIO_FIELD_VERSION = 1;

const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const FETCH_TIMEOUT_MS = 4000;

// The live-claim clocks, shared by every surface that paints live weather
// (PR-2 wires them to focus/refresh; they live here so there is exactly one
// boundary). A live reading older than LIVE_REFRESH_MS is refetched on focus;
// one older than STALE_DEMOTE_MS may no longer be shown as live at all — the
// whole surface demotes to its seasonal rung and relabels. Never a mix.
export const LIVE_REFRESH_MS = 15 * 60_000;
export const STALE_DEMOTE_MS = 60 * 60_000;

// Longer courses sample start/mid/finish so the field carries the model's real
// spatial gradient; a short course sees one synoptic sky.
const MULTI_POINT_NM = 150;
// The series must outlast the passage: record pace × this margin, in hours.
const HOURS_MARGIN = 1.5;

// The feature flag: absent (the default) means the fetch code path never runs.
export function liveWeatherEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_LIVE_WEATHER;
  return flag === '1' || flag === 'true';
}

// The compact provenance carried on the save and the result — enough to label
// the run honestly without freezing the whole series into history.
export function scenarioStamp(s: WeatherScenario): WeatherScenarioStamp {
  return {
    kind: s.kind,
    model: s.model,
    issuedAt: s.issuedAt,
    label: s.label,
    ...(s.year != null ? { year: s.year } : {}),
  };
}

// One legible line for results & the logbook: "Today's forecast — ECMWF
// 2026-07-04" for a live run; "2017 — the record run · ERA5" for a historic
// edition (its label already carries the year, so no date is repeated).
export function scenarioTagLine(s: WeatherScenarioStamp): string {
  const lower = s.model.toLowerCase();
  const model = lower.startsWith('ecmwf')
    ? WEATHER_MODEL_LABEL
    : lower.startsWith('era5')
      ? 'ERA5'
      : s.model;
  if (s.kind === 'historic') return `${s.label} · ${model}`;
  const dated = s.year != null ? String(s.year) : s.issuedAt.slice(0, 10);
  return `${s.label} — ${model} ${dated}`;
}

// Where to sample the forecast along the course (coordinates only, rounded).
function samplePoints(race: Race): GeoPoint[] {
  const round3 = (v: number): number => Math.round(v * 1000) / 1000;
  const wps = race.waypoints;
  if (race.distanceNm < MULTI_POINT_NM) {
    const lat = wps.reduce((s, w) => s + w.lat, 0) / wps.length;
    const lon = wps.reduce((s, w) => s + w.lon, 0) / wps.length;
    return [{ lat: round3(lat), lon: round3(lon) }];
  }
  const picks = [wps[0], wps[Math.floor(wps.length / 2)], wps[wps.length - 1]];
  return picks.map((w) => ({ lat: round3(w.lat), lon: round3(w.lon) }));
}

// The hourly variables of one Open-Meteo location (unix time, knots).
interface OpenMeteoLocation {
  latitude?: number;
  longitude?: number;
  hourly?: {
    time?: (number | null)[];
    wind_speed_10m?: (number | null)[];
    wind_direction_10m?: (number | null)[];
    wind_gusts_10m?: (number | null)[];
    surface_pressure?: (number | null)[];
  };
}

// One GET with a hard timeout; null on any failure (never throws).
async function getJson(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// One jittered retry — a briefing is worth a second knock, not a siege. (The
// jitter is network pacing, not gameplay, so it needn't go through engine/rng.)
async function getJsonWithRetry(url: string): Promise<unknown | null> {
  const first = await getJson(url);
  if (first !== null) return first;
  await new Promise((resolve) => setTimeout(resolve, 250 + Math.random() * 500));
  return getJson(url);
}

// Parse one location's hourly series into a scenario point with race-relative
// hours (0 = now). Null on anything malformed or too thin to sail.
function parsePoint(loc: OpenMeteoLocation, nowMs: number): WeatherScenarioPoint | null {
  const hourly = loc.hourly;
  if (!hourly || loc.latitude == null || loc.longitude == null) return null;
  const times = hourly.time ?? [];
  const speeds = hourly.wind_speed_10m ?? [];
  const dirs = hourly.wind_direction_10m ?? [];
  const gusts = hourly.wind_gusts_10m ?? [];
  const pressures = hourly.surface_pressure ?? [];

  const hours: number[] = [];
  const fromDeg: number[] = [];
  const speedKn: number[] = [];
  const gustKn: number[] = [];
  const pressureHpa: number[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const t = times[i];
    const speed = speeds[i];
    const dir = dirs[i];
    if (t == null || speed == null || dir == null) continue; // skip gaps, keep lockstep
    hours.push((t * 1000 - nowMs) / 3_600_000);
    speedKn.push(speed);
    fromDeg.push(dir);
    gustKn.push(gusts[i] ?? speed);
    pressureHpa.push(pressures[i] ?? 1013);
  }
  // Under six clean hours isn't a forecast worth racing on.
  if (hours.length < 6) return null;
  return { lat: loc.latitude, lon: loc.longitude, hours, fromDeg, speedKn, gustKn, pressureHpa };
}

// ---- The Harbour's conditions board ----------------------------------------

// One representative point per race for the dashboard's "right now" board: the
// course centroid (coordinates only, rounded — same privacy discipline as the
// scenario fetch).
function boardPoint(race: Race): GeoPoint {
  const round2 = (v: number): number => Math.round(v * 100) / 100;
  const lat = race.waypoints.reduce((s, w) => s + w.lat, 0) / race.waypoints.length;
  const lon = race.waypoints.reduce((s, w) => s + w.lon, 0) / race.waypoints.length;
  return { lat: round2(lat), lon: round2(lon) };
}

// The `current=` block of one Open-Meteo location.
interface OpenMeteoCurrentLocation {
  current?: {
    wind_speed_10m?: number | null;
    wind_direction_10m?: number | null;
  };
}

// Fetch the current wind for EVERY race in one batched request (comma-separated
// coordinate lists — a single GET, however many courses), for the Harbour's
// conditions board. Same discipline as the scenario fetch: flag-gated, 4s
// timeout, one retry, and null on ANY failure — the caller then simply shows
// the seasonal outlook instead. A partial response is treated as no response:
// a board that silently mixed live and seasonal rows would lie about its label.
export async function fetchBoardConditions(races: Race[]): Promise<BoardConditions | null> {
  if (!liveWeatherEnabled()) return null;
  if (races.length === 0) return null;
  try {
    const points = races.map(boardPoint);
    const url =
      `${WEATHER_API}?latitude=${points.map((p) => p.lat).join(',')}` +
      `&longitude=${points.map((p) => p.lon).join(',')}` +
      `&current=wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=kn&models=${WEATHER_MODEL}&cell_selection=sea&timeformat=unixtime`;

    const json = await getJsonWithRetry(url);
    if (!json || typeof json !== 'object') return null;
    const locations = (Array.isArray(json) ? json : [json]) as OpenMeteoCurrentLocation[];
    if (locations.length !== races.length) return null;

    const samples: Record<string, WindSample> = {};
    for (let i = 0; i < races.length; i += 1) {
      const current = locations[i]?.current;
      if (current?.wind_speed_10m == null || current.wind_direction_10m == null) return null;
      samples[races[i].id] = {
        fromDeg: current.wind_direction_10m,
        speedKn: current.wind_speed_10m,
      };
    }
    return { source: 'live', samples, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

// Fetch today's forecast for a course as a WeatherScenario, or null on ANY
// failure (flag off, offline, timeout, HTTP error, malformed body). Callers
// treat null as "sail the seasonal conditions" — no error handling needed.
export async function fetchCourseSnapshot(race: Race): Promise<WeatherScenario | null> {
  if (!liveWeatherEnabled()) return null;
  try {
    const points = samplePoints(race);
    const hoursAhead = Math.max(24, Math.min(240, Math.ceil(race.recordTimeHours * HOURS_MARGIN)));
    const url =
      `${WEATHER_API}?latitude=${points.map((p) => p.lat).join(',')}` +
      `&longitude=${points.map((p) => p.lon).join(',')}` +
      `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure` +
      `&wind_speed_unit=kn&models=${WEATHER_MODEL}&cell_selection=sea` +
      `&forecast_hours=${hoursAhead}&timeformat=unixtime`;

    const json = await getJsonWithRetry(url);
    if (!json || typeof json !== 'object') return null;
    // One point returns a single object; several return an array of them.
    const locations = (Array.isArray(json) ? json : [json]) as OpenMeteoLocation[];
    const nowMs = Date.now();
    const parsed: WeatherScenarioPoint[] = [];
    for (const loc of locations) {
      const p = parsePoint(loc, nowMs);
      if (!p) return null; // a partial course forecast is worse than none
      parsed.push(p);
    }
    if (parsed.length === 0) return null;

    return {
      kind: 'live',
      raceId: race.id,
      label: "Today's forecast",
      blurb: 'Real model output for the course, right now.',
      model: WEATHER_MODEL,
      issuedAt: new Date(nowMs).toISOString(),
      points: parsed,
      fieldVersion: SCENARIO_FIELD_VERSION,
    };
  } catch {
    return null;
  }
}

// ---- The Harbour's flow lattices --------------------------------------------
//
// The world chart and the region drill-ins paint a real wind field: every
// rendered cell is (or copies) an actual ECMWF sea-cell sample — the fetched
// lattice IS the display grid, so there is no interpolation anywhere except
// bilinear between adjacent real samples inside buildFlowField. These are pure
// fetchers: the caller owns caching (session state is PR-2's concern), the
// same flag/timeout/retry/all-or-nothing discipline as the board fetch.

// One fetched lattice, ready for buildFlowField: row-major, north row first.
export interface LiveFlowGrid {
  cells: FlowCell[];
  cols: number;
  rows: number;
  fetchedAt: number; // epoch ms — feeds "as of HH:MM" and the demotion clock
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Parse one batched current-wind response into per-point samples (null where a
// point came back empty). Null overall on a malformed or miscounted body.
function parseCurrentBatch(json: unknown, expected: number): (WindSample | null)[] | null {
  if (!json || typeof json !== 'object') return null;
  const locations = (Array.isArray(json) ? json : [json]) as OpenMeteoCurrentLocation[];
  if (locations.length !== expected) return null;
  return locations.map((loc) => {
    const current = loc?.current;
    if (current?.wind_speed_10m == null || current.wind_direction_10m == null) return null;
    return { fromDeg: current.wind_direction_10m, speedKn: current.wind_speed_10m };
  });
}

// The world's ocean lattice in ONE batched GET — current wind at every ocean
// node of the baked 10° grid. Tolerates a whisper of missing points (≤2% of
// the ocean set, filled from the nearest LIVE neighbour — within-source fill,
// never a live/seasonal mix); anything worse is treated as no response.
// Rehydrates to the full 36×13 grid via WORLD_NEAREST_OCEAN — land cells copy
// their nearest ocean node and are painted over by the land layer, so the fill
// is display plumbing, never a data claim.
export async function fetchWorldFlow(): Promise<LiveFlowGrid | null> {
  if (!liveWeatherEnabled()) return null;
  try {
    const ocean = WORLD_OCEAN_INDEX.map((i) => WORLD_LATTICE_CELLS[i]);
    const url =
      `${WEATHER_API}?latitude=${ocean.map((p) => p.lat).join(',')}` +
      `&longitude=${ocean.map((p) => p.lon).join(',')}` +
      `&current=wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=kn&models=${WEATHER_MODEL}&cell_selection=sea&timeformat=unixtime`;

    const samples = parseCurrentBatch(await getJsonWithRetry(url), ocean.length);
    if (!samples) return null;
    const nullCount = samples.filter((s) => s === null).length;
    if (nullCount > ocean.length * 0.02) return null;

    // Patch the stragglers from their nearest live neighbour (deterministic:
    // first minimum in fetch order).
    for (let i = 0; i < samples.length; i += 1) {
      if (samples[i] !== null) continue;
      let best: WindSample | null = null;
      let bestNm = Infinity;
      for (let j = 0; j < samples.length; j += 1) {
        const s = samples[j];
        if (s === null) continue;
        const d = haversineNm(ocean[i].lat, ocean[i].lon, ocean[j].lat, ocean[j].lon);
        if (d < bestNm) {
          bestNm = d;
          best = s;
        }
      }
      if (!best) return null; // an all-null board can't be patched
      samples[i] = best;
    }

    const cells: FlowCell[] = WORLD_LATTICE_CELLS.map((cell, i) => {
      const s = samples[WORLD_NEAREST_OCEAN[i]] as WindSample;
      return { lat: cell.lat, lon: cell.lon, dirDeg: s.fromDeg, speedKn: s.speedKn };
    });
    return {
      cells,
      cols: WORLD_LATTICE_COLS,
      rows: WORLD_LATTICE_ROWS,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

// The regions the Harbour can chart live ('other' borrows and has no box).
export type LiveRegionKey = Exclude<SailingRegion, 'other'>;

// A per-region lattice sized to its box so anchors stay ≤~450 km apart — live
// mode's honest replacement for IDW over a huge box. All-or-nothing: a region
// field with holes would silently lie, so any missing point is no response.
export async function fetchRegionFlow(region: LiveRegionKey): Promise<LiveFlowGrid | null> {
  if (!liveWeatherEnabled()) return null;
  const bounds = REGION_BOUNDS[region];
  if (!bounds) return null;
  try {
    const cols = clamp(Math.ceil((bounds.maxLon - bounds.minLon) / 4), 6, 12);
    const rows = clamp(Math.ceil((bounds.maxLat - bounds.minLat) / 4), 5, 10);
    // Same node placement as blendWindGrid: endpoints inclusive, north row
    // first — the swap-in keeps buildFlowField's affine contract.
    const grid: GeoPoint[] = [];
    for (let r = 0; r < rows; r += 1) {
      const lat = bounds.maxLat + ((bounds.minLat - bounds.maxLat) * r) / (rows - 1);
      for (let c = 0; c < cols; c += 1) {
        const lon = bounds.minLon + ((bounds.maxLon - bounds.minLon) * c) / (cols - 1);
        grid.push({ lat, lon });
      }
    }
    const round3 = (v: number): number => Math.round(v * 1000) / 1000;
    const url =
      `${WEATHER_API}?latitude=${grid.map((p) => round3(p.lat)).join(',')}` +
      `&longitude=${grid.map((p) => round3(p.lon)).join(',')}` +
      `&current=wind_speed_10m,wind_direction_10m` +
      `&wind_speed_unit=kn&models=${WEATHER_MODEL}&cell_selection=sea&timeformat=unixtime`;

    const samples = parseCurrentBatch(await getJsonWithRetry(url), grid.length);
    if (!samples || samples.some((s) => s === null)) return null;

    const cells: FlowCell[] = grid.map((p, i) => {
      const s = samples[i] as WindSample;
      return { lat: p.lat, lon: p.lon, dirDeg: s.fromDeg, speedKn: s.speedKn };
    });
    return { cells, cols, rows, fetchedAt: Date.now() };
  } catch {
    return null;
  }
}

// ---- The seasonal world (the guest/CI/flag-off/demoted story) -----------------

// The baked world climatology for one month, as the same 36×13 grid the live
// fetch returns — plus each cell's constancy q (0–1), which PR-2 gates any
// seasonal direction glyph on (a westerlies-belt "mean direction" with q 0.3
// is a fiction; the wash may paint speed, the vanes must hold their tongue).
export interface SeasonalWorldFlow {
  cells: FlowCell[];
  q: number[]; // per cell, aligned with cells
  cols: number;
  rows: number;
}

// Pure and total: quantised half-knots / 3° steps / tenths back to real units,
// rehydrated through the same nearest-ocean map as the live grid.
export function seasonalWorldFlow(monthIndex: number): SeasonalWorldFlow {
  const m = clamp(Math.floor(monthIndex), 0, 11);
  const cells: FlowCell[] = [];
  const q: number[] = [];
  for (let i = 0; i < WORLD_LATTICE_CELLS.length; i += 1) {
    const cell = WORLD_LATTICE_CELLS[i];
    const row = WORLD_CLIMATOLOGY[WORLD_NEAREST_OCEAN[i]];
    cells.push({
      lat: cell.lat,
      lon: cell.lon,
      dirDeg: row[12 + m] * 3,
      speedKn: row[m] / 2,
    });
    q.push(row[24 + m] / 10);
  }
  return { cells, q, cols: WORLD_LATTICE_COLS, rows: WORLD_LATTICE_ROWS };
}
