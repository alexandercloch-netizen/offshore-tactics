import { GeoPoint, Race, WeatherScenario, WeatherScenarioPoint, WeatherScenarioStamp } from '../types';

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
      `&wind_speed_unit=kn&models=${WEATHER_MODEL}&forecast_hours=${hoursAhead}&timeformat=unixtime`;

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
