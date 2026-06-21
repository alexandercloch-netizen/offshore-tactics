import {
  Boat,
  BoatCondition,
  CrewMember,
  DivisionKey,
  GameEvent,
  GameState,
  LegOutcome,
  PointOfSail,
  Provision,
  ProvisionSelection,
  Race,
  RaceDivision,
  RaceProgress,
  RaceResult,
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

export const clamp = (value: number, min = 0, max = 100): number =>
  Math.max(min, Math.min(max, value));

const round1 = (value: number): number => Math.round(value * 10) / 10;

const average = (values: number[], fallback: number): number =>
  values.length === 0
    ? fallback
    : values.reduce((sum, v) => sum + v, 0) / values.length;

const POINTS_OF_SAIL: PointOfSail[] = ['Upwind', 'Reach', 'Downwind'];

// Each leg cycles through a point of sail so the boat's strengths matter.
export function pointOfSailForLeg(legIndex: number): PointOfSail {
  return POINTS_OF_SAIL[legIndex % POINTS_OF_SAIL.length];
}

export function raceDivision(race: Race, division: DivisionKey): RaceDivision {
  return race.divisions[division];
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

export function initialProgress(race: Race, division: DivisionKey): RaceProgress {
  const fleetSize = raceDivision(race, division).fleetSize;
  return {
    currentLeg: 0,
    totalLegs: race.totalLegs,
    elapsedHours: 0,
    distanceCoveredNm: 0,
    position: Math.ceil(fleetSize / 2),
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

// Fraction of boat speed that counts as progress toward the mark for each
// point of sail (a simple VMG approximation).
const VMG_FACTOR: Record<PointOfSail, number> = {
  Upwind: 0.72,
  Reach: 0.96,
  Downwind: 0.8,
};

export function computeVmg(speed: number, pointOfSail: PointOfSail): number {
  return speed * VMG_FACTOR[pointOfSail];
}

// Current VMG plus the projected VMG for each choice of an event, so the player
// can see the impact of a decision before committing.
export function vmgPreview(state: GameState, event: GameEvent): VmgPreview {
  const race = getRaceById(state.selectedRaceId);
  const boat = getBoatById(state.selectedBoatId);
  if (!race || !boat || !state.progress || !state.weather) {
    return { before: 0, after: {} };
  }
  const pointOfSail = pointOfSailForLeg(state.progress.currentLeg);
  const speed = effectiveSpeed(boat, state.weather, state.condition, pointOfSail);
  const legDistance = race.distanceNm / race.totalLegs;
  const baseHours = Math.max(legDistance / speed, 0.2);
  const before = computeVmg(speed, pointOfSail);

  const after: Record<string, number> = {};
  event.choices.forEach((choice) => {
    const projHours = Math.max(baseHours + choice.timeDelta, 0.2);
    const projSpeed = legDistance / projHours;
    after[choice.id] = computeVmg(projSpeed, pointOfSail);
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
  // paceRatio of 1.0 means division pace -> leading the fleet.
  const position = Math.round(1 + (paceRatio - 1) * division.fleetSize);
  return Math.min(Math.max(position, 1), division.fleetSize);
}

// ---- Events ----

export function maybeEvent(state: GameState): GameEvent | null {
  if (!state.progress) return null;
  const race = getRaceById(state.selectedRaceId);
  const safety = sumProvisionEffect(state.provisions, 'safetyBoost');
  // Low morale makes incidents more likely; provisioning makes them less so.
  const moraleRisk = state.condition.crewMorale < 40 ? 10 : 0;
  const chance = clamp(62 - safety * 0.8 + moraleRisk, 25, 85) / 100;
  if (Math.random() >= chance) return null;
  return pickEventForRace(race?.hazard);
}

// ---- Advancing a leg ----

export function advanceLeg(
  state: GameState,
  choice: TacticalChoice | null
): LegOutcome {
  const race = getRaceById(state.selectedRaceId);
  const boat = getBoatById(state.selectedBoatId);
  if (!race || !boat || !state.progress || !state.weather) {
    throw new Error('Cannot advance a leg before the race has been set up.');
  }

  const division = raceDivision(race, state.selectedDivision);
  const weather = state.weather;
  const prev = state.progress;
  const pointOfSail = pointOfSailForLeg(prev.currentLeg);
  const legDistance = race.distanceNm / race.totalLegs;

  const speed = effectiveSpeed(boat, weather, state.condition, pointOfSail);
  let legHours = legDistance / speed;

  // Baseline wear from sailing a leg, scaled by weather risk.
  let stamina = state.condition.crewStamina - (3 + weather.riskModifier * 14);
  let morale = state.condition.crewMorale - weather.riskModifier * 6;
  let hull = state.condition.hullIntegrity - weather.riskModifier * 8;

  // Apply the player's tactical choice.
  if (choice) {
    legHours += choice.timeDelta;
    stamina += choice.staminaDelta;
    morale += choice.moraleDelta;
    hull += choice.hullDelta;

    // The gamble: a failed risk roll adds time and damage. A demoralized crew
    // is more likely to make a hash of it.
    const moralePenalty = state.condition.crewMorale < 40 ? 0.1 : 0;
    if (Math.random() < choice.risk + moralePenalty) {
      legHours += 0.6 + weather.riskModifier;
      hull -= 8;
      morale -= 5;
    } else if (choice.risk > 0.15) {
      // A clean run on a bold call lifts the crew.
      morale += 2;
    }
  }

  legHours = Math.max(round1(legHours), 0.2);

  const condition: BoatCondition = {
    hullIntegrity: clamp(hull),
    crewStamina: clamp(stamina),
    crewMorale: clamp(morale),
  };

  const nextLeg = prev.currentLeg + 1;
  const distanceCovered = Math.min(
    prev.distanceCoveredNm + legDistance,
    race.distanceNm
  );
  const elapsedHours = round1(prev.elapsedHours + legHours);

  const progress: RaceProgress = {
    currentLeg: nextLeg,
    totalLegs: race.totalLegs,
    elapsedHours,
    distanceCoveredNm: distanceCovered,
    position: 1,
  };
  progress.position = estimatePosition(race, division, progress);

  const retired = condition.hullIntegrity <= 0 || condition.crewStamina <= 0;
  const finished = nextLeg >= race.totalLegs && !retired;

  const nextWeather = pickWeatherForHazard(race.hazard);

  const log = buildLegLog(
    nextLeg,
    pointOfSail,
    weather,
    condition,
    choice,
    retired
  );

  return {
    progress,
    condition,
    weather: nextWeather,
    pointOfSail,
    legHours,
    log,
    finished,
    retired,
  };
}

function buildLegLog(
  leg: number,
  pointOfSail: PointOfSail,
  weather: WeatherCondition,
  condition: BoatCondition,
  choice: TacticalChoice | null,
  retired: boolean
): string {
  if (retired) {
    return `Leg ${leg}: Disaster strikes in ${weather.label.toLowerCase()} — the boat is forced to retire.`;
  }
  const action = choice ? ` ${choice.label}.` : '';
  return `Leg ${leg} (${pointOfSail}, ${weather.label}):${action} Hull ${Math.round(
    condition.hullIntegrity
  )}%, crew ${Math.round(condition.crewStamina)}% fit.`;
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

export function buildResult(state: GameState, outcome: LegOutcome): RaceResult {
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
