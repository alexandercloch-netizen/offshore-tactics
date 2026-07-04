import { WeatherScenario } from '../../types';

// Hand-authored scenario fixtures for the engine tests: a building gale, a
// glassy drifter and a classic frontal veer, all sited on the Fastnet's waters
// so they exercise a real course. Committed so CI never touches the network.

const hours = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

const point = (
  fromDeg: number[],
  speedKn: number[],
  gustKn?: number[]
): WeatherScenario['points'][number] => ({
  lat: 50.33,
  lon: -3.3,
  hours,
  fromDeg,
  speedKn,
  ...(gustKn ? { gustKn } : {}),
});

const base = {
  kind: 'live' as const,
  raceId: 'race-fastnet',
  model: 'ecmwf_ifs025',
  issuedAt: '2026-07-04T06:00:00.000Z',
  fieldVersion: 1,
};

// A sou'wester building from a working breeze to a full gale.
export const GALE_SCENARIO: WeatherScenario = {
  ...base,
  label: 'Fixture gale',
  points: [
    point(
      [225, 228, 230, 233, 235, 238, 240, 242, 244, 245, 246, 247, 248],
      [15, 18, 21, 25, 28, 32, 36, 39, 42, 44, 45, 45, 44],
      [22, 26, 30, 35, 40, 45, 50, 54, 58, 60, 61, 61, 60]
    ),
  ],
};

// A high sat over the course: light, patchy, going nowhere in a hurry.
export const DRIFTER_SCENARIO: WeatherScenario = {
  ...base,
  label: 'Fixture drifter',
  points: [
    point(
      [80, 85, 95, 100, 110, 105, 95, 90, 85, 80, 75, 80, 85],
      [5, 4, 4, 3, 4, 5, 6, 5, 4, 4, 5, 5, 6],
      [7, 6, 6, 5, 6, 7, 8, 7, 6, 6, 7, 7, 8]
    ),
  ],
};

// A cold front: southerly ahead of the line, a hard 120° veer into a fresh
// nor'wester behind it — the real temporal structure a scenario must carry.
export const FRONTAL_VEER_SCENARIO: WeatherScenario = {
  ...base,
  label: 'Fixture frontal veer',
  points: [
    point(
      [180, 182, 185, 190, 210, 250, 285, 295, 300, 300, 300, 300, 300],
      [16, 17, 18, 20, 22, 18, 20, 22, 22, 21, 20, 20, 19]
    ),
  ],
};

// Two points 120 nm apart with a hard speed contrast, for the spatial blend.
export const TWO_POINT_SCENARIO: WeatherScenario = {
  ...base,
  label: 'Fixture gradient',
  points: [
    { lat: 50.0, lon: -3.0, hours, fromDeg: hours.map(() => 225), speedKn: hours.map(() => 8) },
    { lat: 51.0, lon: -5.5, hours, fromDeg: hours.map(() => 250), speedKn: hours.map(() => 24) },
  ],
};
