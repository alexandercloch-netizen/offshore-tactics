import { WeatherCondition } from '../types';

export const WEATHER: WeatherCondition[] = [
  {
    id: 'wx-calm',
    label: 'Glassy Calm',
    windStrength: 'Calm',
    windSpeedKts: 3,
    windDirection: 0,
    description: 'Barely a ripple. The fleet drifts and patience is everything.',
    speedModifier: 0.45,
    riskModifier: 0.0,
  },
  {
    id: 'wx-light',
    label: 'Light Airs',
    windStrength: 'Light',
    windSpeedKts: 8,
    windDirection: 45,
    description: 'A gentle breeze fills in. Keep the boat moving and stay in the pressure.',
    speedModifier: 0.7,
    riskModifier: 0.02,
  },
  {
    id: 'wx-moderate',
    label: 'Steady Breeze',
    windStrength: 'Moderate',
    windSpeedKts: 14,
    windDirection: 90,
    description: 'Champagne sailing. The boat is in the groove and trucking along.',
    speedModifier: 1.0,
    riskModifier: 0.05,
  },
  {
    id: 'wx-fresh',
    label: 'Fresh Breeze',
    windStrength: 'Fresh',
    windSpeedKts: 22,
    windDirection: 135,
    description: 'Powered up and exhilarating. Time to hold on and trust the crew.',
    speedModifier: 1.15,
    riskModifier: 0.12,
  },
  {
    id: 'wx-strong',
    label: 'Strong Winds',
    windStrength: 'Strong',
    windSpeedKts: 30,
    windDirection: 200,
    description: 'White water everywhere. Fast but punishing on boat and crew.',
    speedModifier: 1.05,
    riskModifier: 0.24,
  },
  {
    id: 'wx-gale',
    label: 'Gale',
    windStrength: 'Gale',
    windSpeedKts: 42,
    windDirection: 250,
    description: 'Survival conditions. Reef deep, stay safe and pray for the dawn.',
    speedModifier: 0.8,
    riskModifier: 0.4,
  },
];

// Rough likelihood weighting so heavy weather is the exception, not the rule.
const WEATHER_WEIGHTS: Record<string, number> = {
  'wx-calm': 1,
  'wx-light': 3,
  'wx-moderate': 4,
  'wx-fresh': 3,
  'wx-strong': 2,
  'wx-gale': 1,
};

export function pickWeather(): WeatherCondition {
  const pool: WeatherCondition[] = [];
  WEATHER.forEach((w) => {
    const weight = WEATHER_WEIGHTS[w.id] ?? 1;
    for (let i = 0; i < weight; i += 1) {
      pool.push(w);
    }
  });
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}
