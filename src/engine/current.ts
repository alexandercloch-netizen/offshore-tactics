import { CurrentSample, Race, TidalField, TideGate } from '../types';
import { angularDelta, courseBounds, haversineNm } from './geo';
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
  if (!tide || tide.peakRateKn <= 0) {
    return { floodDeg: 0, peakRateKn: 0, periodH: SEMI_DIURNAL_H, phaseH: 0, gates: [], refLat, refLon };
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
  return { floodDeg: tide.floodDeg, peakRateKn: tide.peakRateKn, periodH, phaseH, gates, refLat, refLon };
}

// The tidal stream at a point and time: a sinusoidal flood/ebb (flooding toward
// `floodDeg`, ebbing back the other way), amplified near any tide gate the point
// falls within. Pure and deterministic.
export function sampleCurrent(field: TidalField, lat: number, lon: number, hours: number): CurrentSample {
  if (field.peakRateKn <= 0) return { setDeg: field.floodDeg, rateKn: 0 };
  const cycle = Math.sin((2 * Math.PI * (hours + field.phaseH)) / field.periodH);
  let rate = field.peakRateKn * cycle;
  let setDeg = field.floodDeg;
  if (rate < 0) {
    rate = -rate;
    setDeg = (field.floodDeg + 180) % 360; // ebb sets the opposite way
  }
  let gain = 1;
  for (const g of field.gates) {
    const d = haversineNm(lat, lon, g.lat, g.lon);
    if (d < g.radiusNm) gain += g.gain * (1 - d / g.radiusNm);
  }
  return { setDeg, rateKn: rate * gain };
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
  if (!field || field.peakRateKn <= 0) return 0;
  return currentAlong(sampleCurrent(field, lat, lon, hours), courseDeg);
}
