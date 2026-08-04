import { BoatCondition, InstrumentReading, PointOfSail, RaceProgress } from '../types';
import { WeatherOutlook } from './wind';

// A briefing of the boat's instruments for a tactical decision: the readings
// right now, and how they've trended since the last decision (the "leg"), so the
// player can judge whether their effort and side are paying — and how much risk
// to take — before committing.
// Scalars the report needs `state` to derive (polar target, VMC, the tidal
// stream, the flown sail): the CALL SITE computes them and passes them in, so
// this module stays a pure projection of plain data. All optional — the guest
// and no-field paths simply leave them undefined and the report renders
// without them.
export interface InstrumentExtras {
  targetKn?: number; // polarTargetSpeed(state) — the perfectly-sailed speed here
  vmcKn?: number; // speedMadeGood(state) — speed made good toward the mark
  tide?: { rateKn: number; along: number } | null; // tideRead(state); null = slack
  activeSail?: {
    id?: string; // specialist id; undefined = the working set
    name: string;
    isWorking: boolean;
    coverage: number; // fit to the moment (working set always 1)
    changes: number; // the ⇄N counter
    fumbled: number;
  };
}

export interface InstrumentReport {
  now: {
    speedKn: number;
    windDir: number;
    windSpeedKn: number;
    // Signed true wind angle, folded to ±180: positive = wind over the
    // starboard side, negative = port. Unsigned TWA is tack-blind — the band
    // shows "52°S", not just "52°".
    twaDeg: number;
    // Signed shift of the CURRENT wind against the leg's rolling mean: + veered
    // (a lift on port, a header on starboard), - backed. The number a tactician
    // actually steers by; undefined until the mean has settled.
    shiftDeg?: number;
    pointOfSail: PointOfSail;
    position: number;
    fleetSize: number;
    hull: number;
    stamina: number;
    morale: number;
    distanceToGoNm: number;
    targetKn?: number; // pass-through from InstrumentExtras
    polarPct?: number; // speed ÷ target, as a %
    vmcKn?: number;
    tide?: { rateKn: number; along: number };
    activeSail?: InstrumentExtras['activeSail'];
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
  outlook: WeatherOutlook,
  extras: InstrumentExtras = {}
): InstrumentReport {
  const all = progress.readings ?? [];
  // The current leg: everything sailed since the last decision. Fall back to all
  // readings (or none) if the leg slice is empty.
  const legReadings = all.filter((r) => r.atNm >= progress.legStartNm);
  const leg = legReadings.length > 0 ? legReadings : all;
  const last = leg[leg.length - 1];
  const first = leg[0];

  const speedKn = last?.speedKn ?? 0;
  const now = {
    speedKn,
    windDir: progress.windDir,
    windSpeedKn: progress.windSpeedKn,
    twaDeg: signedShift(progress.heading, progress.windDir),
    shiftDeg:
      progress.windMeanDir !== undefined
        ? signedShift(progress.windMeanDir, progress.windDir)
        : undefined,
    pointOfSail: progress.pointOfSail,
    position: progress.position,
    fleetSize,
    hull: condition.hullIntegrity,
    stamina: condition.crewStamina,
    morale: condition.crewMorale,
    distanceToGoNm: Math.max(progress.totalDistanceNm - progress.distanceCoveredNm, 0),
    targetKn: extras.targetKn,
    polarPct:
      extras.targetKn !== undefined && extras.targetKn > 0
        ? Math.round((speedKn / extras.targetKn) * 100)
        : undefined,
    vmcKn: extras.vmcKn,
    tide: extras.tide ? { rateKn: extras.tide.rateKn, along: extras.tide.along } : undefined,
    activeSail: extras.activeSail,
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
