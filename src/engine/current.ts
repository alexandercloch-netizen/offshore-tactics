import { CurrentArrow, CurrentSample, Race, TidalField, TideGate } from '../types';
import { angularDelta, courseBounds, CourseBounds, haversineNm } from './geo';
import { rndRange } from './rng';

// The standard semidiurnal tidal period (one flood + one ebb ≈ 12h25m).
const SEMI_DIURNAL_H = 12.42;

// Build the tidal field for a race from its authored `tide` profile. The stream
// oscillates flood↔ebb over the tidal period; a phase is seeded at setup so the
// gun fires at a different point in the cycle each time (deterministic under the
// RNG, like the wind field). No profile (or zero rate) → a slack field that
// leaves the race sailing exactly as before.
export function createTidalField(race: Race): TidalField {
  const bounds = courseBounds(race.waypoints);
  const refLat = (bounds.minLat + bounds.maxLat) / 2;
  const refLon = (bounds.minLon + bounds.maxLon) / 2;
  const tide = race.tide;
  const driftDeg = tide?.driftDeg ?? 0;
  const driftKn = tide?.driftKn ?? 0;
  // Slack only when there's neither an oscillating tide nor a steady current.
  if (!tide || (tide.peakRateKn <= 0 && driftKn <= 0)) {
    return {
      floodDeg: 0, peakRateKn: 0, periodH: SEMI_DIURNAL_H, phaseH: 0, gates: [],
      driftDeg: 0, driftKn: 0, refLat, refLon,
    };
  }
  const periodH = tide.periodH ?? SEMI_DIURNAL_H;
  // Where in the flood/ebb cycle the race starts — the single biggest tidal
  // variable in a real race (catch the fair tide or fight a foul one).
  const phaseH = rndRange(0, periodH);
  const gates: TideGate[] = (tide.gates ?? [])
    .map((g) => {
      const wp = race.waypoints.find((w) => w.name === g.waypoint);
      return wp ? { lat: wp.lat, lon: wp.lon, radiusNm: g.radiusNm, gain: g.gain } : null;
    })
    .filter((g): g is TideGate => g !== null);
  return {
    floodDeg: tide.floodDeg, peakRateKn: tide.peakRateKn, periodH, phaseH, gates,
    driftDeg, driftKn, refLat, refLon,
  };
}

// The tidal stream at a point and time: a sinusoidal flood/ebb (flooding toward
// `floodDeg`, ebbing back the other way), amplified near any tide gate the point
// falls within. Pure and deterministic.
export function sampleCurrent(field: TidalField, lat: number, lon: number, hours: number): CurrentSample {
  const driftKn = field.driftKn ?? 0;
  if (field.peakRateKn <= 0 && driftKn <= 0) return { setDeg: field.floodDeg, rateKn: 0 };

  // Gate amplification (a headland/channel/current-core that runs harder).
  let gain = 1;
  for (const g of field.gates) {
    const d = haversineNm(lat, lon, g.lat, g.lon);
    if (d < g.radiusNm) gain += g.gain * (1 - d / g.radiusNm);
  }

  // The oscillating tide as a vector (flood↔ebb over the period), gate-amplified.
  const cycle = Math.sin((2 * Math.PI * (hours + field.phaseH)) / field.periodH);
  const tideRate = field.peakRateKn * cycle * gain; // signed: + flood, - ebb
  const tideRad = (field.floodDeg * Math.PI) / 180;
  let vx = Math.sin(tideRad) * tideRate;
  let vy = Math.cos(tideRad) * tideRate;

  // The steady ocean current as a vector (never reverses), gate-amplified too —
  // a gate over a current core (the Gulf Stream axis) intensifies it.
  if (driftKn > 0) {
    const driftRad = ((field.driftDeg ?? 0) * Math.PI) / 180;
    vx += Math.sin(driftRad) * driftKn * gain;
    vy += Math.cos(driftRad) * driftKn * gain;
  }

  const rateKn = Math.hypot(vx, vy);
  if (rateKn < 1e-6) return { setDeg: field.floodDeg, rateKn: 0 };
  const setDeg = (Math.atan2(vx, vy) * 180) / Math.PI;
  return { setDeg: (setDeg + 360) % 360, rateKn };
}

// Signed component of the stream along a heading (kn): positive = a fair tide
// pushing you along your course, negative = a foul tide setting against you.
export function currentAlong(sample: CurrentSample, courseDeg: number): number {
  const delta = angularDelta(sample.setDeg, courseDeg); // 0..180
  return sample.rateKn * Math.cos((delta * Math.PI) / 180);
}

// Convenience: the fair/foul component of the field directly, in one call.
export function tideAlong(
  field: TidalField | undefined,
  lat: number,
  lon: number,
  hours: number,
  courseDeg: number
): number {
  if (!field || (field.peakRateKn <= 0 && (field.driftKn ?? 0) <= 0)) return 0;
  return currentAlong(sampleCurrent(field, lat, lon, hours), courseDeg);
}

// Sample the tidal stream on a *full* regular grid (row-major, no cells dropped),
// for the tide colour field and the flow animation — both index the grid by
// position, so every cell must be present even where the stream is slack.
export function sampleTideField(
  field: TidalField | undefined,
  bounds: CourseBounds,
  cols: number,
  rows: number,
  hours: number
): CurrentArrow[] {
  const arrows: CurrentArrow[] = [];
  const latStep = rows > 1 ? (bounds.maxLat - bounds.minLat) / (rows - 1) : 0;
  const lonStep = cols > 1 ? (bounds.maxLon - bounds.minLon) / (cols - 1) : 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lat = bounds.minLat + latStep * r;
      const lon = bounds.minLon + lonStep * c;
      const s = field ? sampleCurrent(field, lat, lon, hours) : { setDeg: 0, rateKn: 0 };
      arrows.push({ lat, lon, setDeg: s.setDeg, rateKn: s.rateKn });
    }
  }
  return arrows;
}

// Sample the tidal stream on a regular lat/lon grid spanning the given bounds, so
// the chart can draw current arrows across the course (rate & set, gates and all).
// Slack/near-slack cells are dropped so the chart isn't littered with stubs.
export function sampleCurrentGrid(
  field: TidalField | undefined,
  bounds: CourseBounds,
  cols: number,
  rows: number,
  hours: number
): CurrentArrow[] {
  if (!field || (field.peakRateKn <= 0 && (field.driftKn ?? 0) <= 0)) return [];
  const arrows: CurrentArrow[] = [];
  const latStep = rows > 1 ? (bounds.maxLat - bounds.minLat) / (rows - 1) : 0;
  const lonStep = cols > 1 ? (bounds.maxLon - bounds.minLon) / (cols - 1) : 0;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lat = bounds.minLat + latStep * r;
      const lon = bounds.minLon + lonStep * c;
      const s = sampleCurrent(field, lat, lon, hours);
      if (s.rateKn >= 0.15) arrows.push({ lat, lon, setDeg: s.setDeg, rateKn: s.rateKn });
    }
  }
  return arrows;
}
