import { BoatCondition, InstrumentReading, PointOfSail, RaceProgress } from '../types';
import { WeatherOutlook } from './wind';

// A briefing of the boat's instruments for a tactical decision: the readings
// right now, and how they've trended since the last decision (the "leg"), so the
// player can judge whether their effort and side are paying — and how much risk
// to take — before committing.
export interface InstrumentReport {
  now: {
    speedKn: number;
    windDir: number;
    windSpeedKn: number;
    pointOfSail: PointOfSail;
    position: number;
    fleetSize: number;
    hull: number;
    stamina: number;
    morale: number;
    distanceToGoNm: number;
  };
  leg: {
    nm: number; // miles sailed since the last decision
    hours: number; // time since the last decision
    avgSpeedKn: number;
    windShiftDeg: number; // +veered (clockwise) / -backed since the last decision
    windDeltaKn: number; // + building / - easing
    placesGained: number; // + moved up the fleet / - dropped back
    sampleCount: number;
  };
  windSeries: number[]; // wind speed over the leg, for a sparkline
  speedSeries: number[]; // boat speed over the leg, for a sparkline
  outlook: WeatherOutlook;
}

// Signed shift in degrees, folded to -180..180 (+ = veer, - = back).
function signedShift(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

export function buildInstrumentReport(
  progress: RaceProgress,
  condition: BoatCondition,
  fleetSize: number,
  outlook: WeatherOutlook
): InstrumentReport {
  const all = progress.readings ?? [];
  // The current leg: everything sailed since the last decision. Fall back to all
  // readings (or none) if the leg slice is empty.
  const legReadings = all.filter((r) => r.atNm >= progress.legStartNm);
  const leg = legReadings.length > 0 ? legReadings : all;
  const last = leg[leg.length - 1];
  const first = leg[0];

  const now = {
    speedKn: last?.speedKn ?? 0,
    windDir: progress.windDir,
    windSpeedKn: progress.windSpeedKn,
    pointOfSail: progress.pointOfSail,
    position: progress.position,
    fleetSize,
    hull: condition.hullIntegrity,
    stamina: condition.crewStamina,
    morale: condition.crewMorale,
    distanceToGoNm: Math.max(progress.totalDistanceNm - progress.distanceCoveredNm, 0),
  };

  const legNm = first && last ? Math.max(last.atNm - first.atNm, 0) : 0;
  const legHours = first && last ? Math.max(last.hours - first.hours, 0) : 0;

  return {
    now,
    leg: {
      nm: legNm,
      hours: legHours,
      avgSpeedKn: legHours > 0 ? legNm / legHours : now.speedKn,
      windShiftDeg: first && last ? signedShift(first.windDir, last.windDir) : 0,
      windDeltaKn: first && last ? last.windSpeedKn - first.windSpeedKn : 0,
      placesGained: first && last ? first.position - last.position : 0,
      sampleCount: leg.length,
    },
    windSeries: leg.map((r) => r.windSpeedKn),
    speedSeries: leg.map((r) => r.speedKn),
    outlook,
  };
}
