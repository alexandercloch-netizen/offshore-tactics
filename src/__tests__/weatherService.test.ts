import {
  fetchCourseSnapshot,
  liveWeatherEnabled,
  scenarioStamp,
  scenarioTagLine,
  SCENARIO_FIELD_VERSION,
  WEATHER_MODEL,
} from '../services/weather';
import { getRaceById } from '../data';
import { WeatherScenario } from '../types';
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
