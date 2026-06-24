import {
  GeoPoint,
  Race,
  RoutingBias,
  StartApproach,
  StartLineGeo,
  StartOutcome,
  StartPlan,
  StartRead,
  TidalField,
  WindField,
} from '../types';
import { bearing, movePoint } from './geo';
import { pressureHint, sampleWind } from './wind';
import { sampleCurrent, currentAlong } from './current';

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

// How long to draw the start line (nm). Geometry is schematic — only the bias
// sign is load-bearing — so this just sizes the chart.
const LINE_HALF_NM = 0.6;
// A wind shift of this many degrees off the expected line direction makes one
// end fully favoured.
const FULL_BIAS_SHIFT = 12;

// Signed wind shift, degrees: + veered (clockwise), − backed (anti-clockwise).
function signedShift(toDeg: number, fromDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

// The start line: the committee (RC) sets it square to the *expected* wind, so a
// shift on the day is what tips the bias. Committee boat is the starboard (right)
// end, the pin is to port (left).
export function startLineGeo(race: Race): StartLineGeo {
  const start = race.waypoints[0];
  const mark1 = race.waypoints[Math.min(1, race.waypoints.length - 1)];
  const firstLegBearing = bearing(start.lat, start.lon, mark1.lat, mark1.lon);
  const lineBearing = norm360(race.prevailingWind.fromDeg + 90); // square to the expected wind
  const committee: GeoPoint = movePoint(start.lat, start.lon, lineBearing, LINE_HALF_NM);
  const pin: GeoPoint = movePoint(start.lat, start.lon, norm360(lineBearing + 180), LINE_HALF_NM);
  return { committee, pin, lineBearing, firstLegBearing };
}

// Which side of the course the breeze favours off the line, signed [-1,1]
// (+ = the right of the first leg pays). Mirrors the fleet's read.
function favouredSideAt(field: WindField, lat: number, lon: number, axisDeg: number): number {
  const hint = pressureHint(field, lat, lon, 0);
  const rel = (((hint.bearing - axisDeg) % 360) + 540) % 360;
  const cross = Math.sin(((rel - 180) * Math.PI) / 180); // -1 left .. +1 right
  return cross * (hint.strong ? 1 : 0.5);
}

// The raw, true read of the start (resolution uses this; the UI hedges it by the
// Navigator's confidence). All sampled at the gun (elapsed 0).
function rawRead(race: Race, field: WindField, tide?: TidalField) {
  const line = startLineGeo(race);
  const start = race.waypoints[0];
  const wind = sampleWind(field, start.lat, start.lon, 0);

  // End bias: a veer favours the right (committee) end, a back the pin. Tide adds
  // a nudge — the up-tide end is the safer, favoured one.
  const shift = signedShift(wind.fromDeg, race.prevailingWind.fromDeg);
  let endBias = Math.max(-1, Math.min(1, shift / FULL_BIAS_SHIFT));
  const cur = sampleCurrent(tide ?? slack(), start.lat, start.lon, 0);
  const tideToCommittee = currentAlong(cur, line.lineBearing); // + sets toward committee
  endBias = Math.max(-1, Math.min(1, endBias - tideToCommittee * 0.15)); // down-tide end is worse

  // OCS risk for a full send: a tide setting over the line (toward the wind, i.e.
  // upwind) sweeps you over early. A sharp Navigator trims the risk.
  const tideOver = currentAlong(cur, wind.fromDeg); // + sets over the line (upwind)

  const sideRead = favouredSideAt(field, start.lat, start.lon, line.firstLegBearing);
  return { line, wind, endBias, tideOver, sideRead, cur };
}

function slack(): TidalField {
  return { floodDeg: 0, peakRateKn: 0, periodH: 12.42, phaseH: 0, gates: [], refLat: 0, refLon: 0 };
}

function ocsRiskFrom(tideOver: number, reliable: number): number {
  return Math.max(0.05, Math.min(0.6, 0.16 + Math.max(0, tideOver) * 0.22 - reliable * 0.12));
}

// The Navigator's pre-start read for the chart, hedged by their confidence.
export function startRead(
  race: Race,
  field: WindField,
  tide: TidalField | undefined,
  reliable: number
): StartRead {
  const { line, wind, endBias, tideOver, sideRead, cur } = rawRead(race, field, tide);
  const favouredEnd = endBias > 0.1 ? 'committee' : endBias < -0.1 ? 'pin' : 'mid';
  return {
    line,
    endBias,
    favouredEnd,
    sideRead,
    ocsRisk: ocsRiskFrom(tideOver, reliable),
    reliable,
    windFromDeg: wind.fromDeg,
    windSpeedKn: wind.speedKn,
    tideRateKn: cur.rateKn,
    tideSetDeg: cur.setDeg,
  };
}

// Resolve the player's three start calls against the real wind & tide into the
// opening leg's advantage. Pure: the only chance is the injected `roll` (0–1),
// used solely for whether a full send is over early. `reliable` is the
// Navigator's confidence (it trims OCS risk — a good read is a real edge).
export function resolveStart(
  race: Race,
  field: WindField,
  tide: TidalField | undefined,
  plan: StartPlan,
  reliable: number,
  roll: number,
  fleetSize: number
): StartOutcome {
  const { endBias, tideOver, sideRead } = rawRead(race, field, tide);

  // End: nail the favoured end and you're ahead off the line; mid-line gives up
  // the bias but is safe and clean.
  const endScore =
    plan.end === 'committee' ? endBias : plan.end === 'pin' ? -endBias : -0.12 * Math.abs(endBias);

  // Approach: a full send is the high-variance play — front row if you time it,
  // OCS and a trip to the back if you don't.
  const ocsRisk = ocsRiskFrom(tideOver, reliable);
  let ocs = false;
  let approachScore: number;
  if (plan.approach === 'send') {
    ocs = roll < ocsRisk;
    approachScore = ocs ? -1 : 0.6;
  } else if (plan.approach === 'timed') {
    approachScore = 0.28 + 0.12 * reliable;
  } else {
    approachScore = -0.08; // hold back: safe, a touch off the pace, but clean
  }

  // First beat: commit to the favoured side (pays when the field backs it), hold
  // for clear air, or foot for speed.
  let bias: RoutingBias = 0;
  let beatScore = 0;
  let speedBump = 0;
  if (plan.beat === 'favoured') {
    bias = sideRead > 0.05 ? 1 : sideRead < -0.05 ? -1 : 0;
    beatScore = 0.25 * Math.abs(sideRead);
  } else if (plan.beat === 'clear') {
    beatScore = 0.06;
  } else {
    speedBump = 0.02;
  }

  const quality = Math.max(-1, Math.min(1, 0.45 * endScore + 0.4 * approachScore + 0.15 * beatScore));
  const fadeNm = race.distanceNm * 0.15;

  if (ocs) {
    return {
      speedMul: 0.82,
      fadeNm,
      timePenaltyH: 0.06,
      bias,
      ocs: true,
      rating: 0.05,
      gunPosition: Math.round(fleetSize * 0.85),
      summary: startSummary(plan, { ocs: true, endBias, sideRead, speedMul: 0.82 }),
    };
  }

  const rating = (quality + 1) / 2;
  const speedMul = Math.max(0.85, Math.min(1.12, 1 + quality * 0.12 + speedBump));
  const gunPosition = Math.max(1, Math.min(fleetSize, Math.round((1 - rating) * (fleetSize - 1)) + 1));
  return {
    speedMul,
    fadeNm,
    timePenaltyH: quality < 0 ? -quality * 0.012 : 0,
    bias,
    ocs: false,
    rating,
    gunPosition,
    summary: startSummary(plan, { ocs: false, endBias, sideRead, speedMul }),
  };
}

function startSummary(
  plan: StartPlan,
  o: { ocs: boolean; endBias: number; sideRead: number; speedMul: number }
): string {
  const endName =
    plan.end === 'committee' ? 'the committee-boat end' : plan.end === 'pin' ? 'the pin end' : 'mid-line';
  if (o.ocs) return `Over early at ${endName} — restarted from the back of the fleet.`;

  const favoured =
    plan.end === 'mid'
      ? null
      : (plan.end === 'committee' && o.endBias > 0.1) || (plan.end === 'pin' && o.endBias < -0.1)
        ? 'the favoured end'
        : Math.abs(o.endBias) > 0.1
          ? 'the wrong end'
          : 'an even line';
  const air = o.speedMul > 1.03 ? 'into clear air' : o.speedMul < 0.96 ? 'in dirty air' : 'in fair air';
  const side =
    plan.beat === 'favoured' && Math.abs(o.sideRead) > 0.05
      ? `, then split to the ${o.sideRead > 0 ? 'right' : 'left'}`
      : plan.beat === 'clear'
        ? ', holding clear air'
        : '';
  const lead = favoured ? `${cap(endName)} (${favoured})` : cap(endName);
  return `${lead}, away ${air}${side}.`;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
