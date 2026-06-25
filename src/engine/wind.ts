import { HazardKey, Race, WeatherCondition, WindFeature, WindField, WindSample } from '../types';
import { WEATHER } from '../data/weather';
import { WEATHER_CLIMATOLOGY } from '../data/weatherClimatology';
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

// Build a fresh, seeded wind field for a race. The realistic seasonal baseline
// comes from the baked climatology (see data/weatherClimatology.ts) when present,
// else the race's prevailing wind; the hazard then shapes the variability.
export function createWindField(race: Race): WindField {
  const climate = WEATHER_CLIMATOLOGY[race.id];
  const baseDirSrc = climate ? climate.fromDeg : race.prevailingWind.fromDeg;
  const baseSpeedSrc = climate ? climate.speedKn : race.prevailingWind.speedKn;
  // Directional spread and gustiness from the climatology scale the field's
  // oscillating shift and its day/night swing (neutral when there's no entry).
  // A real *monthly* circular spread is naturally wide (~50°), so 50° is the
  // neutral point and the band is gentle — otherwise every course saturates the
  // ceiling and the swings whip the route onto land on the tightest passages.
  const variabilityMul = climate ? Math.max(0.7, Math.min(1.3, climate.variabilityDeg / 50)) : 1;
  const gustMul = climate ? 1 + Math.max(0, Math.min(0.6, climate.gustFactor)) : 1;

  const profile = hazardProfile(race.hazard, baseSpeedSrc);
  const baseSpeed = Math.max(3, baseSpeedSrc * profile.speedMul * jitter(1, 0.12));
  const centre = courseCentre(race);

  // A handful of drifting pressure systems, not just one: the headline feature
  // (the hazard's signature puff/hole, off to one side so favouring a side
  // matters) plus a few smaller, mixed puffs and holes for a textured field.
  const headlineBearing = rndRange(0, 360);
  const headlinePos = movePoint(centre.lat, centre.lon, headlineBearing, rndRange(20, 70));
  const headline: WindFeature = {
    lat: headlinePos.lat,
    lon: headlinePos.lon,
    radiusNm: profile.featureRadiusNm * jitter(1, 0.2),
    deltaKn: baseSpeed * profile.featureDeltaMul,
    driftDir: rndRange(0, 360),
    driftKn: rndRange(2, 9),
  };
  const features: WindFeature[] = [headline];
  const extras = 1 + Math.floor(rnd() * 3); // 1–3 more systems
  for (let i = 0; i < extras; i += 1) {
    const pos = movePoint(centre.lat, centre.lon, rndRange(0, 360), rndRange(15, 80));
    features.push({
      lat: pos.lat,
      lon: pos.lon,
      radiusNm: rndRange(20, 55) * jitter(1, 0.2),
      deltaKn: baseSpeed * rndRange(-0.4, 0.4),
      driftDir: rndRange(0, 360),
      driftKn: rndRange(2, 9),
    });
  }

  // A travelling front sweeping the course — fronts veer/build harder where the
  // hazard already implies frontal weather (high rotatePerH).
  const frontStrength = 0.6 + profile.rotatePerH * 0.4;

  return {
    baseDir: norm360(jitter(baseDirSrc, 15)),
    baseSpeed,
    shiftAmpDeg: profile.shiftAmp * jitter(1, 0.2) * variabilityMul,
    shiftPeriodH: rndRange(3, 8),
    shiftPhase: rndRange(0, Math.PI * 2),
    rotateDegPerH: profile.rotatePerH * (rnd() < 0.5 ? -1 : 1),
    gradientAxisDeg: rndRange(0, 360),
    gradientPerNm: rndRange(0.01, 0.05) * (rnd() < 0.5 ? -1 : 1),
    refLat: centre.lat,
    refLon: centre.lon,
    feature: headline,
    features,
    front: {
      bearing: rndRange(0, 360),
      posNmAt0: rndRange(-60, 60),
      speedKn: rndRange(8, 22),
      widthNm: rndRange(15, 40),
      dirShiftDeg: rndRange(12, 35) * (rnd() < 0.5 ? -1 : 1) * frontStrength,
      speedDeltaKn: rndRange(2, 7) * (rnd() < 0.5 ? -1 : 1) * frontStrength,
    },
    diurnalAmpKn: baseSpeed * rndRange(0.06, 0.16) * gustMul,
    diurnalPhaseH: rndRange(0, 24),
    texture: {
      ampKn: baseSpeed * rndRange(0.04, 0.1) * gustMul,
      scaleANm: rndRange(12, 30),
      scaleBNm: rndRange(12, 30),
      phaseA: rndRange(0, Math.PI * 2),
      phaseB: rndRange(0, Math.PI * 2),
      dirDeg: rndRange(0, 360),
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

  // Drifting puffs/holes — sum every system (fall back to the headline feature
  // for hand-built fields that don't carry the full list).
  const feats = field.features ?? [field.feature];
  let featTerm = 0;
  for (const f of feats) {
    const fp = movePoint(f.lat, f.lon, f.driftDir, f.driftKn * hours);
    const fd = haversineNm(lat, lon, fp.lat, fp.lon);
    featTerm += f.deltaKn * Math.exp(-((fd / f.radiusNm) ** 2));
  }

  // Travelling front: the wind veers/builds as the line sweeps past. `t` runs
  // -1 (well pre-frontal) → +1 (post-frontal) across the transition width.
  let frontDir = 0;
  let frontSpeed = 0;
  if (field.front) {
    const fb = toRad(field.front.bearing);
    const s = north * Math.cos(fb) + east * Math.sin(fb); // nm along the front normal
    const linePos = field.front.posNmAt0 + field.front.speedKn * hours;
    const t = Math.tanh((s - linePos) / Math.max(field.front.widthNm, 1));
    frontDir = field.front.dirShiftDeg * 0.5 * t;
    frontSpeed = field.front.speedDeltaKn * 0.5 * t;
  }

  // Day/night swing and fine spatial texture.
  const diurnal = field.diurnalAmpKn
    ? field.diurnalAmpKn * Math.sin((2 * Math.PI * (hours + (field.diurnalPhaseH ?? 0))) / 24)
    : 0;
  let texture = 0;
  if (field.texture) {
    const td = toRad(field.texture.dirDeg);
    const u = north * Math.cos(td) + east * Math.sin(td);
    const v = -north * Math.sin(td) + east * Math.cos(td);
    texture =
      field.texture.ampKn *
      Math.sin((2 * Math.PI * u) / field.texture.scaleANm + field.texture.phaseA) *
      Math.cos((2 * Math.PI * v) / field.texture.scaleBNm + field.texture.phaseB);
  }

  const dir =
    field.baseDir +
    field.rotateDegPerH * hours +
    field.shiftAmpDeg * Math.sin((2 * Math.PI * hours) / field.shiftPeriodH + field.shiftPhase) +
    along * 0.02 +
    frontDir;

  const speed = field.baseSpeed + field.gradientPerNm * along + featTerm + frontSpeed + diurnal + texture;

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

// ---- Forecast model ----
//
// A real forecast is certain *now* and grows fuzzier the further ahead you look;
// a skilled Navigator extends the horizon you can trust. We model the *displayed*
// forecast as the true field plus a smooth, deterministic error that grows with
// the lookahead and shrinks with confidence. The race still sails the TRUE field
// (so it stays fair and deterministic) — the forecast is only what the crew
// believes, so a better Navigator sees closer to the truth and plans better.

const FORECAST_TAU0 = 15; // base e-folding horizon (hours) before confidence falls
const FORECAST_DIR_ERR = 42; // max directional error (deg) at zero confidence
const FORECAST_SPD_ERR = 0.45; // max speed error (fraction) at zero confidence

// Confidence in the forecast `hours` ahead, 0–1. 1.0 now; decays with horizon,
// and a sharper Navigator (higher skill) decays slower — trusting it for longer.
export function forecastConfidence(navSkill: number, hours: number): number {
  const s = Math.max(0, Math.min(100, navSkill)) / 100;
  const tau = FORECAST_TAU0 * (0.6 + 1.1 * s);
  return Math.max(0.05, Math.min(1, Math.exp(-Math.max(0, hours) / tau)));
}

// Smooth, deterministic pseudo-noise in [-1,1] over space and (slowly) time, so
// the forecast error looks like a plausible-but-wrong field, not random speckle.
function forecastNoise(lat: number, lon: number, hours: number, salt: number): number {
  const a = Math.sin(lat * 0.83 + lon * 0.37 + hours * 0.11 + salt * 1.7);
  const b = Math.cos(lon * 0.61 - lat * 0.29 - hours * 0.08 + salt * 2.3);
  const c = Math.sin((lat + lon) * 0.45 + hours * 0.05 + salt * 0.9);
  return Math.max(-1, Math.min(1, (a + b + c) / 2.2));
}

// The wind as the crew's forecast shows it: the truth, blurred by an error that
// grows with the lookahead and shrinks with the Navigator's confidence.
export function sampleForecast(
  field: WindField,
  lat: number,
  lon: number,
  hours: number,
  navSkill: number
): WindSample {
  const truth = sampleWind(field, lat, lon, hours);
  const err = 1 - forecastConfidence(navSkill, hours);
  if (err <= 0) return truth;
  const dir = truth.fromDeg + FORECAST_DIR_ERR * err * forecastNoise(lat, lon, hours, 1);
  const speed = truth.speedKn * (1 + FORECAST_SPD_ERR * err * forecastNoise(lat, lon, hours, 2));
  return { fromDeg: norm360(dir), speedKn: Math.max(2, Math.min(50, speed)) };
}

// Forecast field on a grid (the chart's heatmap/arrows), mirroring sampleWindGrid.
export function sampleForecastGrid(
  field: WindField,
  bounds: CourseBounds,
  cols: number,
  rows: number,
  hours: number,
  navSkill: number
): WindArrow[] {
  const arrows: WindArrow[] = [];
  const latStep = rows > 1 ? (bounds.maxLat - bounds.minLat) / (rows - 1) : 0;
  const lonStep = cols > 1 ? (bounds.maxLon - bounds.minLon) / (cols - 1) : 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lat = bounds.minLat + latStep * r;
      const lon = bounds.minLon + lonStep * c;
      const s = sampleForecast(field, lat, lon, hours, navSkill);
      arrows.push({ lat, lon, fromDeg: s.fromDeg, speedKn: s.speedKn });
    }
  }
  return arrows;
}


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
  const norm = norm360(bearing);
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
