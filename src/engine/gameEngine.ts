import {
  Boat,
  BoatCondition,
  CrewMember,
  GameState,
  LegOutcome,
  PointOfSail,
  Provision,
  ProvisionSelection,
  Race,
  RaceProgress,
  RaceResult,
  TacticalChoice,
  WeatherCondition,
} from '../types';
import {
  getBoatById,
  getCrewById,
  getProvisionById,
  getRaceById,
  pickEvent,
  pickWeather,
} from '../data';
import { GameEvent } from '../types';

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
  const entryFee = race ? race.entryFee : 0;
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

export function initialProgress(race: Race): RaceProgress {
  return {
    currentLeg: 0,
    totalLegs: race.totalLegs,
    elapsedHours: 0,
    distanceCoveredNm: 0,
    position: Math.ceil(race.fleetSize / 2),
  };
}

// ---- Speed model ----

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

// ---- Position model ----

function estimatePosition(race: Race, progress: RaceProgress): number {
  const fraction = progress.distanceCoveredNm / race.distanceNm;
  const expectedHours = race.recordTimeHours * Math.max(fraction, 0.0001);
  const paceRatio = progress.elapsedHours / Math.max(expectedHours, 0.01);
  // paceRatio of 1.0 means record pace -> leading the fleet.
  const position = Math.round(1 + (paceRatio - 1) * race.fleetSize);
  return Math.min(Math.max(position, 1), race.fleetSize);
}

// ---- Events ----

export function maybeEvent(state: GameState): GameEvent | null {
  if (!state.progress) return null;
  const safety = sumProvisionEffect(state.provisions, 'safetyBoost');
  // More provisioning slightly lowers the chance of a tactical incident.
  const chance = clamp(65 - safety * 0.8, 25, 80) / 100;
  return Math.random() < chance ? pickEvent() : null;
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

    // The gamble: a failed risk roll adds time and damage.
    if (Math.random() < choice.risk) {
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
  progress.position = estimatePosition(race, progress);

  const retired = condition.hullIntegrity <= 0 || condition.crewStamina <= 0;
  const finished = nextLeg >= race.totalLegs && !retired;

  const nextWeather = pickWeather();

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

function prizeForPosition(race: Race, position: number): number {
  if (position === 1) return race.prizeMoney;
  if (position === 2) return Math.round(race.prizeMoney * 0.55);
  if (position === 3) return Math.round(race.prizeMoney * 0.3);
  if (position <= Math.ceil(race.fleetSize / 2)) {
    return Math.round(race.prizeMoney * 0.1);
  }
  return 0;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function buildResult(state: GameState, outcome: LegOutcome): RaceResult {
  const race = getRaceById(state.selectedRaceId);
  if (!race) {
    throw new Error('Cannot build a result without a selected race.');
  }

  const finished = outcome.finished;
  const retired = outcome.retired;
  const position = retired ? race.fleetSize : outcome.progress.position;
  const prizeMoney = finished ? prizeForPosition(race, position) : 0;

  let summary: string;
  if (retired) {
    summary = `Forced to retire from ${race.name} after the boat took too much punishment. Every campaign has its hard lessons.`;
  } else if (position === 1) {
    summary = `Line honours! A flawless run sees you take first place in ${race.name}. The fleet is left in your wake.`;
  } else if (position <= 3) {
    summary = `A podium finish — ${ordinal(position)} in ${race.name}. A strong, well-sailed race.`;
  } else if (prizeMoney > 0) {
    summary = `A solid ${ordinal(position)} place in ${race.name}, good enough to take home some prize money.`;
  } else {
    summary = `${ordinal(position)} of ${race.fleetSize} in ${race.name}. Not the result you wanted — back to the drawing board.`;
  }

  return {
    raceId: race.id,
    raceName: race.name,
    boatId: state.selectedBoatId ?? '',
    finished,
    retired,
    position,
    fleetSize: race.fleetSize,
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
