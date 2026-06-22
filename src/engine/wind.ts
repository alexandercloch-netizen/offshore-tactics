import { HazardKey, Race, WeatherCondition, WindField, WindSample } from '../types';
import { WEATHER } from '../data/weather';
import { CourseBounds, haversineNm, movePoint } from './geo';
import { rnd, rndRange } from './rng';

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;
const jitter = (center: number, spread: number): number =>
  center + rndRange(-spread, spread);

// Per-hazard character of the wind field.
interface HazardProfile {
  speedMul: number;
  shiftAmp: number; // degrees
  rotatePerH: number; // systematic veer/back
  featureDeltaMul: number; // x baseSpeed; negative = hole, positive = more wind
  featureRadiusNm: number;
}

function hazardProfile(hazard: HazardKey, baseSpeed: number): HazardProfile {
  switch (hazard) {
    case 'light_air':
    case 'doldrums':
      return { speedMul: 0.65, shiftAmp: 22, rotatePerH: 0.4, featureDeltaMul: -0.55, featureRadiusNm: 90 };
    case 'med_fickle':
    case 'tidal_gate':
      return { speedMul: 0.9, shiftAmp: 34, rotatePerH: 0.6, featureDeltaMul: -0.3, featureRadiusNm: 45 };
    case 'tidal_rapids':
      // Inside-passage sailing: light and fickle, tide-dominated, sheltered.
      return { speedMul: 0.8, shiftAmp: 30, rotatePerH: 0.7, featureDeltaMul: -0.35, featureRadiusNm: 40 };
    case 'island_accel':
      return { speedMul: 1.0, shiftAmp: 14, rotatePerH: 0.3, featureDeltaMul: 0.5, featureRadiusNm: 22 };
    case 'gulf_stream':
      return { speedMul: 1.0, shiftAmp: 18, rotatePerH: 0.8, featureDeltaMul: 0.35, featureRadiusNm: 70 };
    case 'celtic_weather':
    case 'bass_strait':
      return { speedMul: 1.15, shiftAmp: 20, rotatePerH: 2.2, featureDeltaMul: 0.6, featureRadiusNm: 80 };
    default:
      return { speedMul: 1.0, shiftAmp: 18, rotatePerH: 0.5, featureDeltaMul: 0.2, featureRadiusNm: 50 };
  }
}

function courseCentre(race: Race): { lat: number; lon: number } {
  const wps = race.waypoints;
  const lat = wps.reduce((s, w) => s + w.lat, 0) / wps.length;
  const lon = wps.reduce((s, w) => s + w.lon, 0) / wps.length;
  return { lat, lon };
}

// Build a fresh, seeded wind field for a race from its prevailing wind + hazard.
export function createWindField(race: Race): WindField {
  const profile = hazardProfile(race.hazard, race.prevailingWind.speedKn);
  const baseSpeed = Math.max(3, race.prevailingWind.speedKn * profile.speedMul * jitter(1, 0.12));
  const centre = courseCentre(race);

  // Place the feature off to one side of the course so favouring a side matters.
  const featureBearing = rndRange(0, 360);
  const featurePos = movePoint(centre.lat, centre.lon, featureBearing, rndRange(20, 70));

  return {
    baseDir: norm360(jitter(race.prevailingWind.fromDeg, 15)),
    baseSpeed,
    shiftAmpDeg: profile.shiftAmp * jitter(1, 0.2),
    shiftPeriodH: rndRange(3, 8),
    shiftPhase: rndRange(0, Math.PI * 2),
    rotateDegPerH: profile.rotatePerH * (rnd() < 0.5 ? -1 : 1),
    gradientAxisDeg: rndRange(0, 360),
    gradientPerNm: rndRange(0.01, 0.05) * (rnd() < 0.5 ? -1 : 1),
    refLat: centre.lat,
    refLon: centre.lon,
    feature: {
      lat: featurePos.lat,
      lon: featurePos.lon,
      radiusNm: profile.featureRadiusNm * jitter(1, 0.2),
      deltaKn: baseSpeed * profile.featureDeltaMul,
      driftDir: rndRange(0, 360),
      driftKn: rndRange(2, 9),
    },
  };
}

// Sample the wind (direction FROM, speed) at a position and time.
export function sampleWind(field: WindField, lat: number, lon: number, hours: number): WindSample {
  // Spatial gradient: component of the offset from the reference along the axis.
  const north = (lat - field.refLat) * 60;
  const east = (lon - field.refLon) * 60 * Math.cos(toRad(field.refLat));
  const axis = toRad(field.gradientAxisDeg);
  const along = north * Math.cos(axis) + east * Math.sin(axis); // nm along axis

  // Drifting puff/hole.
  const featPos = movePoint(field.feature.lat, field.feature.lon, field.feature.driftDir, field.feature.driftKn * hours);
  const d = haversineNm(lat, lon, featPos.lat, featPos.lon);
  const featTerm = field.feature.deltaKn * Math.exp(-((d / field.feature.radiusNm) ** 2));

  const dir =
    field.baseDir +
    field.rotateDegPerH * hours +
    field.shiftAmpDeg * Math.sin((2 * Math.PI * hours) / field.shiftPeriodH + field.shiftPhase) +
    along * 0.02;

  const speed = field.baseSpeed + field.gradientPerNm * along + featTerm;

  return { fromDeg: norm360(dir), speedKn: Math.max(2, Math.min(50, speed)) };
}

// A wind sample at a position, for drawing the field on the chart.
export interface WindArrow {
  lat: number;
  lon: number;
  fromDeg: number;
  speedKn: number;
}

// Sample the wind field on a regular lat/lon grid spanning the given bounds, so
// the chart can show the weather (direction & strength) across the course and
// how it varies — the puffs, holes and gradient the router is playing.
export function sampleWindGrid(
  field: WindField,
  bounds: CourseBounds,
  cols: number,
  rows: number,
  hours: number
): WindArrow[] {
  const arrows: WindArrow[] = [];
  const latStep = rows > 1 ? (bounds.maxLat - bounds.minLat) / (rows - 1) : 0;
  const lonStep = cols > 1 ? (bounds.maxLon - bounds.minLon) / (cols - 1) : 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lat = bounds.minLat + latStep * r;
      const lon = bounds.minLon + lonStep * c;
      const s = sampleWind(field, lat, lon, hours);
      arrows.push({ lat, lon, fromDeg: s.fromDeg, speedKn: s.speedKn });
    }
  }
  return arrows;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export interface PressureHint {
  bearing: number; // direction toward stronger wind
  compass: string;
  strong: boolean; // whether the gradient is pronounced enough to chase
}

// Where is the breeze building? Combines the field's speed gradient with the
// pull toward a nearby puff (or away from a hole), to hint which side to bank.
export function pressureHint(field: WindField, lat: number, lon: number, hours: number): PressureHint {
  // Gradient contribution (a unit vector along the +speed axis).
  const ga = toRad(field.gradientAxisDeg);
  let east = Math.sin(ga) * Math.sign(field.gradientPerNm) * Math.abs(field.gradientPerNm) * 100;
  let north = Math.cos(ga) * Math.sign(field.gradientPerNm) * Math.abs(field.gradientPerNm) * 100;

  // Feature contribution: toward a puff, away from a hole.
  const featPos = movePoint(field.feature.lat, field.feature.lon, field.feature.driftDir, field.feature.driftKn * hours);
  const dNorth = (featPos.lat - lat) * 60;
  const dEast = (featPos.lon - lon) * 60 * Math.cos(toRad(lat));
  const dist = Math.hypot(dNorth, dEast) || 1;
  const pull = (field.feature.deltaKn / Math.max(dist, 10)) * 30;
  north += (dNorth / dist) * pull;
  east += (dEast / dist) * pull;

  const magnitude = Math.hypot(north, east);
  const bearing = (Math.atan2(east, north) * 180) / Math.PI;
  const norm = ((bearing % 360) + 360) % 360;
  return {
    bearing: norm,
    compass: COMPASS[Math.round(norm / 45) % 8],
    strong: magnitude > 1.2,
  };
}

export interface WindFeatureState {
  lat: number; // current centre (drifted to `hours`)
  lon: number;
  radiusNm: number;
  puff: boolean; // true = more breeze, false = a hole
  deltaKn: number;
}

// The wind field's drifting puff/hole at a given time — its centre moves with
// the drift, so the chart can draw where the pressure system is right now.
export function featureState(field: WindField, hours: number): WindFeatureState {
  const f = field.feature;
  const pos = movePoint(f.lat, f.lon, f.driftDir, f.driftKn * hours);
  return {
    lat: pos.lat,
    lon: pos.lon,
    radiusNm: f.radiusNm,
    puff: f.deltaKn > 0,
    deltaKn: f.deltaKn,
  };
}

export interface WeatherOutlook {
  nowKn: number;
  soonKn: number;
  peakKn: number;
  trend: 'building' | 'easing' | 'steady';
  warn: boolean; // worth flagging prominently to the player
  headline: string; // short banner text, e.g. "Gale building"
  lookaheadH: number;
}

// Wind strength descriptor for a speed, matching the WEATHER bands.
function strengthWord(kn: number): string {
  if (kn >= 34) return 'Gale';
  if (kn >= 26) return 'Strong winds';
  if (kn >= 20) return 'Fresh breeze';
  if (kn >= 11) return 'Steady breeze';
  if (kn >= 6) return 'Light airs';
  return 'Calm';
}

// What the weather is about to do at the boat: compares the wind now with the
// field a few hours ahead (the field veers/backs, rotates and drifts its
// puff/hole over time), so the UI can warn of building breeze on the horizon
// before it arrives. Flags a warning when it's building into fresh+ or it's
// already strong.
export function weatherOutlook(
  field: WindField,
  lat: number,
  lon: number,
  hours: number,
  lookaheadH = 2
): WeatherOutlook {
  const nowKn = sampleWind(field, lat, lon, hours).speedKn;
  const soonKn = sampleWind(field, lat, lon, hours + lookaheadH).speedKn;
  const peakKn = Math.max(nowKn, soonKn);
  const delta = soonKn - nowKn;
  const trend: WeatherOutlook['trend'] =
    delta > 3 ? 'building' : delta < -3 ? 'easing' : 'steady';
  const warn = (trend === 'building' && peakKn >= 20) || peakKn >= 28;
  const headline =
    trend === 'building'
      ? `${strengthWord(peakKn)} building`
      : trend === 'easing'
        ? 'Wind easing'
        : strengthWord(nowKn);
  return { nowKn, soonKn, peakKn, trend, warn, headline, lookaheadH };
}

// Map a wind sample onto the nearest descriptive WeatherCondition (for the
// compass, wear and decision risk), keeping the field's exact local direction.
export function weatherFromWind(sample: WindSample): WeatherCondition {
  let best = WEATHER[0];
  let bestDiff = Infinity;
  for (const w of WEATHER) {
    const diff = Math.abs(w.windSpeedKts - sample.speedKn);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = w;
    }
  }
  return {
    ...best,
    windDirection: Math.round(sample.fromDeg),
    windSpeedKts: Math.round(sample.speedKn),
  };
}
