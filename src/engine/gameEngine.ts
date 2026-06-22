import {
  Boat,
  BoatCondition,
  CrewMember,
  DivisionKey,
  FleetBoat,
  GameEvent,
  GameState,
  GeoPoint,
  EffortMode,
  PlayerStrategy,
  Provision,
  ProvisionSelection,
  Race,
  RaceDivision,
  RaceProgress,
  RaceResult,
  RoutingBias,
  StepResult,
  TacticalChoice,
  VmgPreview,
  Waypoint,
  WindField,
  WindSample,
} from '../types';
import {
  getBoatById,
  getCrewById,
  getProvisionById,
  getRaceById,
  pickEventForRace,
} from '../data';
import { rnd, rndRange } from './rng';
import {
  angularDelta,
  bearing,
  courseLengthNm,
  haversineNm,
  pointOfSailFor,
} from './geo';
import { polarSpeed } from './polar';
import { effectivePolar } from './sails';
import { createWindField, sampleWind, weatherFromWind } from './wind';
import { planRoute } from './router';
import { advanceFleet, finalPosition, livePosition } from './fleet';

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

const toRad = (deg: number): number => (deg * Math.PI) / 180;

const average = (values: number[], fallback: number): number =>
  values.length === 0
    ? fallback
    : values.reduce((sum, v) => sum + v, 0) / values.length;

// How far each auto-play tick advances the boat (fraction of the course).
const STEP_FRACTION = 0.01;
// Bounds on the spacing between decisions, as a fraction of the course.
const DECISION_MIN = 0.07;
const DECISION_MAX = 0.16;
const FIRST_DECISION_MIN = 0.04;
const FIRST_DECISION_MAX = 0.1;
const MAX_DECISIONS = 14;
// Nominal stretch (fraction of course) used to project VMG for a choice.
const DECISION_STRETCH = 1 / 12;
// Re-route when the local wind has shifted this much from the planned route.
const REROUTE_SHIFT_DEG = 12;
const TRAIL_CAP = 400;

export const DEFAULT_STRATEGY: PlayerStrategy = { bias: 0, effort: 'cruise' };
// Effort dial: speed multiplier and wear multiplier per mode.
const EFFORT_SPEED: Record<EffortMode, number> = { conserve: 0.93, cruise: 1, push: 1.08 };
const EFFORT_WEAR: Record<EffortMode, number> = { conserve: 0.7, cruise: 1, push: 1.6 };

function strategyOf(state: GameState): PlayerStrategy {
  return state.strategy ?? DEFAULT_STRATEGY;
}

export function defaultStepNm(race: Race): number {
  return Math.max(race.distanceNm * STEP_FRACTION, 0.5);
}

export function raceDivision(race: Race, division: DivisionKey): RaceDivision {
  return race.divisions[division];
}

// Resolve a boat id against both the catalogue and the player's custom fleet.
// A custom boat carrying specialist sails is returned with its effective polar
// (base lifted by the wardrobe) so the whole engine sails the rigged boat;
// boats without specialist sails are returned untouched.
export function resolveBoatById(state: GameState, id?: string): Boat | undefined {
  if (!id) return undefined;
  const boat = getBoatById(id) ?? state.profile?.fleet.find((b) => b.id === id);
  const fleetBoat = boat as FleetBoat | undefined;
  if (fleetBoat?.sails?.length) {
    const rigged: FleetBoat = {
      ...fleetBoat,
      polar: effectivePolar(fleetBoat.polar, fleetBoat.sails),
    };
    return rigged;
  }
  return boat;
}

// A boat is owned (no purchase charged) if it's been bought, or it's a custom
// boat the player built.
export function isBoatOwned(state: GameState, boat?: Boat): boolean {
  if (!boat) return false;
  return Boolean((boat as FleetBoat).custom) || (state.ownedBoatIds?.includes(boat.id) ?? false);
}

// ---- Provisioning helpers ----

export function provisionCost(selections: ProvisionSelection[]): number {
  return selections.reduce((total, sel) => {
    const provision = getProvisionById(sel.provisionId);
    return total + (provision ? provision.unitCost * sel.quantity : 0);
  }, 0);
}

function sumProvisionEffect(
  selections: ProvisionSelection[],
  key: keyof Pick<Provision, 'staminaBoost' | 'moraleBoost' | 'repairBoost' | 'safetyBoost'>
): number {
  return selections.reduce((total, sel) => {
    const provision = getProvisionById(sel.provisionId);
    return total + (provision ? provision[key] * sel.quantity : 0);
  }, 0);
}

export function crewWageTotal(crewIds: string[]): number {
  return crewIds.reduce((total, id) => {
    const member = getCrewById(id);
    return total + (member ? member.wage : 0);
  }, 0);
}

export interface CampaignCost {
  entryFee: number;
  charter: number;
  wages: number;
  provisions: number;
  total: number;
}

export function campaignCost(state: GameState): CampaignCost {
  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  const entryFee = race ? raceDivision(race, state.selectedDivision).entryFee : 0;
  // Boats are bought once and then owned; no charter the next time you race one.
  const charter = boat && !isBoatOwned(state, boat) ? boat.price : 0;
  const wages = crewWageTotal(state.selectedCrewIds);
  const provisions = provisionCost(state.provisions);
  return {
    entryFee,
    charter,
    wages,
    provisions,
    total: entryFee + charter + wages + provisions,
  };
}

// ---- Progression / unlocks ----

export function finishedRaceIds(history: RaceResult[]): Set<string> {
  return new Set(
    history.filter((r) => r.finished && !r.retired).map((r) => r.raceId)
  );
}

export function isRaceUnlocked(race: Race, history: RaceResult[]): boolean {
  if (!race.unlockAfter) return true;
  return finishedRaceIds(history).has(race.unlockAfter);
}

// ---- Race setup ----

export function initialCondition(
  crew: CrewMember[],
  provisions: ProvisionSelection[]
): BoatCondition {
  const stamina = average(crew.map((c) => c.stamina), 65);
  const morale = average(crew.map((c) => c.morale), 65);
  return {
    hullIntegrity: clamp(100 + sumProvisionEffect(provisions, 'repairBoost') * 0.4),
    crewStamina: clamp(stamina + sumProvisionEffect(provisions, 'staminaBoost')),
    crewMorale: clamp(morale + sumProvisionEffect(provisions, 'moraleBoost')),
  };
}

export function makeWindField(race: Race): WindField {
  return createWindField(race);
}

// Geometric distance still to sail toward the finish (mark to mark, ignoring
// the extra miles spent tacking), used for the progress bar and positioning.
function geometricRemaining(
  marks: Waypoint[],
  pos: GeoPoint,
  nextMarkIndex: number
): number {
  if (nextMarkIndex >= marks.length) return 0;
  let total = haversineNm(pos.lat, pos.lon, marks[nextMarkIndex].lat, marks[nextMarkIndex].lon);
  for (let i = nextMarkIndex; i < marks.length - 1; i += 1) {
    total += haversineNm(marks[i].lat, marks[i].lon, marks[i + 1].lat, marks[i + 1].lon);
  }
  return total;
}

const brg = (a: GeoPoint, b: GeoPoint): number => bearing(a.lat, a.lon, b.lat, b.lon);

export function initialProgress(
  race: Race,
  boat: Boat,
  division: DivisionKey,
  field: WindField,
  bias: RoutingBias = 0
): RaceProgress {
  const fleetSize = raceDivision(race, division).fleetSize;
  const start = race.waypoints[0];
  const pos: GeoPoint = { lat: start.lat, lon: start.lon };
  const total = courseLengthNm(race.waypoints);
  const wind = sampleWind(field, pos.lat, pos.lon, 0);
  const route = planRoute(boat, field, pos, race.waypoints, 1, 0, bias);
  const heading = route.length > 1 ? brg(route[0], route[1]) : 0;
  const firstDecision =
    rndRange(FIRST_DECISION_MIN, FIRST_DECISION_MAX) * race.distanceNm;
  return {
    distanceCoveredNm: 0,
    totalDistanceNm: total,
    elapsedHours: 0,
    position: Math.ceil(fleetSize / 2),
    pointOfSail: pointOfSailFor(heading, wind.fromDeg),
    lat: pos.lat,
    lon: pos.lon,
    heading,
    nextMarkIndex: 1,
    route,
    trail: [pos],
    routeWindDir: wind.fromDeg,
    routePlannedAtNm: 0,
    routeBias: bias,
    windDir: wind.fromDeg,
    windSpeedKn: wind.speedKn,
    nextDecisionAtNm: firstDecision,
    decisionsTaken: 0,
  };
}

// ---- Speed model ----

// Multiplier on polar speed from crew & hull condition.
export function conditionFactor(condition: BoatCondition): number {
  const staminaFactor = 0.6 + 0.4 * (condition.crewStamina / 100);
  const moraleFactor = 0.85 + 0.15 * (condition.crewMorale / 100);
  const hullFactor = 0.7 + 0.3 * (condition.hullIntegrity / 100);
  return staminaFactor * moraleFactor * hullFactor;
}

export function boatSpeedFor(
  boat: Boat,
  condition: BoatCondition,
  heading: number,
  wind: WindSample,
  effortMul = 1
): number {
  const twa = angularDelta(heading, wind.fromDeg);
  return Math.max(polarSpeed(boat, twa, wind.speedKn) * conditionFactor(condition) * effortMul, 0.4);
}

// Boat speed right now, from the live progress + condition + effort dial.
export function currentSpeed(state: GameState): number {
  const boat = resolveBoatById(state, state.selectedBoatId);
  if (!boat || !state.progress) return 0;
  const p = state.progress;
  return boatSpeedFor(
    boat,
    state.condition,
    p.heading,
    { fromDeg: p.windDir, speedKn: p.windSpeedKn },
    EFFORT_SPEED[strategyOf(state).effort]
  );
}

// Speed actually made good toward the next mark (the component of boat speed
// along the bearing to the mark).
export function speedMadeGood(state: GameState): number {
  const race = getRaceById(state.selectedRaceId);
  if (!race || !state.progress) return 0;
  const p = state.progress;
  const mark = race.waypoints[Math.min(p.nextMarkIndex, race.waypoints.length - 1)];
  const bearingToMark = bearing(p.lat, p.lon, mark.lat, mark.lon);
  const along = Math.cos(toRad(angularDelta(p.heading, bearingToMark)));
  return Math.max(currentSpeed(state) * along, 0.2);
}

export function vmgPreview(state: GameState, event: GameEvent): VmgPreview {
  const race = getRaceById(state.selectedRaceId);
  if (!race || !state.progress) return { before: 0, after: {} };

  const smg = speedMadeGood(state);
  const stretchNm = race.distanceNm * DECISION_STRETCH;
  const baseHours = Math.max(stretchNm / smg, 0.2);

  const after: Record<string, number> = {};
  event.choices.forEach((choice) => {
    const projHours = Math.max(baseHours + choice.timeDelta, 0.2);
    after[choice.id] = Math.round((stretchNm / projHours) * 10) / 10;
  });
  return { before: Math.round(smg * 10) / 10, after };
}

// ---- Simulation ----

interface Advance {
  pos: GeoPoint;
  heading: number;
  route: GeoPoint[];
}

// Walk `distNm` along the remaining route, returning the new position, the
// heading of the segment we end on, and the trimmed remaining route.
function advanceAlongRoute(route: GeoPoint[], distNm: number): Advance {
  const pts = route.map((p) => ({ ...p }));
  let remaining = distNm;
  while (remaining > 1e-9 && pts.length > 1) {
    const segLen = haversineNm(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon);
    if (segLen <= remaining + 1e-9 || segLen < 1e-9) {
      remaining -= segLen;
      pts.shift();
    } else {
      const frac = remaining / segLen;
      pts[0] = {
        lat: pts[0].lat + (pts[1].lat - pts[0].lat) * frac,
        lon: pts[0].lon + (pts[1].lon - pts[0].lon) * frac,
      };
      remaining = 0;
    }
  }
  const heading = pts.length > 1 ? brg(pts[0], pts[1]) : 0;
  return { pos: pts[0], heading, route: pts };
}

function appendTrail(trail: GeoPoint[], pos: GeoPoint): GeoPoint[] {
  const next = [...trail, pos];
  if (next.length > TRAIL_CAP) {
    const downsampled: GeoPoint[] = [];
    for (let i = 0; i < next.length; i += 2) downsampled.push(next[i]);
    return downsampled;
  }
  return next;
}

// Advance the boat one tick along its weather-routed track, re-routing as the
// wind field evolves. The mandatory marks stay fixed; only the path bends.
export function stepRace(state: GameState, stepNm: number): StepResult {
  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  if (!race || !boat || !state.progress || !state.windField) {
    throw new Error('Cannot step a race before it has been set up.');
  }

  const marks = race.waypoints;
  const field = state.windField;
  const prev = state.progress;
  const total = prev.totalDistanceNm;
  const strategy = strategyOf(state);
  const wearMul = EFFORT_WEAR[strategy.effort];

  const wind = sampleWind(field, prev.lat, prev.lon, prev.elapsedHours);
  const speed = boatSpeedFor(boat, state.condition, prev.heading, wind, EFFORT_SPEED[strategy.effort]);
  const dtHours = stepNm / speed;

  const adv = advanceAlongRoute(prev.route, stepNm);

  // Mark rounding.
  let nextMarkIndex = prev.nextMarkIndex;
  let rounded = false;
  if (nextMarkIndex < marks.length) {
    const m = marks[nextMarkIndex];
    if (haversineNm(adv.pos.lat, adv.pos.lon, m.lat, m.lon) < Math.max(stepNm, 1.5)) {
      nextMarkIndex += 1;
      rounded = true;
    }
  }

  const remaining = geometricRemaining(marks, adv.pos, nextMarkIndex);
  const distanceCoveredNm = clamp(total - remaining, 0, total);
  const dGeom = Math.max(distanceCoveredNm - prev.distanceCoveredNm, 0);
  const df = total > 0 ? dGeom / total : 0;
  const elapsedHours = prev.elapsedHours + dtHours;

  const weather = weatherFromWind(wind);
  const condition: BoatCondition = {
    crewStamina: clamp(state.condition.crewStamina - df * (40 + weather.riskModifier * 120) * wearMul),
    crewMorale: clamp(state.condition.crewMorale - df * (10 + weather.riskModifier * 60)),
    hullIntegrity: clamp(state.condition.hullIntegrity - df * (8 + weather.riskModifier * 120) * wearMul),
  };

  const retired = condition.hullIntegrity <= 0 || condition.crewStamina <= 0;
  const finished = !retired && (nextMarkIndex >= marks.length || remaining < 0.5);

  // Re-route on a mark rounding or a spent route immediately; otherwise only
  // when the wind has shifted AND we've sailed far enough to be worth it, plus
  // a periodic refresh. This throttling keeps each tick cheap on-device.
  let route = adv.route;
  let routeWindDir = prev.routeWindDir;
  let routePlannedAtNm = prev.routePlannedAtNm;
  let routeBias = prev.routeBias;
  const movedSincePlan = distanceCoveredNm - prev.routePlannedAtNm;
  const shifted = angularDelta(wind.fromDeg, prev.routeWindDir) > REROUTE_SHIFT_DEG;
  const biasChanged = strategy.bias !== prev.routeBias;
  const wantReroute =
    rounded ||
    route.length < 2 ||
    biasChanged ||
    (shifted && movedSincePlan > total * 0.03) ||
    movedSincePlan > total * 0.1;
  if (!finished && !retired && nextMarkIndex < marks.length && wantReroute) {
    route = planRoute(boat, field, adv.pos, marks, nextMarkIndex, elapsedHours, strategy.bias);
    routeWindDir = wind.fromDeg;
    routePlannedAtNm = distanceCoveredNm;
    routeBias = strategy.bias;
  }
  const heading = route.length > 1 ? brg(route[0], route[1]) : adv.heading;

  const progress: RaceProgress = {
    distanceCoveredNm,
    totalDistanceNm: total,
    elapsedHours,
    position: prev.position,
    pointOfSail: pointOfSailFor(heading, wind.fromDeg),
    lat: adv.pos.lat,
    lon: adv.pos.lon,
    heading,
    nextMarkIndex,
    route,
    trail: appendTrail(prev.trail, adv.pos),
    routeWindDir,
    routePlannedAtNm,
    routeBias,
    windDir: wind.fromDeg,
    windSpeedKn: wind.speedKn,
    nextDecisionAtNm: prev.nextDecisionAtNm,
    decisionsTaken: prev.decisionsTaken,
  };

  // Advance the AI fleet through the same elapsed time and wind, then rank.
  const fleet = advanceFleet(state.fleet ?? [], race, boat, field, prev.elapsedHours, dtHours);
  progress.position = finished
    ? finalPosition(fleet, elapsedHours)
    : livePosition(fleet, distanceCoveredNm);

  // Decision scheduling, by geometric progress.
  let event: GameEvent | null = null;
  if (
    !finished &&
    !retired &&
    prev.decisionsTaken < MAX_DECISIONS &&
    distanceCoveredNm >= prev.nextDecisionAtNm
  ) {
    progress.decisionsTaken = prev.decisionsTaken + 1;
    progress.nextDecisionAtNm =
      distanceCoveredNm + rndRange(DECISION_MIN, DECISION_MAX) * total;
    event = pickEventForRace(race.hazard);
  }

  let log: string | undefined;
  if (retired) {
    log = `Forced to retire in ${weather.label.toLowerCase()} after the boat took too much punishment.`;
  } else if (finished) {
    log = `Crossed the finish line at ${race.name}.`;
  } else if (rounded && marks[nextMarkIndex - 1]) {
    log = `Rounded ${marks[nextMarkIndex - 1].name} — ${weather.label}, ${progress.pointOfSail.toLowerCase()}.`;
  }

  return { progress, condition, weather, fleet, event, log, finished, retired };
}

// Apply the player's choice to the active decision (no distance is sailed),
// then resolve the gamble and any resulting retirement.
export function applyDecision(state: GameState, choice: TacticalChoice): StepResult {
  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  if (!race || !boat || !state.progress || !state.weather) {
    throw new Error('Cannot apply a decision outside a race.');
  }

  let stamina = state.condition.crewStamina + choice.staminaDelta;
  let morale = state.condition.crewMorale + choice.moraleDelta;
  let hull = state.condition.hullIntegrity + choice.hullDelta;
  let extraHours = choice.timeDelta;

  // A demoralized crew — or a boat being pushed hard — is more likely to bungle.
  const moralePenalty = state.condition.crewMorale < 40 ? 0.1 : 0;
  const pushPenalty = strategyOf(state).effort === 'push' ? 0.05 : 0;
  if (rnd() < choice.risk + moralePenalty + pushPenalty) {
    extraHours += 0.6 + state.weather.riskModifier;
    hull -= 8;
    morale -= 5;
  } else if (choice.risk > 0.15) {
    morale += 2;
  }

  const condition: BoatCondition = {
    crewStamina: clamp(stamina),
    crewMorale: clamp(morale),
    hullIntegrity: clamp(hull),
  };

  const lostHours = Math.max(extraHours, 0);
  const progress: RaceProgress = {
    ...state.progress,
    elapsedHours: state.progress.elapsedHours + lostHours,
  };

  // While the player handles the decision, the fleet sails on — a costly call
  // can drop you down the standings.
  const fleet = state.windField
    ? advanceFleet(state.fleet ?? [], race, boat, state.windField, state.progress.elapsedHours, lostHours)
    : (state.fleet ?? []);
  progress.position = livePosition(fleet, progress.distanceCoveredNm);

  const retired = condition.hullIntegrity <= 0 || condition.crewStamina <= 0;
  return {
    progress,
    condition,
    weather: state.weather,
    fleet,
    event: null,
    log: `${choice.label}.`,
    finished: false,
    retired,
  };
}

// ---- Results ----

function prizeForPosition(division: RaceDivision, position: number): number {
  if (position === 1) return division.prizeMoney;
  if (position === 2) return Math.round(division.prizeMoney * 0.6);
  if (position === 3) return Math.round(division.prizeMoney * 0.4);
  if (position <= Math.ceil(division.fleetSize / 3)) {
    return Math.round(division.prizeMoney * 0.2);
  }
  if (position <= Math.ceil(division.fleetSize / 2)) {
    return Math.round(division.prizeMoney * 0.12);
  }
  return Math.round(division.prizeMoney * 0.05); // every finisher earns something
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const DIVISION_LABEL: Record<DivisionKey, string> = {
  corinthian: 'Corinthian',
  pro: 'Pro',
};

export function buildResult(state: GameState, outcome: StepResult): RaceResult {
  const race = getRaceById(state.selectedRaceId);
  if (!race) {
    throw new Error('Cannot build a result without a selected race.');
  }

  const division = raceDivision(race, state.selectedDivision);
  const divisionName = DIVISION_LABEL[state.selectedDivision];
  const finished = outcome.finished;
  const retired = outcome.retired;
  const position = retired ? division.fleetSize : outcome.progress.position;
  // Finishing recoups most of your running costs (entry, wages, provisions —
  // not the one-off boat purchase); retiring forfeits them. Position prizes are
  // upside on top, so a well-sailed race is sustainable rather than a sure loss.
  const cost = campaignCost(state);
  const operating = cost.entryFee + cost.wages + cost.provisions;
  const sponsor = finished ? Math.round(operating * 0.9) : 0;
  const prizeMoney = finished ? sponsor + prizeForPosition(division, position) : 0;

  let summary: string;
  if (retired) {
    summary = `Forced to retire from ${race.name} after the boat took too much punishment. Every campaign has its hard lessons.`;
  } else if (position === 1) {
    summary = `Line honours in the ${divisionName} division! A flawless run sees you win ${race.name}. The fleet is left in your wake.`;
  } else if (position <= 3) {
    summary = `A podium finish — ${ordinal(position)} in the ${divisionName} division of ${race.name}. A strong, well-sailed race.`;
  } else if (prizeMoney > 0) {
    summary = `A solid ${ordinal(position)} in the ${divisionName} division of ${race.name}, good enough to take home some prize money.`;
  } else {
    summary = `${ordinal(position)} of ${division.fleetSize} in ${race.name}. Not the result you wanted — back to the drawing board.`;
  }

  return {
    raceId: race.id,
    raceName: race.name,
    division: state.selectedDivision,
    boatId: state.selectedBoatId ?? '',
    finished,
    retired,
    position,
    fleetSize: division.fleetSize,
    elapsedHours: outcome.progress.elapsedHours,
    prizeMoney,
    summary,
    timestamp: Date.now(),
  };
}

export function formatDuration(hours: number): string {
  if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m.toString().padStart(2, '0')}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours - days * 24);
  return `${days}d ${remHours}h`;
}
