import {
  fetchBoardConditions,
  fetchCourseSnapshot,
  fetchRegionFlow,
  fetchWorldFlow,
  liveWeatherEnabled,
  LIVE_REFRESH_MS,
  scenarioStamp,
  scenarioTagLine,
  SCENARIO_FIELD_VERSION,
  STALE_DEMOTE_MS,
  WEATHER_MODEL,
} from '../services/weather';
import { getRaceById } from '../data';
import { WeatherScenario } from '../types';
import {
  WORLD_LATTICE_CELLS,
  WORLD_NEAREST_OCEAN,
  WORLD_OCEAN_INDEX,
} from '../data/worldLattice';
import { haversineNm } from '../engine/geo';
import FORECAST_FIXTURE from './fixtures/openMeteoForecast.json';

// All network-shaped tests run against a mocked fetch — CI never dials out.
const realFetch = global.fetch;
const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body } as unknown as Response);
const errorResponse = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) } as unknown as Response);

// A fetch that never answers — it only rejects when the timeout aborts it.
const hangingFetch = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

beforeEach(() => {
  process.env.EXPO_PUBLIC_LIVE_WEATHER = '1';
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_LIVE_WEATHER;
  global.fetch = realFetch;
  jest.useRealTimers();
});

const fastnet = () => getRaceById('race-fastnet')!;

describe('the feature flag', () => {
  it('is OFF by default — no flag, no fetch code path at all', async () => {
    delete process.env.EXPO_PUBLIC_LIVE_WEATHER;
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(liveWeatherEnabled()).toBe(false);
    expect(await fetchCourseSnapshot(fastnet())).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('turns on with 1 or true', () => {
    expect(liveWeatherEnabled()).toBe(true);
    process.env.EXPO_PUBLIC_LIVE_WEATHER = 'true';
    expect(liveWeatherEnabled()).toBe(true);
  });
});

describe('fetchCourseSnapshot', () => {
  it('parses a real captured multi-point response into a scenario', async () => {
    const spy = jest.fn().mockResolvedValue(okResponse(FORECAST_FIXTURE));
    global.fetch = spy as unknown as typeof fetch;

    const scenario = await fetchCourseSnapshot(fastnet());
    expect(scenario).not.toBeNull();
    expect(scenario!.kind).toBe('live');
    expect(scenario!.raceId).toBe('race-fastnet');
    expect(scenario!.model).toBe(WEATHER_MODEL);
    expect(scenario!.fieldVersion).toBe(SCENARIO_FIELD_VERSION);
    // The Fastnet is a long course: start / mid / finish sampling.
    expect(scenario!.points).toHaveLength(3);
    for (const p of scenario!.points) {
      expect(p.hours.length).toBeGreaterThanOrEqual(6);
      expect(p.hours.length).toBe(p.fromDeg.length);
      expect(p.hours.length).toBe(p.speedKn.length);
      // Hours are race-relative and strictly ascending (hourly steps).
      for (let i = 1; i < p.hours.length; i += 1) {
        expect(p.hours[i]).toBeGreaterThan(p.hours[i - 1]);
      }
    }
    // The captured fixture's first location leads with 13.6 kn from 243°.
    expect(scenario!.points[0].speedKn[0]).toBe(13.6);
    expect(scenario!.points[0].fromDeg[0]).toBe(243);
  });

  it('pins the model and units in the request — never best_match', async () => {
    const spy = jest.fn().mockResolvedValue(okResponse(FORECAST_FIXTURE));
    global.fetch = spy as unknown as typeof fetch;
    await fetchCourseSnapshot(fastnet());
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain(`models=${WEATHER_MODEL}`);
    expect(url).toContain('wind_speed_unit=kn');
    expect(url).not.toContain('best_match');
    // Coordinates and hours only — nothing about the player crosses the wire.
    expect(url).not.toMatch(/user|name|email|id=/);
  });

  it('returns null on an HTTP error, after exactly one retry', async () => {
    const spy = jest.fn().mockResolvedValue(errorResponse(500));
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchCourseSnapshot(fastnet())).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2); // the first knock + one jittered retry
  });

  it('recovers when the retry succeeds', async () => {
    const spy = jest
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce(okResponse(FORECAST_FIXTURE));
    global.fetch = spy as unknown as typeof fetch;
    const scenario = await fetchCourseSnapshot(fastnet());
    expect(scenario).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('returns null when the request times out (never throws, never hangs)', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(hangingFetch) as unknown as typeof fetch;
    const pending = fetchCourseSnapshot(fastnet());
    await jest.advanceTimersByTimeAsync(20_000); // both attempts abort + backoff
    expect(await pending).toBeNull();
  });

  it('returns null on a malformed body', async () => {
    const spy = jest.fn().mockResolvedValue(okResponse({ nothing: 'useful' }));
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchCourseSnapshot(fastnet())).toBeNull();
  });
});

describe('scenario provenance', () => {
  const scenario: WeatherScenario = {
    kind: 'live',
    raceId: 'race-fastnet',
    label: "Today's forecast",
    model: 'ecmwf_ifs025',
    issuedAt: '2026-07-04T06:15:00.000Z',
    points: [],
    fieldVersion: 1,
  };

  it('stamps the compact provenance', () => {
    expect(scenarioStamp(scenario)).toEqual({
      kind: 'live',
      model: 'ecmwf_ifs025',
      issuedAt: '2026-07-04T06:15:00.000Z',
      label: "Today's forecast",
    });
  });

  it('writes the honest one-line tag', () => {
    expect(scenarioTagLine(scenarioStamp(scenario))).toBe("Today's forecast — ECMWF 2026-07-04");
  });
});

describe('fetchBoardConditions', () => {
  const races = () => [getRaceById('race-fastnet')!, getRaceById('race-round-island')!];
  const location = (speed: number, dir: number) => ({
    current: { wind_speed_10m: speed, wind_direction_10m: dir },
  });

  it('never fetches with the flag off', async () => {
    delete process.env.EXPO_PUBLIC_LIVE_WEATHER;
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchBoardConditions(races())).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches ALL races in one batched request and labels the result live', async () => {
    const spy = jest.fn().mockResolvedValue(okResponse([location(14.2, 250), location(8.1, 270)]));
    global.fetch = spy as unknown as typeof fetch;

    const board = await fetchBoardConditions(races());
    expect(board).not.toBeNull();
    expect(board!.source).toBe('live');
    expect(board!.samples['race-fastnet']).toEqual({ fromDeg: 250, speedKn: 14.2 });
    expect(board!.samples['race-round-island']).toEqual({ fromDeg: 270, speedKn: 8.1 });

    // ONE GET, comma-separated coordinate lists, current wind only, knots,
    // the pinned model.
    expect(spy).toHaveBeenCalledTimes(1);
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('current=wind_speed_10m,wind_direction_10m');
    expect(url).toContain(`models=${WEATHER_MODEL}`);
    expect(url).toContain('wind_speed_unit=kn');
    expect(url.match(/latitude=([-0-9.,]+)/)![1].split(',')).toHaveLength(2);
    expect(url.match(/longitude=([-0-9.,]+)/)![1].split(',')).toHaveLength(2);
  });

  it('treats a partial or mismatched response as no response', async () => {
    // One location for two races — a mixed live/seasonal board would lie.
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse([location(14, 250)])) as unknown as typeof fetch;
    expect(await fetchBoardConditions(races())).toBeNull();

    // A location with the wind missing.
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse([location(14, 250), { current: {} }])) as unknown as typeof fetch;
    expect(await fetchBoardConditions(races())).toBeNull();
  });

  it('returns null on an HTTP error (after the one retry)', async () => {
    const spy = jest.fn().mockResolvedValue(errorResponse(500));
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchBoardConditions(races())).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('asks for sea cells and stamps when the reading was taken', async () => {
    const spy = jest.fn().mockResolvedValue(okResponse([location(14.2, 250), location(8.1, 270)]));
    global.fetch = spy as unknown as typeof fetch;
    const before = Date.now();
    const board = await fetchBoardConditions(races());
    // cell_selection=sea keeps a coastal centroid reading the water, not the
    // beach — the model's grid cell under a harbour is often land.
    expect(String(spy.mock.calls[0][0])).toContain('cell_selection=sea');
    expect(board!.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(board!.fetchedAt).toBeLessThanOrEqual(Date.now());
  });
});

// ---- The world flow lattice --------------------------------------------------

describe('fetchWorldFlow', () => {
  const N = WORLD_OCEAN_INDEX.length;
  const oceanCell = (fetchPos: number) => WORLD_LATTICE_CELLS[WORLD_OCEAN_INDEX[fetchPos]];
  // One deterministic sample per ocean node, all distinct enough to trace.
  const liveLocation = (i: number) => ({
    current: { wind_speed_10m: 5 + (i % 40) / 2, wind_direction_10m: (i * 7) % 360 },
  });
  const fullBatch = (nullAt: Set<number> = new Set()) =>
    Array.from({ length: N }, (_, i) => (nullAt.has(i) ? { current: {} } : liveLocation(i)));

  it('never fetches with the flag off', async () => {
    delete process.env.EXPO_PUBLIC_LIVE_WEATHER;
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchWorldFlow()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches every ocean node in ONE batched sea-cell GET on the pinned model', async () => {
    const spy = jest.fn().mockResolvedValue(okResponse(fullBatch()));
    global.fetch = spy as unknown as typeof fetch;

    const flow = await fetchWorldFlow();
    expect(flow).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('current=wind_speed_10m,wind_direction_10m');
    expect(url).toContain(`models=${WEATHER_MODEL}`);
    expect(url).toContain('wind_speed_unit=kn');
    expect(url).toContain('cell_selection=sea');
    expect(url.match(/latitude=([-0-9.,]+)/)![1].split(',')).toHaveLength(N);
    expect(url.match(/longitude=([-0-9.,]+)/)![1].split(',')).toHaveLength(N);
  });

  it('rehydrates the full 36×13 grid: ocean cells exact, land cells from their nearest ocean node', async () => {
    global.fetch = jest.fn().mockResolvedValue(okResponse(fullBatch())) as unknown as typeof fetch;
    const before = Date.now();
    const flow = await fetchWorldFlow();
    expect(flow!.cols).toBe(36);
    expect(flow!.rows).toBe(13);
    expect(flow!.cells).toHaveLength(36 * 13);
    expect(flow!.fetchedAt).toBeGreaterThanOrEqual(before);

    // Every ocean cell carries ITS OWN sample — distance-zero data, no IDW.
    WORLD_OCEAN_INDEX.forEach((cellIndex, fetchPos) => {
      const cell = flow!.cells[cellIndex];
      expect(cell.speedKn).toBe(5 + (fetchPos % 40) / 2);
      expect(cell.dirDeg).toBe((fetchPos * 7) % 360);
      expect(cell.lat).toBe(WORLD_LATTICE_CELLS[cellIndex].lat);
      expect(cell.lon).toBe(WORLD_LATTICE_CELLS[cellIndex].lon);
    });
    // Land cells copy the nearest ocean node (display plumbing under the land
    // layer, never shown as data).
    const oceanSet = new Set(WORLD_OCEAN_INDEX);
    for (let i = 0; i < flow!.cells.length; i += 1) {
      if (oceanSet.has(i)) continue;
      const fetchPos = WORLD_NEAREST_OCEAN[i];
      expect(flow!.cells[i].speedKn).toBe(5 + (fetchPos % 40) / 2);
      expect(flow!.cells[i].dirDeg).toBe((fetchPos * 7) % 360);
    }
  });

  it('patches a whisper of missing nodes from the nearest LIVE neighbour', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse(fullBatch(new Set([0])))) as unknown as typeof fetch;
    const flow = await fetchWorldFlow();
    expect(flow).not.toBeNull();

    // The spec: the hole copies its nearest live ocean node, great-circle.
    const hole = oceanCell(0);
    let nearest = 1;
    let nearestNm = Infinity;
    for (let j = 1; j < N; j += 1) {
      const d = haversineNm(hole.lat, hole.lon, oceanCell(j).lat, oceanCell(j).lon);
      if (d < nearestNm) {
        nearestNm = d;
        nearest = j;
      }
    }
    const patched = flow!.cells[WORLD_OCEAN_INDEX[0]];
    expect(patched.speedKn).toBe(5 + (nearest % 40) / 2);
    expect(patched.dirDeg).toBe((nearest * 7) % 360);
  });

  it('draws the 2% line: at the boundary it fills, one past it the whole call is null', async () => {
    const allowed = Math.floor(N * 0.02);
    const holes = (n: number) => new Set(Array.from({ length: n }, (_, i) => i * 3));

    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse(fullBatch(holes(allowed)))) as unknown as typeof fetch;
    expect(await fetchWorldFlow()).not.toBeNull();

    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse(fullBatch(holes(allowed + 1)))) as unknown as typeof fetch;
    expect(await fetchWorldFlow()).toBeNull();
  });

  it('treats a miscounted body as no response, and errors retry exactly once', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(okResponse(fullBatch().slice(0, N - 1))) as unknown as typeof fetch;
    expect(await fetchWorldFlow()).toBeNull();

    const spy = jest.fn().mockResolvedValue(errorResponse(500));
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchWorldFlow()).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

// ---- The per-region flow lattice ----------------------------------------------

describe('fetchRegionFlow', () => {
  const location = (i: number) => ({
    current: { wind_speed_10m: 4 + (i % 30) / 2, wind_direction_10m: (i * 11) % 360 },
  });
  const batch = (n: number) => Array.from({ length: n }, (_, i) => location(i));

  it('never fetches with the flag off', async () => {
    delete process.env.EXPO_PUBLIC_LIVE_WEATHER;
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchRegionFlow('uk')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sizes the lattice to the box: a snug box floors at 6×5, an ocean-sized one caps at 12×10', async () => {
    // uk: 10.73° × 6.9° → floors.
    let spy = jest.fn().mockResolvedValue(okResponse(batch(30)));
    global.fetch = spy as unknown as typeof fetch;
    const uk = await fetchRegionFlow('uk');
    expect(uk).not.toBeNull();
    expect(uk!.cols).toBe(6);
    expect(uk!.rows).toBe(5);
    expect(uk!.cells).toHaveLength(30);

    // usWest: 54.3° × 42.6° → caps.
    spy = jest.fn().mockResolvedValue(okResponse(batch(120)));
    global.fetch = spy as unknown as typeof fetch;
    const usWest = await fetchRegionFlow('usWest');
    expect(usWest!.cols).toBe(12);
    expect(usWest!.rows).toBe(10);
    expect(usWest!.cells).toHaveLength(120);
  });

  it('spans the whole box, north row first, on the same sea-cell discipline', async () => {
    const spy = jest.fn().mockResolvedValue(okResponse(batch(30)));
    global.fetch = spy as unknown as typeof fetch;
    const flow = await fetchRegionFlow('uk');

    const url = String(spy.mock.calls[0][0]);
    expect(url).toContain('cell_selection=sea');
    expect(url).toContain(`models=${WEATHER_MODEL}`);
    expect(url).toContain('wind_speed_unit=kn');
    expect(url.match(/latitude=([-0-9.,]+)/)![1].split(',')).toHaveLength(30);

    // Endpoints inclusive: corners of REGION_BOUNDS.uk, first cell the NW one.
    expect(flow!.cells[0].lat).toBeCloseTo(53.48, 6);
    expect(flow!.cells[0].lon).toBeCloseTo(-10.67, 6);
    const last = flow!.cells[flow!.cells.length - 1];
    expect(last.lat).toBeCloseTo(46.58, 6);
    expect(last.lon).toBeCloseTo(0.06, 6);
    // Samples land in fetch order.
    expect(flow!.cells[7].speedKn).toBe(4 + (7 % 30) / 2);
    expect(flow!.cells[7].dirDeg).toBe((7 * 11) % 360);
  });

  it('is all-or-nothing: one missing point and the region has no live field', async () => {
    const partial = batch(30);
    partial[13] = { current: {} } as ReturnType<typeof location>;
    global.fetch = jest.fn().mockResolvedValue(okResponse(partial)) as unknown as typeof fetch;
    expect(await fetchRegionFlow('uk')).toBeNull();
  });

  it('returns null on an HTTP error (after the one retry)', async () => {
    const spy = jest.fn().mockResolvedValue(errorResponse(503));
    global.fetch = spy as unknown as typeof fetch;
    expect(await fetchRegionFlow('uk')).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('the live-claim clocks', () => {
  it('refresh at 15 minutes, demote at 60 — one shared boundary each', () => {
    expect(LIVE_REFRESH_MS).toBe(15 * 60_000);
    expect(STALE_DEMOTE_MS).toBe(60 * 60_000);
    expect(STALE_DEMOTE_MS).toBeGreaterThan(LIVE_REFRESH_MS);
  });
});
