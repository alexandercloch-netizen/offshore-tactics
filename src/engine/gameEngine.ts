import {
  Boat,
  BoatCondition,
  CrewMember,
  DivisionKey,
  GameEvent,
  GameState,
  PointOfSail,
  Provision,
  ProvisionSelection,
  Race,
  RaceDivision,
  RaceProgress,
  RaceResult,
  StepResult,
  TacticalChoice,
  VmgPreview,
  WeatherCondition,
} from '../types';
import {
  getBoatById,
  getCrewById,
  getProvisionById,
  getRaceById,
  pickEventForRace,
  pickWeatherForHazard,
} from '../data';
import { rnd, rndRange } from './rng';
import { pointAtFraction, pointOfSailFor } from './geo';

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

const round1 = (value: number): number => Math.round(value * 10) / 10;

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

export function defaultStepNm(race: Race): number {
  return Math.max(race.distanceNm * STEP_FRACTION, 0.5);
}

export function raceDivision(race: Race, division: DivisionKey): RaceDivision {
  return race.divisions[division];
}

// Point of sail from the current position along the real course vs the wind.
export function currentPointOfSail(
  race: Race,
  weather: WeatherCondition,
  distanceCoveredNm: number
): PointOfSail {
  if (!race.waypoints || race.waypoints.length < 2) return 'Reach';
  const fraction = clamp(distanceCoveredNm / race.distanceNm, 0, 1) || 0;
  const tp = pointAtFraction(race.waypoints, fraction);
  return pointOfSailFor(tp.bearing, weather.windDirection);
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
  const boat = getBoatById(state.selectedBoatId);
  const entryFee = race ? raceDivision(race, state.selectedDivision).entryFee : 0;
  const charter = boat ? boat.price : 0;
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

export function initialProgress(
  race: Race,
  division: DivisionKey,
  weather: WeatherCondition
): RaceProgress {
  const fleetSize = raceDivision(race, division).fleetSize;
  const firstDecision =
    rndRange(FIRST_DECISION_MIN, FIRST_DECISION_MAX) * race.distanceNm;
  return {
    distanceCoveredNm: 0,
    totalDistanceNm: race.distanceNm,
    elapsedHours: 0,
    position: Math.ceil(fleetSize / 2),
    pointOfSail: currentPointOfSail(race, weather, 0),
    nextDecisionAtNm: firstDecision,
    decisionsTaken: 0,
  };
}

// ---- Speed & VMG model ----

export function effectiveSpeed(
  boat: Boat,
  weather: WeatherCondition,
  condition: BoatCondition,
  pointOfSail: PointOfSail
): number {
  const pointRating =
    pointOfSail === 'Upwind'
      ? boat.upwind
      : pointOfSail === 'Downwind'
        ? boat.downwind
        : (boat.upwind + boat.downwind) / 2;
  const pointFactor = 0.55 + 0.45 * (pointRating / 100);
  const staminaFactor = 0.6 + 0.4 * (condition.crewStamina / 100);
  const moraleFactor = 0.85 + 0.15 * (condition.crewMorale / 100);
  const hullFactor = 0.7 + 0.3 * (condition.hullIntegrity / 100);
  const speed =
    boat.baseSpeed *
    pointFactor *
    weather.speedModifier *
    staminaFactor *
    moraleFactor *
    hullFactor;
  return Math.max(speed, 0.5);
}

// Fraction of boat speed that counts as progress toward the mark.
const VMG_FACTOR: Record<PointOfSail, number> = {
  Upwind: 0.72,
  Reach: 0.96,
  Downwind: 0.8,
};

export function computeVmg(speed: number, pointOfSail: PointOfSail): number {
  return speed * VMG_FACTOR[pointOfSail];
}

export function vmgPreview(state: GameState, event: GameEvent): VmgPreview {
  const race = getRaceById(state.selectedRaceId);
  const boat = getBoatById(state.selectedBoatId);
  if (!race || !boat || !state.progress || !state.weather) {
    return { before: 0, after: {} };
  }
  const pos = state.progress.pointOfSail;
  const speed = effectiveSpeed(boat, state.weather, state.condition, pos);
  const stretchNm = race.distanceNm * DECISION_STRETCH;
  const baseHours = Math.max(stretchNm / speed, 0.2);
  const before = computeVmg(speed, pos);

  const after: Record<string, number> = {};
  event.choices.forEach((choice) => {
    const projHours = Math.max(baseHours + choice.timeDelta, 0.2);
    after[choice.id] = computeVmg(stretchNm / projHours, pos);
  });
  return { before: round1(before), after };
}

// ---- Position model ----

function estimatePosition(
  race: Race,
  division: RaceDivision,
  progress: RaceProgress
): number {
  const fraction = progress.distanceCoveredNm / race.distanceNm;
  const target = race.recordTimeHours * division.paceTarget;
  const expectedHours = target * Math.max(fraction, 0.0001);
  const paceRatio = progress.elapsedHours / Math.max(expectedHours, 0.01);
  const position = Math.round(1 + (paceRatio - 1) * division.fleetSize);
  return Math.min(Math.max(position, 1), division.fleetSize);
}

// ---- Simulation ----

function segmentIndexAt(race: Race, distanceCoveredNm: number): number {
  const fraction = clamp(distanceCoveredNm / race.distanceNm, 0, 1) || 0;
  return pointAtFraction(race.waypoints, fraction).segmentIndex;
}

// Advances the boat by up to one tick of distance, stopping early to fire a
// scheduled decision. Weather evolves; the crew and hull wear with the miles.
export function stepRace(state: GameState, stepNm: number): StepResult {
  const race = getRaceById(state.selectedRaceId);
  const boat = getBoatById(state.selectedBoatId);
  if (!race || !boat || !state.progress || !state.weather) {
    throw new Error('Cannot step a race before it has been set up.');
  }

  const division = raceDivision(race, state.selectedDivision);
  const prev = state.progress;
  let weather = state.weather;
  const total = race.distanceNm;

  // Decide how far to advance, capping at the next decision and the finish.
  let target = Math.min(prev.distanceCoveredNm + stepNm, total);
  let willDecide = false;
  if (
    prev.decisionsTaken < MAX_DECISIONS &&
    prev.nextDecisionAtNm > prev.distanceCoveredNm &&
    prev.nextDecisionAtNm <= target
  ) {
    target = prev.nextDecisionAtNm;
    willDecide = true;
  }
  const dDist = Math.max(target - prev.distanceCoveredNm, 0);

  const pointOfSail = currentPointOfSail(
    race,
    weather,
    (prev.distanceCoveredNm + target) / 2
  );
  const speed = effectiveSpeed(boat, weather, state.condition, pointOfSail);
  const dtHours = dDist / speed;
  const df = total > 0 ? dDist / total : 0;

  const condition: BoatCondition = {
    crewStamina: clamp(
      state.condition.crewStamina - df * (40 + weather.riskModifier * 120)
    ),
    crewMorale: clamp(
      state.condition.crewMorale - df * (10 + weather.riskModifier * 60)
    ),
    hullIntegrity: clamp(
      state.condition.hullIntegrity - df * (8 + weather.riskModifier * 120)
    ),
  };

  const segBefore = segmentIndexAt(race, prev.distanceCoveredNm);
  const distanceCoveredNm = target;
  const elapsedHours = prev.elapsedHours + dtHours;
  const segAfter = segmentIndexAt(race, distanceCoveredNm);

  // Occasionally evolve the weather between decisions.
  if (!willDecide && rnd() < 0.15) {
    weather = pickWeatherForHazard(race.hazard);
  }

  const progress: RaceProgress = {
    distanceCoveredNm,
    totalDistanceNm: total,
    elapsedHours,
    position: prev.position,
    pointOfSail: currentPointOfSail(race, weather, distanceCoveredNm),
    nextDecisionAtNm: prev.nextDecisionAtNm,
    decisionsTaken: prev.decisionsTaken,
  };
  progress.position = estimatePosition(race, division, progress);

  const retired = condition.hullIntegrity <= 0 || condition.crewStamina <= 0;
  const finished = !retired && distanceCoveredNm >= total;

  let event: GameEvent | null = null;
  if (willDecide && !finished && !retired) {
    // A decision fires: re-roll the weather and schedule the next one.
    weather = pickWeatherForHazard(race.hazard);
    progress.pointOfSail = currentPointOfSail(race, weather, distanceCoveredNm);
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
  } else if (segAfter > segBefore && race.waypoints[segAfter]) {
    log = `Passed ${race.waypoints[segAfter].name} — ${weather.label}, ${progress.pointOfSail.toLowerCase()}.`;
  }

  return { progress, condition, weather, event, log, finished, retired };
}

// Applies the player's choice to the current decision (no distance is sailed),
// then resolves the gamble and any resulting retirement.
export function applyDecision(
  state: GameState,
  choice: TacticalChoice
): StepResult {
  const race = getRaceById(state.selectedRaceId);
  if (!race || !state.progress || !state.weather) {
    throw new Error('Cannot apply a decision outside a race.');
  }

  let stamina = state.condition.crewStamina + choice.staminaDelta;
  let morale = state.condition.crewMorale + choice.moraleDelta;
  let hull = state.condition.hullIntegrity + choice.hullDelta;
  let extraHours = choice.timeDelta;

  // A demoralized crew is more likely to bungle a bold call.
  const moralePenalty = state.condition.crewMorale < 40 ? 0.1 : 0;
  if (rnd() < choice.risk + moralePenalty) {
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

  const progress: RaceProgress = {
    ...state.progress,
    elapsedHours: state.progress.elapsedHours + Math.max(extraHours, 0),
  };

  const retired = condition.hullIntegrity <= 0 || condition.crewStamina <= 0;
  const log = `${choice.label}.`;

  return {
    progress,
    condition,
    weather: state.weather,
    event: null,
    log,
    finished: false,
    retired,
  };
}

// ---- Results ----

function prizeForPosition(division: RaceDivision, position: number): number {
  if (position === 1) return division.prizeMoney;
  if (position === 2) return Math.round(division.prizeMoney * 0.55);
  if (position === 3) return Math.round(division.prizeMoney * 0.3);
  if (position <= Math.ceil(division.fleetSize / 2)) {
    return Math.round(division.prizeMoney * 0.1);
  }
  return 0;
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
  const prizeMoney = finished ? prizeForPosition(division, position) : 0;

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
