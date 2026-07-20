import {
  AutoCrewPreset,
  AutoProvisionPreset,
  Boat,
  BoatCondition,
  Competitor,
  CrewMember,
  CrewRole,
  CrewTier,
  DecisionResolution,
  DivisionKey,
  FleetBoat,
  GameEvent,
  GameState,
  GeoPoint,
  InstrumentReading,
  EffortMode,
  PlayerStrategy,
  Provision,
  ProvisionCategory,
  ProvisionSelection,
  Race,
  RaceDivision,
  RaceProgress,
  RaceResult,
  RoutingBias,
  Sail,
  SailCategory,
  SailMode,
  SignatureOutcome,
  StepResult,
  TacticalChoice,
  TidalField,
  VmgPreview,
  Waypoint,
  WindField,
  WindSample,
} from '../types';
import {
  crewForTier,
  getBoatById,
  getCrewById,
  getProvisionById,
  getRaceById,
  pickEventForRace,
  conditionBand,
  racePhase,
} from '../data';
import { hazardEventForRace, signatureOutcomeFor } from '../data/events';
import { debriefBeat, storylineForRace } from '../data/storylines';
import { rnd, rndRange } from './rng';
import {
  angularDelta,
  bearing,
  courseLengthNm,
  haversineNm,
  movePoint,
  pointOfSailFor,
} from './geo';
import { bestVmgAngles, polarSpeed } from './polar';
import { orcRating } from './orc';
import {
  bestSailAt,
  bestWardrobeMul,
  effectivePolar,
  flownSailMul,
  isWorkingSail,
  raceWardrobe,
  sailCoverage,
} from './sails';
import { getSailById, WORKING_SAILS } from '../data/sails';
import { createWindField, forecastConfidence, pressureHint, sampleWind, weatherFromWind } from './wind';
import { clearPolyline, planRoute, WindSampler } from './router';
import { currentAlong, sampleCurrent, tideAlong } from './current';
import { LANDMASSES, LandPolygon } from '../data/landmasses';
import { pointInLand, segmentCrossesLand, snapToWater } from './land';
import {
  advanceFleet,
  correctedPosition,
  correctedStandings,
  finalPosition,
  livePosition,
  nearestCorrectedGapSeconds,
} from './fleet';

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
// How long (fraction of the course) a choice-opened situation (a tucked reef, a
// big kite up) stays live before the moment has passed and its follow-on
// decision can no longer fire. Wide enough for one or two decision beats.
const SITUATION_WINDOW_FRACTION = 0.35;
// Nominal stretch (fraction of course) used to project VMG for a choice.
const DECISION_STRETCH = 1 / 12;
// Re-route when the local wind has shifted this much from the planned route.
const REROUTE_SHIFT_DEG = 12;
const TRAIL_CAP = 400;

export const DEFAULT_STRATEGY: PlayerStrategy = { bias: 0, effort: 'cruise' };
// Effort dial: speed multiplier and wear multiplier per mode.
export const EFFORT_SPEED: Record<EffortMode, number> = { conserve: 0.93, cruise: 1, push: 1.08 };
const EFFORT_WEAR: Record<EffortMode, number> = { conserve: 0.7, cruise: 1, push: 1.6 };

function strategyOf(state: GameState): PlayerStrategy {
  return state.strategy ?? DEFAULT_STRATEGY;
}

export function defaultStepNm(race: Race): number {
  return Math.max(race.distanceNm * STEP_FRACTION, 0.5);
}

// The fleet benchmark's clean run walks the course at a coarser step than
// gameplay to keep setup snappy. A convergence audit (see the PR notes) found the
// 3× step carries a modest per-boat bias vs the lived tick model — largest for a
// heavy, hard-tacking hull, whose extra tacking miles a finer step resolves — so a
// finer step is *more* accurate. It is left at 3× here deliberately: the dominant
// fairness fix is the crew threading below (which corrects the benchmark far more
// than the step does), and dropping to 2× both ~1.5×'d benchmark cost everywhere
// and materially re-paced the tuned fleet-tightness cases through that same
// tacking-resolution shift. Reducing the step is a sound follow-up once the router
// is cheaper and the fleet-pacing tests are re-tuned together. The parameter is
// plumbed through `cleanRunHours` so that change is a one-line flip.
const CLEAN_RUN_STEP_SCALE = 3;

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

// How long the passage takes for provisioning purposes: the course record at a
// club-fleet pace, in days. Anchors how much food & water the crew will need.
export function estimatePassageDays(race: Race): number {
  return Math.max(0.25, (race.recordTimeHours * 1.5) / 24);
}

// How under/over-provisioned a campaign is, and the resulting effects. Pure and
// deterministic. Consumables (food, water) must cover the crew for the passage;
// short rations sap starting condition. Equipment (spares, safety/medical) is a
// one-off fit-out: spares resist hull wear, safety gear cuts incident risk —
// both with saturating returns, so one good kit is enough.
export interface ProvisioningPlan {
  passageDays: number;
  crewDays: number; // crew × passage days — the food/water need
  foodRatio: number; // provided ÷ needed crew-days (food)
  waterRatio: number;
  sustenance: number; // min(food, water), the binding constraint (0 = starved)
  staminaStart: number; // signed delta to starting crew stamina
  moraleStart: number; // signed delta to starting crew morale
  hullWearResist: number; // 0–0.45 fraction less hull wear (spares)
  safety: number; // 0–0.5 fraction less incident/retirement risk (safety gear)
}

const SUSTENANCE_STAMINA_SWING = 36; // stamina lost when fully out of food/water
const SUSTENANCE_MORALE_SWING = 30;

function consumableCrewDays(selections: ProvisionSelection[], category: ProvisionCategory): number {
  return selections.reduce((total, sel) => {
    const p = getProvisionById(sel.provisionId);
    if (!p || p.category !== category || p.kind !== 'consumable') return total;
    return total + (p.crewDaysPerUnit ?? 0) * sel.quantity;
  }, 0);
}

export function provisioningPlan(
  selections: ProvisionSelection[],
  crewCount: number,
  race: Race
): ProvisioningPlan {
  const passageDays = estimatePassageDays(race);
  const crewDays = Math.max(1, crewCount) * passageDays;

  const foodRatio = consumableCrewDays(selections, 'Food') / crewDays;
  const waterRatio = consumableCrewDays(selections, 'Water') / crewDays;
  const sustenance = Math.max(0, Math.min(foodRatio, waterRatio));
  const fed = Math.min(1, sustenance); // quality only counts once the crew is fed
  const shortfall = Math.max(0, 1 - sustenance);

  // Premium consumables lift condition, but only up to what the passage needs.
  const qualityStamina = sumConsumableQuality(selections, crewDays, 'staminaBoost');
  const qualityMorale = sumConsumableQuality(selections, crewDays, 'moraleBoost');

  const staminaStart = qualityStamina * fed - SUSTENANCE_STAMINA_SWING * shortfall;
  const moraleStart = qualityMorale * fed - SUSTENANCE_MORALE_SWING * shortfall;

  const repair = sumEquipmentEffect(selections, 'repairBoost');
  const safetyPts = sumEquipmentEffect(selections, 'safetyBoost');
  const hullWearResist = Math.min(0.45, repair / (repair + 30));
  const safety = Math.min(0.5, safetyPts / (safetyPts + 24));

  return { passageDays, crewDays, foodRatio, waterRatio, sustenance, staminaStart, moraleStart, hullWearResist, safety };
}

// Quality (stamina/morale) bonus from consumables, counting each item's quantity
// only up to the units the passage actually needs (no benefit from stockpiling).
function sumConsumableQuality(
  selections: ProvisionSelection[],
  crewDays: number,
  key: 'staminaBoost' | 'moraleBoost'
): number {
  return selections.reduce((total, sel) => {
    const p = getProvisionById(sel.provisionId);
    if (!p || p.kind !== 'consumable' || p[key] <= 0) return total;
    const recommended = p.crewDaysPerUnit ? Math.ceil(crewDays / p.crewDaysPerUnit) : sel.quantity;
    return total + p[key] * Math.min(sel.quantity, recommended);
  }, 0);
}

function sumEquipmentEffect(
  selections: ProvisionSelection[],
  key: 'repairBoost' | 'safetyBoost'
): number {
  return selections.reduce((total, sel) => {
    const p = getProvisionById(sel.provisionId);
    if (!p || p.kind !== 'equipment') return total;
    return total + p[key] * sel.quantity;
  }, 0);
}

// Auto-provision the boat, mirroring auto-crew: cover the crew for the passage
// and (beyond 'minimum') fit sensible safety & spares. Returns a tidy selection.
export function autoProvision(state: GameState, preset: AutoProvisionPreset): ProvisionSelection[] {
  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  if (!race) return [];
  const crewCount = state.selectedCrewIds.length || boat?.crewCapacity || 1;
  const crewDays = estimatePassageDays(race) * crewCount;

  const sel: ProvisionSelection[] = [];
  const add = (id: string, quantity: number) => {
    if (quantity > 0) sel.push({ provisionId: id, quantity });
  };
  const unitsToCover = (id: string, factor: number): number => {
    const p = getProvisionById(id);
    return p?.crewDaysPerUnit ? Math.ceil((crewDays * factor) / p.crewDaysPerUnit) : 0;
  };

  // Margin of food & water over the bare need.
  const factor = preset === 'bluewater' ? 1.25 : preset === 'balanced' ? 1.05 : 1.0;
  const foodId = preset === 'minimum' ? 'prov-rations' : 'prov-galley';
  add(foodId, unitsToCover(foodId, factor));
  add('prov-water', unitsToCover('prov-water', factor));

  if (preset === 'balanced') {
    add('prov-spares', 1);
    add('prov-safety', 1);
    add('prov-medkit', 1);
  } else if (preset === 'bluewater') {
    add('prov-rigging', 1);
    add('prov-spares', 1);
    add('prov-safety', 1);
    add('prov-foulies', 1);
    add('prov-medkit', 1);
  }
  return sel;
}

export function crewWageTotal(crewIds: string[]): number {
  return crewIds.reduce((total, id) => {
    const member = getCrewById(id);
    return total + (member ? member.wage : 0);
  }, 0);
}

// Which sailors are eligible for a division: Corinthian races are amateur-only,
// the Pro division hires professionals.
export function tierForDivision(division: DivisionKey): CrewTier {
  return division === 'pro' ? 'pro' : 'corinthian';
}

export function crewPoolForDivision(division: DivisionKey): CrewMember[] {
  return crewForTier(tierForDivision(division));
}

// Corinthian crews sail unpaid, so wages are only owed in the Pro division.
export function crewWageForDivision(crewIds: string[], division: DivisionKey): number {
  return division === 'pro' ? crewWageTotal(crewIds) : 0;
}

const DEFAULT_CREW_SKILL = 60; // a thin, anonymous crew sails like a club average

// Mean skill of the signed crew (used to scale boat speed and steady decisions).
export function crewSkillAverage(crewIds: string[]): number {
  const skills = crewIds
    .map((id) => getCrewById(id)?.skill)
    .filter((s): s is number => s !== undefined);
  return average(skills, DEFAULT_CREW_SKILL);
}

// The skill that drives forecast confidence: the boat's Navigator(s) if one is
// aboard, else the crew's general nous. Rewards signing a strong Navigator.
export function navigatorSkill(crewIds: string[]): number {
  return roleSkill(crewIds, 'Navigator');
}

// The skill the boat can call on for a given role: the signed specialist(s) if
// any are aboard, else the crew's general nous (someone always covers the job,
// just not as well). This is what makes the roster tactical — each role earns
// its keep somewhere specific: the Navigator in the read, the Tactician in
// saving a misread call, Bowman/Trimmer in the sail handling, the Skipper in
// keeping her on her feet when it blows.
export function roleSkill(crewIds: string[], role: CrewRole): number {
  const hands = crewIds
    .map((id) => getCrewById(id))
    .filter((c): c is NonNullable<typeof c> => !!c && c.role === role);
  if (hands.length) return average(hands.map((h) => h.skill), DEFAULT_CREW_SKILL);
  return crewSkillAverage(crewIds);
}

// A role's relief factor in [0, max]: only above-average specialists earn it,
// scaling linearly to `max` at skill 100. Kept small and capped everywhere it's
// used, so a stacked crew tunes the odds rather than trivialising them.
function roleRelief(crewIds: string[], role: CrewRole, max: number): number {
  return (clamp(roleSkill(crewIds, role) - 50, 0, 50) / 50) * max;
}

// Crew skill as a multiplier on boat speed: a green crew (skill 0) sails at 0.9,
// a flawless crew (skill 100) at 1.1, with the club average sitting near 1.0.
export function crewSkillFactor(skill: number): number {
  return 0.9 + 0.2 * (clamp(skill) / 100);
}

// One-tap crew: fill the boat's berths from the division's pool, biased by the
// preset, and prefer one sailor per role before doubling up — so you get a
// crewed boat, not five bowmen. Pure & deterministic for a given pool/capacity.
export function rankCrewForPreset(pool: CrewMember[], preset: AutoCrewPreset): CrewMember[] {
  const ranked = [...pool];
  if (preset === 'veteran') {
    // Grizzled hands first: highest skill, oldest as the tiebreak.
    ranked.sort((a, b) => b.skill - a.skill || b.age - a.age);
    return ranked;
  }
  if (preset === 'novice') {
    // Young guns: youngest first, freshest legs as the tiebreak.
    ranked.sort((a, b) => a.age - b.age || b.stamina - a.stamina);
    return ranked;
  }
  // Balanced watch: comb the skill-sorted list from both ends so a truncated
  // crew mixes seasoned salts with hungry youth.
  ranked.sort((a, b) => b.skill - a.skill || a.age - b.age);
  const comb: CrewMember[] = [];
  let lo = 0;
  let hi = ranked.length - 1;
  while (lo <= hi) {
    comb.push(ranked[lo]);
    if (lo !== hi) comb.push(ranked[hi]);
    lo += 1;
    hi -= 1;
  }
  return comb;
}

const CREW_ROLE_ORDER: CrewRole[] = ['Skipper', 'Navigator', 'Tactician', 'Trimmer', 'Bowman'];

export function autoSelectCrew(state: GameState, preset: AutoCrewPreset): string[] {
  const boat = resolveBoatById(state, state.selectedBoatId);
  const capacity = boat ? boat.crewCapacity : 0;
  if (capacity <= 0) return [];
  const ranked = rankCrewForPreset(crewPoolForDivision(state.selectedDivision), preset);

  const picked: CrewMember[] = [];
  // First pass: best available sailor for each role, in race-deck order.
  for (const role of CREW_ROLE_ORDER) {
    if (picked.length >= capacity) break;
    const best = ranked.find((m) => m.role === role && !picked.includes(m));
    if (best) picked.push(best);
  }
  // Second pass: fill any remaining berths with the next-best sailors.
  for (const m of ranked) {
    if (picked.length >= capacity) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked.slice(0, capacity).map((m) => m.id);
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
  // Corinthian crews are amateurs sailing unpaid — only the Pro division owes wages.
  const wages = crewWageForDivision(state.selectedCrewIds, state.selectedDivision);
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
  provisions: ProvisionSelection[],
  race?: Race
): BoatCondition {
  const stamina = average(crew.map((c) => c.stamina), 65);
  const morale = average(crew.map((c) => c.morale), 65);
  // With a race in hand, scale provisioning to the crew & passage; without one
  // (legacy callers), fall back to the flat per-unit boosts.
  if (race) {
    const plan = provisioningPlan(provisions, crew.length, race);
    return {
      hullIntegrity: 100,
      crewStamina: clamp(stamina + plan.staminaStart),
      crewMorale: clamp(morale + plan.moraleStart),
    };
  }
  return {
    hullIntegrity: 100,
    crewStamina: clamp(stamina + sumProvisionEffect(provisions, 'staminaBoost')),
    crewMorale: clamp(morale + sumProvisionEffect(provisions, 'moraleBoost')),
  };
}

export function makeWindField(race: Race): WindField {
  return createWindField(race);
}

// A clean headless run of `boat` over the whole course, on the SAME movement
// model the player sails (`stepRace`'s core: weather-route, advance, re-route on
// shifts and roundings) at a steady cruise — the boat's realistic potential,
// deterministically (no RNG, no decisions). Crew is faithful, not generic: the
// caller passes the crew's `skillMul` and the `startCondition` the race actually
// seeds (crew stamina/morale + provisioning), so the run tracks what the player
// will sail; omit them (legacy/tests) and it falls back to a club-average, fresh
// boat. This is the trustworthy anchor for fleet pacing: a route-only ETA
// (`estimateRouteHours`) drifts 2–3× off the lived result in light, shifty air,
// because the live boat sails through holes the snapshot route gets stuck in.
// Mirrors `stepRace` so the two can't diverge by course.
export function cleanRunHours(
  race: Race,
  boat: Boat,
  field: WindField,
  skillMul = crewSkillFactor(DEFAULT_CREW_SKILL),
  effortMul = EFFORT_SPEED.cruise,
  startCondition?: BoatCondition,
  stepScale = CLEAN_RUN_STEP_SCALE
): number {
  const marks = race.waypoints;
  const land = LANDMASSES[race.id];
  const wearMul = EFFORT_WEAR.cruise;
  // Start from the crew+provisions the player will actually cross the line with
  // (the same `initialCondition` the race seeds), not an idealised fresh boat —
  // so the benchmark reflects a tired, under-crewed or well-fed boat exactly as
  // the player sails it. Absent (legacy/tests) it falls back to a fresh hull.
  const condition: BoatCondition = startCondition
    ? { ...startCondition }
    : { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 };
  const total = race.distanceNm;
  // A coarser step than gameplay keeps race setup snappy: the benchmark only
  // needs the total finish time, not a smooth track, and time integrates over
  // distance, so a bigger chunk is an unbiased (just rougher) estimate. The
  // benchmark is deliberately tide-FREE — tide is applied symmetrically to the
  // player and the fleet at race time, so it cancels in the standings and the
  // delicate, tide-free balance is preserved.
  const step = Math.max(defaultStepNm(race) * stepScale, 1);
  const start = marks[0];
  let pos: GeoPoint = { lat: start.lat, lon: start.lon };
  let nextMarkIndex = 1;
  let elapsed = 0;
  let distanceCoveredNm = 0;
  let route = planRoute(boat, field, pos, marks, nextMarkIndex, 0, 0, land);
  let heading = route.length > 1 ? brg(route[0], route[1]) : 0;
  let routeWindDir = sampleWind(field, pos.lat, pos.lon, 0).fromDeg;
  let routePlannedAtNm = 0;
  for (let i = 0; i < 8000; i += 1) {
    const wind = sampleWind(field, pos.lat, pos.lon, elapsed);
    const speed = boatSpeedFor(boat, condition, heading, wind, effortMul, skillMul);
    const adv = advanceAlongRoute(route, step);
    pos = adv.pos;
    let rounded = false;
    if (nextMarkIndex < marks.length) {
      const m = marks[nextMarkIndex];
      if (haversineNm(pos.lat, pos.lon, m.lat, m.lon) < Math.max(step, 1.5)) {
        nextMarkIndex += 1;
        rounded = true;
      }
    }
    const remaining = geometricRemaining(marks, pos, nextMarkIndex);
    const prevCovered = distanceCoveredNm;
    distanceCoveredNm = clamp(total - remaining, 0, total);
    elapsed += step / speed;
    // Carry the same wear the player would, on an unprovisioned cruise, so the
    // benchmark reflects a real finish (a worn boat slows) — not an ideal one.
    const df = total > 0 ? Math.max(distanceCoveredNm - prevCovered, 0) / total : 0;
    const weather = weatherFromWind(wind);
    condition.crewStamina = clamp(condition.crewStamina - df * (28 + weather.riskModifier * 45) * wearMul);
    condition.crewMorale = clamp(condition.crewMorale - df * (10 + weather.riskModifier * 40));
    condition.hullIntegrity = clamp(condition.hullIntegrity - df * (6 + weather.riskModifier * 40) * wearMul);
    if (nextMarkIndex >= marks.length || remaining < 0.5) break;

    route = adv.route;
    const movedSincePlan = distanceCoveredNm - routePlannedAtNm;
    const shifted = angularDelta(wind.fromDeg, routeWindDir) > REROUTE_SHIFT_DEG;
    const wantReroute =
      rounded ||
      route.length < 2 ||
      (shifted && movedSincePlan > total * 0.03) ||
      movedSincePlan > total * 0.1;
    if (wantReroute) {
      route = planRoute(boat, field, pos, marks, nextMarkIndex, elapsed, 0, land);
      routeWindDir = wind.fromDeg;
      routePlannedAtNm = distanceCoveredNm;
    }
    heading = route.length > 1 ? brg(route[0], route[1]) : adv.heading;
  }
  return elapsed > 0 ? elapsed : race.recordTimeHours * 1.5;
}

// The benchmark finish time the AI fleet is paced around: the player's own boat
// AND crew sailed a clean cruise on the weather-optimal line, via the SAME tick
// model the player sails (`cleanRunHours`). Anchoring on the player's boat+crew
// self-calibrates per course, per boat AND per crew, so the fleet is a genuine
// fight whatever you charter and whoever you sign — a runner-up cruiser doesn't
// get lapped, a maxi doesn't sail away, and a thin or green crew isn't left last
// on corrected time before a tactic is even played. The edge from HARDER effort,
// SHARP sail selection or good tactical calls then shows where it should: ground
// made on the field and on corrected (handicap) time — the levers the player
// actually works in the race.
//
// Crew is threaded exactly as the live race feels it: `crewSkillFactor` scales
// boat speed, and the starting `initialCondition` folds in crew stamina/morale
// AND crew count (a short-handed boat provisions differently — the engine's only
// crew-count-vs-capacity channel, `provisioningPlan` off `crewIds.length`, is the
// same one `boatSpeedFor` sees at race time via `condition`). Passing no crew
// (legacy/tests) reproduces the old club-average, fresh-boat benchmark exactly.
export function fleetBenchmarkHours(
  race: Race,
  field: WindField,
  boat?: Boat,
  crewIds: string[] = [],
  provisions: ProvisionSelection[] = []
): number {
  const ref = boat ?? getBoatById('boat-corsair');
  if (!ref) return race.recordTimeHours * 2.4;
  const skillMul = crewSkillFactor(crewSkillAverage(crewIds));
  // Only seed a real starting condition when a crew is signed; with none, keep
  // the fresh-boat fallback so the empty-crew call is byte-identical to before.
  const crew = crewIds
    .map((id) => getCrewById(id))
    .filter((c): c is CrewMember => Boolean(c));
  const startCondition = crew.length ? initialCondition(crew, provisions, race) : undefined;
  return cleanRunHours(race, ref, field, skillMul, EFFORT_SPEED.cruise, startCondition);
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
  const route = planRoute(boat, field, pos, race.waypoints, 1, 0, bias, LANDMASSES[race.id]);
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
    shownEventIds: [],
    readings: [],
    legStartNm: 0,
    startSpeedMul: 1,
    startFadeNm: 0,
  };
}

// Seed the opening standings from the start outcome so the gun position is real,
// not cosmetic. The fleet gets a small deterministic spread across the line, and
// the player is placed within it by start quality: a great start (rating→1) is
// advanced up the first leg ahead of the pack; a poor one (rating→0) starts
// behind. The spread is tiny (~0.6% of the course) and averages out — an average
// start (rating 0.5) lands the player mid-fleet, so the tuned difficulty holds.
export function seedStartGrid(
  progress: RaceProgress,
  fleet: Competitor[],
  race: Race,
  rating: number
): { progress: RaceProgress; fleet: Competitor[] } {
  const total = progress.totalDistanceNm;
  const band = race.distanceNm * 0.006;
  const n = Math.max(fleet.length, 1);
  const spreadFleet = fleet.map((c, i) =>
    c.retired || c.finishedHours !== null ? c : { ...c, distanceNm: band * ((i + 0.5) / n) }
  );
  let next = progress;
  const lead = band * clamp(rating, 0, 1);
  if (lead > 1e-6 && progress.route.length > 1) {
    const adv = advanceAlongRoute(progress.route, lead);
    const remaining = geometricRemaining(race.waypoints, adv.pos, progress.nextMarkIndex);
    const heading = adv.route.length > 1 ? brg(adv.route[0], adv.route[1]) : progress.heading;
    next = {
      ...progress,
      lat: adv.pos.lat,
      lon: adv.pos.lon,
      route: adv.route,
      heading,
      distanceCoveredNm: clamp(total - remaining, 0, total),
      trail: [...progress.trail, adv.pos],
    };
  }
  const position = livePosition(spreadFleet, next.distanceCoveredNm);
  return { progress: { ...next, position }, fleet: spreadFleet };
}

// Cap on the per-leg instrument buffer; downsampled when exceeded so a long leg
// (e.g. after the last scheduled decision) can't grow it without bound.
const READINGS_CAP = 40;

function appendReading(
  readings: InstrumentReading[],
  reading: InstrumentReading
): InstrumentReading[] {
  const next = [...readings, reading];
  if (next.length <= READINGS_CAP) return next;
  const downsampled: InstrumentReading[] = [];
  for (let i = 0; i < next.length; i += 2) downsampled.push(next[i]);
  return downsampled;
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
  effortMul = 1,
  skillMul = 1,
  sailMul = 1
): number {
  const twa = angularDelta(heading, wind.fromDeg);
  return Math.max(
    polarSpeed(boat, twa, wind.speedKn) * conditionFactor(condition) * effortMul * skillMul * sailMul,
    0.4
  );
}

// ---- The flown sail ----
//
// The wardrobe made real: the base polar is the boat under its working set, and
// the ONE sail the crew currently flies multiplies it — a specialist earns its
// boost inside its envelope and bites below base when grossly outside it
// (`flownSailMul`). The default (no `activeSailId`) is the working set at
// exactly 1.0, so a race that never touches the picker sails byte-identically
// to the pre-wardrobe game.

// The boat the player physically trims: the raw hull with its BASE polar. The
// rigged `resolveBoatById` boat (base lifted by the whole wardrobe) remains the
// planner's boat — routing, targets and the fleet benchmark all assume the
// right canvas goes up — but live speed must start from base or a flown sail
// would be counted twice.
function speedBoatFor(state: GameState): Boat | undefined {
  if (!state.selectedBoatId) return undefined;
  return (
    getBoatById(state.selectedBoatId) ??
    state.profile?.fleet.find((b) => b.id === state.selectedBoatId)
  );
}

// The specialist currently flying, or undefined for the working set (including
// the explicit working entries — they multiply by exactly 1).
export function flownSpecialist(progress?: RaceProgress): Sail | undefined {
  const id = progress?.activeSailId;
  if (!id || isWorkingSail(id)) return undefined;
  return getSailById(id);
}

// Live sail multiplier at the boat's current heading and wind.
export function liveSailMul(state: GameState): number {
  const p = state.progress;
  if (!p) return 1;
  return flownSailMul(flownSpecialist(p), angularDelta(p.heading, p.windDir), p.windSpeedKn);
}

// What the SAIL instrument shows: the flown sail's name, how well it suits this
// moment (coverage — 1 for the working set, which is never wrong, only slow),
// and the ⇄N change count. Pure read; undefined only before a race exists.
export interface SailReadout {
  id?: string; // specialist id; undefined = working set
  name: string;
  isWorking: boolean;
  coverage: number; // 0–1 fit to the moment (working set always 1)
  changes: number;
  fumbled: number;
}
export function sailReadout(state: GameState): SailReadout | undefined {
  const p = state.progress;
  if (!p) return undefined;
  const sail = flownSpecialist(p);
  const twa = angularDelta(p.heading, p.windDir);
  return {
    id: sail?.id,
    name: sail ? sail.name : WORKING_SAILS[0].name,
    isWorking: !sail,
    coverage: sail ? sailCoverage(sail, twa, p.windSpeedKn) : 1,
    changes: p.sailChanges ?? 0,
    fumbled: p.sailChangesFumbled ?? 0,
  };
}

// The sails the crew can call for right now: the boat's wardrobe minus anything
// blown out this race. Working sails are indestructible, so this is never empty.
export function availableWardrobe(state: GameState): Sail[] {
  const boat = speedBoatFor(state);
  if (!boat) return [...WORKING_SAILS];
  const out = state.progress?.unavailableSails;
  return raceWardrobe(boat).filter((s) => !out?.includes(s.id));
}

// The Navigator's sail recommendation for the APPROACH TO THE NEXT MARK (the
// anticipatory read — the change you'd call now, not the angle you happen to be
// on this second): the owned specialist doing the most work at the at-the-mark
// TWA/TWS, or null when the working set is the honest call.
export function recommendedSail(state: GameState): Sail | null {
  const race = getRaceById(state.selectedRaceId);
  const field = state.windField;
  const p = state.progress;
  if (!race || !field || !p) return null;
  const mark = race.waypoints[Math.min(p.nextMarkIndex, race.waypoints.length - 1)];
  const brgToMark = bearing(p.lat, p.lon, mark.lat, mark.lon);
  const wind = sampleWind(field, p.lat, p.lon, p.elapsedHours);
  const twa = angularDelta(brgToMark, wind.fromDeg);
  const specialists = availableWardrobe(state).filter((s) => s.boost > 0);
  return bestSailAt(specialists, twa, wind.speedKn);
}

// ---- The sail auto-helm ----
//
// PURE and DRAW-FREE. Given the dial (`strategy.sailMode`), what sail — if any —
// should the crew be flying right now? Returns the id to call for, or null to
// leave the flown sail alone. `manual`/undefined short-circuits on the first
// line, so a manual race never reaches `resolveSailChange` and stays
// byte-identical to the pre-auto engine (the golden's contract). The dial trades
// aggression for steadiness: a keener mode calls sooner (a lower hysteresis
// threshold) and holds a fresh change for less distance (a shorter dwell).

// Nominal dwell (nm since the last change) before the auto-helm will call again
// — the anti-flap clock. Keener modes settle for less.
const SAIL_MODE_DWELL_NM: Record<Exclude<SailMode, 'manual'>, number> = {
  conservative: 12,
  balanced: 6,
  aggressive: 3,
};
// The pace edge (Δ flown-sail multiplier at the live point) the candidate must
// clear over the sail already up before it's worth the manoeuvre. Keener modes
// pull the trigger on a slimmer margin.
const SAIL_MODE_THRESHOLD: Record<Exclude<SailMode, 'manual'>, number> = {
  conservative: 0.06,
  balanced: 0.03,
  aggressive: 0.012,
};
const SAIL_MODE_THRESHOLD_FLOOR = 0.005;
// A sharp Bowman shortens the dwell (up to 30%) and shaves the threshold — the
// bow gets canvas up cleanly, so the helm can call more freely.
const AUTO_BOWMAN_DWELL_RELIEF = 0.3;
const AUTO_BOWMAN_THRESHOLD_RELIEF = 0.015;

// The dwell for a mode, gently scaled by course length (a long passage tolerates
// slightly wider spacing) and shortened by a sharp Bowman.
function dwellNm(mode: Exclude<SailMode, 'manual'>, crewIds: string[], totalNm: number): number {
  const lengthScale = clamp(totalNm / 200, 0.6, 1.4);
  const bowman = 1 - roleRelief(crewIds, 'Bowman', AUTO_BOWMAN_DWELL_RELIEF);
  return SAIL_MODE_DWELL_NM[mode] * lengthScale * bowman;
}

function sailModeThreshold(mode: Exclude<SailMode, 'manual'>, crewIds: string[]): number {
  return Math.max(
    SAIL_MODE_THRESHOLD_FLOOR,
    SAIL_MODE_THRESHOLD[mode] - roleRelief(crewIds, 'Bowman', AUTO_BOWMAN_THRESHOLD_RELIEF)
  );
}

// The auto-helm's call this tick, or null to hold. See the block comment above.
export function autoSailTarget(state: GameState): string | null {
  const mode = strategyOf(state).sailMode;
  if (!mode || mode === 'manual') return null;
  const p = state.progress;
  const field = state.windField;
  if (!p || !field) return null;

  // Dwell gate (anti-flap): sit on a fresh change for the mode's window.
  const dwell = dwellNm(mode, state.selectedCrewIds, p.totalDistanceNm);
  if (p.lastSailChangeNm !== undefined && p.distanceCoveredNm - p.lastSailChangeNm < dwell) {
    return null;
  }

  // The Navigator's anticipatory call (null = douse to the working set) vs the
  // sail actually flying. Nothing to do if they already agree.
  const candidateId = recommendedSail(state)?.id ?? 'working-jib';
  const flownId = flownSpecialist(p)?.id ?? 'working-jib';
  if (candidateId === flownId) return null;

  const candSail = candidateId === 'working-jib' ? undefined : getSailById(candidateId);
  const heldSail = flownId === 'working-jib' ? undefined : getSailById(flownId);

  // Heavy-air gate: hoisting a performance specialist above the heavy-air line
  // courts a blow-out, so only `aggressive` will do it. A douse to the working
  // set — or a hoist of storm canvas — is a safety move and is never gated.
  const isPerformanceHoist =
    candSail !== undefined && candSail.boost > 0 && candSail.category !== 'stormsail';
  if (isPerformanceHoist && p.windSpeedKn >= HEAVY_AIR_KN && mode !== 'aggressive') {
    return null;
  }

  // Hysteresis: measure both sails at the LIVE angle/breeze and only commit if
  // the candidate clears the flown sail by the mode's threshold — so a marginal
  // wobble can't set off a costly flap.
  const wind = sampleWind(field, p.lat, p.lon, p.elapsedHours);
  const twa = angularDelta(p.heading, wind.fromDeg);
  const candMul = flownSailMul(candSail, twa, wind.speedKn);
  const heldMul = flownSailMul(heldSail, twa, wind.speedKn);
  if (candMul - heldMul < sailModeThreshold(mode, state.selectedCrewIds)) return null;

  return candidateId;
}

// The coverage a candidate sail would have at the approach to the next mark —
// the badge on each picker row (anticipatory, like the recommendation).
export function sailCoverageAtMark(state: GameState, sail: Sail): number {
  const race = getRaceById(state.selectedRaceId);
  const field = state.windField;
  const p = state.progress;
  if (!race || !field || !p) return sail.boost > 0 ? 0 : 1;
  if (sail.boost <= 0) return 1;
  const mark = race.waypoints[Math.min(p.nextMarkIndex, race.waypoints.length - 1)];
  const brgToMark = bearing(p.lat, p.lon, mark.lat, mark.lon);
  const wind = sampleWind(field, p.lat, p.lon, p.elapsedHours);
  return sailCoverage(sail, angularDelta(brgToMark, wind.fromDeg), wind.speedKn);
}

// Estimated time (hours) to sail a planned route under the evolving wind: walk
// the polyline, sampling the wind and boat speed as the clock advances, so the
// briefing can preview a finish ETA. Long segments are subdivided so the wind's
// drift over a leg is felt. A forward estimate, not a full tick-by-tick sim.
export function estimateRouteHours(
  boat: Boat,
  condition: BoatCondition,
  route: GeoPoint[],
  field: WindField,
  startHours: number,
  effortMul = 1,
  skillMul = 1,
  sample: WindSampler = sampleWind,
  tidalField?: TidalField
): number {
  if (route.length < 2) return 0;
  const CHUNK_NM = 6;
  let hours = startHours;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const segNm = haversineNm(a.lat, a.lon, b.lat, b.lon);
    if (segNm < 1e-6) continue;
    const heading = brg(a, b);
    const chunks = Math.max(1, Math.ceil(segNm / CHUNK_NM));
    for (let c = 0; c < chunks; c += 1) {
      const f = (c + 0.5) / chunks;
      const lat = a.lat + (b.lat - a.lat) * f;
      const lon = a.lon + (b.lon - a.lon) * f;
      const wind = sample(field, lat, lon, hours);
      const sp = boatSpeedFor(boat, condition, heading, wind, effortMul, skillMul);
      const tide = tideAlong(tidalField, lat, lon, hours, heading);
      hours += segNm / chunks / Math.max(sp + tide, 0.3);
    }
  }
  return hours - startHours;
}

// Boat speed right now, from the live progress + condition + effort dial + the
// edge a skilled crew brings + the sail actually flying (base polar × the
// flown sail's multiplier — the same spine `stepRace` sails).
export function currentSpeed(state: GameState): number {
  const boat = speedBoatFor(state) ?? resolveBoatById(state, state.selectedBoatId);
  if (!boat || !state.progress) return 0;
  const p = state.progress;
  return boatSpeedFor(
    boat,
    state.condition,
    p.heading,
    { fromDeg: p.windDir, speedKn: p.windSpeedKn },
    EFFORT_SPEED[strategyOf(state).effort],
    crewSkillFactor(crewSkillAverage(state.selectedCrewIds)),
    liveSailMul(state)
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

// The tidal stream the boat is in right now: its rate and set, plus the fair/foul
// component along the bearing to the next mark (positive = a fair stream carrying
// you on, negative = foul). Null on a slack course, so callers can hide the
// readout entirely.
export interface TideReading {
  rateKn: number;
  setDeg: number;
  along: number; // signed kn along the course to the next mark (+ fair, − foul)
}
export function tideRead(state: GameState): TideReading | null {
  const field = state.tidalField;
  const p = state.progress;
  if (!field || field.peakRateKn <= 0 || !p) return null;
  const race = getRaceById(state.selectedRaceId);
  const marks = race?.waypoints ?? [];
  const mark = marks[Math.min(p.nextMarkIndex, marks.length - 1)];
  const course = mark ? bearing(p.lat, p.lon, mark.lat, mark.lon) : p.heading;
  const sample = sampleCurrent(field, p.lat, p.lon, p.elapsedHours);
  if (sample.rateKn < 0.05) return null;
  return { rateKn: sample.rateKn, setDeg: sample.setDeg, along: currentAlong(sample, course) };
}

// The boat's polar target speed for the current angle & wind — what a perfectly
// sailed boat would do here. Compared with the live speed, the gap is the cost
// of crew/hull condition and a conservative effort dial (the "% of polar").
export function polarTargetSpeed(state: GameState): number {
  const boat = resolveBoatById(state, state.selectedBoatId);
  if (!boat || !state.progress) return 0;
  const p = state.progress;
  return polarSpeed(boat, angularDelta(p.heading, p.windDir), p.windSpeedKn);
}

// The laylines to the next mark when it can't be fetched directly — i.e. it's
// upwind (sail the close-hauled VMG angle) or dead downwind (the running VMG
// angle). Returns the mark and the two outboard endpoints to draw, or null when
// the mark lays directly (a reach), where laylines have no meaning.
export function laylines(state: GameState): { mark: GeoPoint; ends: [GeoPoint, GeoPoint] } | null {
  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  const field = state.windField;
  const p = state.progress;
  if (!race || !boat || !field || !p || p.nextMarkIndex >= race.waypoints.length) return null;

  const mark = race.waypoints[p.nextMarkIndex];
  const wind = sampleWind(field, p.lat, p.lon, p.elapsedHours);
  const brgToMark = bearing(p.lat, p.lon, mark.lat, mark.lon);
  const twaToMark = angularDelta(brgToMark, wind.fromDeg); // 0..180
  const vmg = bestVmgAngles(boat, wind.speedKn);

  let twaAngle: number;
  if (twaToMark <= vmg.upAngle + 3) twaAngle = vmg.upAngle; // upwind: must tack up
  else if (twaToMark >= vmg.downAngle - 3) twaAngle = vmg.downAngle; // dead downwind: must gybe down
  else return null; // a reach — lay it directly

  const legNm = Math.max(haversineNm(p.lat, p.lon, mark.lat, mark.lon) * 1.1, 1);
  const norm360 = (d: number): number => ((d % 360) + 360) % 360;
  const endA = movePoint(mark.lat, mark.lon, norm360(wind.fromDeg + twaAngle + 180), legNm);
  const endB = movePoint(mark.lat, mark.lon, norm360(wind.fromDeg - twaAngle + 180), legNm);
  return { mark: { lat: mark.lat, lon: mark.lon }, ends: [endA, endB] };
}

// ---- Reading the wind for tactical decisions ----

const signedShift = (toDeg: number, fromDeg: number): number =>
  ((toDeg - fromDeg + 540) % 360) - 180;

// How much the *bold* tactical call is favoured by the real wind field at the
// boat right now, as a signed scalar in [-1, 1]. Positive = a genuine shift is
// developing, the breeze is building, or there's a strong pressure gradient to
// exploit; negative = a false alarm, so sending it costs you. This is what makes
// the chart matter: a bold call only pays when the field actually supports it.
export function tacticalEdge(state: GameState): number {
  const field = state.windField;
  const p = state.progress;
  if (!field || !p) return 0;
  const now = sampleWind(field, p.lat, p.lon, p.elapsedHours);
  const soon = sampleWind(field, p.lat, p.lon, p.elapsedHours + 1.5);
  const shift = Math.abs(signedShift(soon.fromDeg, now.fromDeg));
  const build = soon.speedKn - now.speedKn;
  const pressure = pressureHint(field, p.lat, p.lon, p.elapsedHours);
  const edge = (shift / 18) * 0.5 + (build / 6) * 0.3 + (pressure.strong ? 0.3 : 0) - 0.25;
  return Math.max(-1, Math.min(1, edge));
}

// The edge threshold above which a bold call genuinely pays ("send it"), and
// the single source of truth for how a field-resolved choice's authored time
// turns into hours against the live edge. BOTH the resolution (`applyDecision`)
// and the cockpit preview (`vmgPreview`) go through this helper, so the number
// on the card and the number on the water can never drift apart again — the
// bug this replaces was the cockpit projecting the raw authored `timeDelta`
// (a green gain) for a call the field resolution was about to charge for.
export const EDGE_SEND = 0.35;
export function resolveFieldDelta(choice: TacticalChoice, edge: number): number {
  if (!choice.field) return choice.timeDelta;
  // Signed: read the field RIGHT (edge > EDGE_SEND) and the term goes NEGATIVE —
  // a genuine time GAIN, the reward the tactical layer was missing (a good call
  // used to be neutral at best). Read it WRONG (edge < EDGE_SEND) and it's a
  // positive cost, a couple of places against a tight fleet, not the race. The
  // magnitude is bounded by |timeDelta| × (EDGE_SEND − edge), edge ∈ ~[-0.25, 1],
  // so the gain tops out around 0.65·|timeDelta| before the realised cap.
  return Math.abs(choice.timeDelta) * (EDGE_SEND - edge);
}

// A spotted shift doesn't wait: the further the boat sails past the point where
// the decision fired, the less of the edge is left to commit to. Smooth and
// distance-driven (no timers, no withdrawn options) — the window scales with
// the course so a day-race and an ocean passage decay alike.
const EDGE_WINDOW_FRACTION = 0.05; // e-folding distance as a fraction of the course
export function edgeDecay(distPastTriggerNm: number, courseNm: number): number {
  const windowNm = Math.max(courseNm * EDGE_WINDOW_FRACTION, 1);
  return Math.exp(-Math.max(0, distPastTriggerNm) / windowNm);
}

// Below this remaining decay a docked opportunity is spent — there is nothing
// left worth committing to, so the cards leave the lane. Derived from edgeDecay's
// own window (the ONE timescale for "the moment has passed"), never a second one.
export const EDGE_SPENT = 0.1;
export function decisionExpiryNm(courseNm: number): number {
  // Distance past the trigger at which edgeDecay first falls below EDGE_SPENT.
  return Math.max(courseNm * EDGE_WINDOW_FRACTION, 1) * Math.log(1 / EDGE_SPENT);
}

// The one quiet race-log line an unanswered opportunity leaves behind.
export const DECISION_EXPIRED_LOG = 'Sailed past the moment — kept the course.';

// Retract a docked opportunity without answering it — the player waved it off
// ("hold course"), or the boat sailed its edge out entirely. Either way it is
// NOT a decision: zero RNG draws, zero deltas, and the fired slot is handed
// back so passing on a call never burns one of the race's limited decisions.
// Pure state clearing; the caller logs DECISION_EXPIRED_LOG.
export function expireDecision(progress: RaceProgress): RaceProgress {
  if (progress.decisionTriggerNm === undefined) return progress;
  return {
    ...progress,
    decisionTriggerNm: undefined,
    decisionsTaken: Math.max(progress.decisionsTaken - 1, 0),
  };
}

// The edge a commitment made NOW would actually resolve against: the live read,
// faded by how far the boat has sailed since the decision was triggered. In the
// normal flow the boat holds station while the call is made (decay 1); an
// engine driven past its trigger pays for the delay.
export function effectiveTacticalEdge(state: GameState): number {
  const p = state.progress;
  const edge = tacticalEdge(state);
  if (!p || p.decisionTriggerNm === undefined) return edge;
  return edge * edgeDecay(p.distanceCoveredNm - p.decisionTriggerNm, p.totalDistanceNm);
}

export interface TacticalRead {
  edge: number; // the edge a commitment now resolves against (decayed if stale)
  shiftDeg: number; // signed forecast shift over the next stretch (+veer / −back)
  buildKn: number; // forecast speed change
  reliable: number; // 0–1 — how much the Navigator trusts this read
  hint: string; // short navigator read for the decision modal
}

// The Navigator's read of the situation for the decision modal: the true edge,
// plus a hint hedged by the Navigator's confidence — a sharp Navigator tells you
// whether to send it; a weak one can only shrug. Resolution still uses the true
// edge, so a good Navigator is a genuine edge, not just flavour.
export function tacticalRead(state: GameState): TacticalRead {
  const field = state.windField;
  const p = state.progress;
  const edge = effectiveTacticalEdge(state);
  let shiftDeg = 0;
  let buildKn = 0;
  if (field && p) {
    const now = sampleWind(field, p.lat, p.lon, p.elapsedHours);
    const soon = sampleWind(field, p.lat, p.lon, p.elapsedHours + 1.5);
    shiftDeg = signedShift(soon.fromDeg, now.fromDeg);
    buildKn = soon.speedKn - now.speedKn;
  }
  const reliable = forecastConfidence(navigatorSkill(state.selectedCrewIds), 1.5);

  let hint: string;
  if (reliable < 0.5) {
    hint = 'hard to call from here — back your own judgement.';
  } else if (edge > 0.2) {
    hint = 'the breeze backs the bold call — worth the risk.';
  } else if (edge < -0.05) {
    hint = 'looks like a false alarm — the safe line pays.';
  } else {
    hint = 'marginal — it could go either way.';
  }
  return { edge, shiftDeg, buildKn, reliable, hint };
}

// The on-water swing of a single call, damped and capped — SIGNED and symmetric:
// a genuinely good read is CREDITED time (down to −CAP), a misread COSTS it (up
// to +CAP). A tightly-packed fleet means a small time swing is many places, so
// without the cap one decision could leapfrog the whole field ("flew past for no
// reason") or bury the boat; capping keeps any one call to a few recoverable
// places either way. The player only pulls clear — or falls out of contention —
// by stacking good (or bad) calls; the swing is per-decision, so it compounds.
// Shared by the resolution AND the cockpit preview/downside, so the card
// projects the realised economy.
const DECISION_TIME_SCALE = 0.65;
const DECISION_TIME_CAP_H = 0.5; // absolute: one call swings ~30 min on the water at most
export function realisedDecisionHours(extraHours: number): number {
  return Math.max(-DECISION_TIME_CAP_H, Math.min(extraHours * DECISION_TIME_SCALE, DECISION_TIME_CAP_H));
}

// The Tactician's forgiveness on a committed bold call that the field didn't
// back: a sharp tactician bails out of a phantom corner early and gives back
// part of the misread penalty. Scoped to field-resolved misreads ONLY (the
// Navigator owns the read, the hands own the manoeuvre), and capped well short
// of half so a misread always leaves a real mark.
const TACTICIAN_FORGIVE_MAX = 0.35;
export function misreadForgiveness(crewIds: string[]): number {
  return roleRelief(crewIds, 'Tactician', TACTICIAN_FORGIVE_MAX);
}

// The pessimistic edge behind the "if it goes wrong" line: a flat field where
// the shift never comes (tacticalEdge's practical floor).
const MISREAD_EDGE = -0.25;

// How wide the Navigator's uncertainty about the edge is, from their read
// confidence: a sharp Navigator pins the edge down (a tight band), a weak one
// can only offer a spread. The band is centred on the believed edge, so the
// realised resolution always falls inside it. (At the read's 1.5h lookahead
// `reliable` lives in roughly 0.85–0.94 across the skill range, hence the
// generous multiplier — it maps that narrow range to a visible width swing.)
function edgeHalfWidth(reliable: number): number {
  return 0.05 + 0.9 * (1 - clamp(reliable, 0, 1));
}

// One legible line of what this choice costs when it goes wrong, derived from
// the real resolution + bungle model (never invented): the realised extra hours
// of a misread-plus-fumble over a clean outcome, plus a qualitative word for
// the soft costs — hours and words, never raw "Hull −6" integers.
function downsideSoftCost(choice: TacticalChoice): string | null {
  if (choice.crewSkill === 'Bowman') return 'risks the sail change';
  if (choice.crewSkill === 'Trimmer') return 'risks overpressing her';
  if (choice.hullDelta <= -6) return 'hard on the boat';
  if (choice.staminaDelta <= -8) return 'burns the crew';
  return null;
}

export function choiceDownside(state: GameState, choice: TacticalChoice): string {
  const riskMod = state.weather?.riskModifier ?? 0;
  const forgive = choice.field ? misreadForgiveness(state.selectedCrewIds) : 0;
  const bungleRaw = choice.risk > 0.02 ? 0.3 + riskMod * 0.5 : 0;
  const wrongRaw = choice.field
    ? resolveFieldDelta(choice, MISREAD_EDGE) * (1 - forgive) + bungleRaw
    : Math.max(choice.timeDelta, 0) + bungleRaw;
  const rightRaw = choice.field ? 0 : Math.max(choice.timeDelta, 0);
  const hours = Math.max(0, realisedDecisionHours(wrongRaw) - realisedDecisionHours(rightRaw));
  const soft = downsideSoftCost(choice);
  if (hours < 0.05 && !soft) return 'Little to go wrong.';
  const time = hours >= 0.05 ? `~+${hours.toFixed(1)}h` : 'a few minutes';
  return `If it goes wrong: ${time}${soft ? `, ${soft}` : ''}`;
}

export function vmgPreview(state: GameState, event: GameEvent): VmgPreview {
  const race = getRaceById(state.selectedRaceId);
  if (!race || !state.progress) return { before: 0, after: {} };

  const smg = speedMadeGood(state);
  const stretchNm = race.distanceNm * DECISION_STRETCH;
  const baseHours = Math.max(stretchNm / smg, 0.2);

  // The Navigator's read is only computed when a field choice is on the table —
  // it's what the band hangs off.
  const hasField = event.choices.some((c) => c.field);
  const read = hasField ? tacticalRead(state) : null;
  const forgive = misreadForgiveness(state.selectedCrewIds);

  const after: Record<string, number> = {};
  const band: Record<string, { lo: number; hi: number }> = {};
  const downside: Record<string, string> = {};
  event.choices.forEach((choice) => {
    downside[choice.id] = choiceDownside(state, choice);
    if (choice.field && read) {
      // The honest projection: run the believed edge (± the Navigator's
      // uncertainty) through the SAME resolution the decision will get, so the
      // band always brackets the realised outcome and never shows false
      // precision. Rounded outward so the bracket survives display rounding.
      const project = (edge: number): number => {
        // Mirror the resolution exactly: the raw field delta is signed (a gain
        // when the read is good), and the Tactician's forgiveness eases a COST
        // only — it never scales a gain, so the band brackets the realised swing.
        const raw = resolveFieldDelta(choice, Math.max(-1, Math.min(1, edge)));
        const extra = realisedDecisionHours(raw > 0 ? raw * (1 - forgive) : raw);
        return stretchNm / Math.max(baseHours + extra, 0.2);
      };
      const hw = edgeHalfWidth(read.reliable);
      const a = project(read.edge - hw); // pessimistic (lowest VMG)
      const b = project(read.edge + hw); // optimistic
      const lo = Math.floor(Math.min(a, b) * 10) / 10;
      const hi = Math.ceil(Math.max(a, b) * 10) / 10;
      band[choice.id] = { lo, hi };
      after[choice.id] = Math.round(((lo + hi) / 2) * 10) / 10;
    } else {
      // Non-field choices keep the exact authored preview.
      const projHours = Math.max(baseHours + choice.timeDelta, 0.2);
      after[choice.id] = Math.round((stretchNm / projHours) * 10) / 10;
    }
  });
  return {
    before: Math.round(smg * 10) / 10,
    after,
    band: hasField ? band : undefined,
    confidence: read?.reliable,
    downside,
  };
}

// ---- Simulation ----

interface Advance {
  pos: GeoPoint;
  heading: number;
  route: GeoPoint[];
  passed: GeoPoint[]; // intermediate route vertices crossed this tick (detour corners)
}

// Does the path from `from` through any detour corners to `pos` cross land or end
// on it? The exact set of segments the trail will draw this tick.
function pathHitsLand(
  from: GeoPoint,
  passed: GeoPoint[],
  pos: GeoPoint,
  land?: LandPolygon[]
): boolean {
  if (!land) return false;
  let a = from;
  for (const corner of passed) {
    if (segmentCrossesLand(land, a, corner)) return true;
    a = corner;
  }
  return segmentCrossesLand(land, a, pos) || pointInLand(land, pos.lat, pos.lon);
}

// Fool-proof land avoidance at the movement layer: find a clear step of `dist`
// from `from`, fanning out from the desired bearing until the step stays in the
// water. The boat steers *around* land rather than ever tracing a line across it,
// so no imperfection in the planned route can put the boat (or its trail) ashore.
// Returns null only if every direction is blocked (open-water boats never are).
function clearStep(
  from: GeoPoint,
  desiredBearing: number,
  dist: number,
  land: LandPolygon[]
): GeoPoint | null {
  const fan = [0, 18, -18, 36, -36, 55, -55, 75, -75, 100, -100, 130, -130, 160, -160, 180];
  for (const delta of fan) {
    const cand = movePoint(from.lat, from.lon, (desiredBearing + delta + 360) % 360, dist);
    if (!pointInLand(land, cand.lat, cand.lon) && !segmentCrossesLand(land, from, cand)) return cand;
  }
  return null;
}

// Walk `distNm` along the remaining route, returning the new position, the
// heading of the segment we end on, the trimmed remaining route, and any
// intermediate route vertices crossed — so the trail can follow the route's
// detour corners instead of cutting straight across them (and over land).
function advanceAlongRoute(route: GeoPoint[], distNm: number): Advance {
  const pts = route.map((p) => ({ ...p }));
  const passed: GeoPoint[] = [];
  let remaining = distNm;
  while (remaining > 1e-9 && pts.length > 1) {
    const segLen = haversineNm(pts[0].lat, pts[0].lon, pts[1].lat, pts[1].lon);
    if (segLen <= remaining + 1e-9 || segLen < 1e-9) {
      remaining -= segLen;
      pts.shift();
      if (pts.length > 1) passed.push({ lat: pts[0].lat, lon: pts[0].lon }); // reached an intermediate corner
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
  return { pos: pts[0], heading, route: pts, passed };
}

function appendTrail(trail: GeoPoint[], points: GeoPoint[]): GeoPoint[] {
  const next = [...trail, ...points];
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

  // The sail auto-helm runs FIRST: draw-free and null on manual/undefined (the
  // golden path), so a manual race never reaches `resolveSailChange` and the
  // stream is byte-identical. A committed call runs the UNCHANGED
  // `resolveSailChange` (its two seeded draws) and the rest of the tick sails
  // the post-change state (`src`) — its progress/condition/fleet threaded in,
  // the unchanged weather/windField/tidalField still read off `state`.
  let src = state;
  let autoSailChange: DecisionResolution | undefined;
  const autoId = autoSailTarget(state);
  if (autoId) {
    const changed = resolveSailChange(state, autoId);
    if (changed) {
      autoSailChange = changed.resolution;
      src = {
        ...state,
        // Tally the auto-helm's share of the change count (engine-inert — only
        // the debrief reads it). `resolveSailChange` already stamped
        // `lastSailChangeNm` and bumped `sailChanges`.
        progress: {
          ...changed.progress,
          sailChangesAuto: (changed.progress.sailChangesAuto ?? 0) + 1,
        },
        condition: changed.condition,
        fleet: changed.fleet,
      };
    }
  }

  const marks = race.waypoints;
  const field = state.windField;
  const prev = src.progress!;
  const total = prev.totalDistanceNm;
  const strategy = strategyOf(state);
  const wearMul = EFFORT_WEAR[strategy.effort];
  // Provisioning resilience: spares blunt hull wear, safety gear softens the
  // weather's bite (and, in decisions, the odds of a mishap).
  const prov = provisioningPlan(state.provisions, state.selectedCrewIds.length, race);

  const wind = sampleWind(field, prev.lat, prev.lon, prev.elapsedHours);
  const skillMul = crewSkillFactor(crewSkillAverage(state.selectedCrewIds));
  // The flown sail's live multiplier — computed off the same heading/wind the
  // polar reads. With no specialist up it is exactly 1, and the speed maths is
  // byte-identical to the pre-wardrobe engine. Speed starts from the BASE
  // polar (`speedBoatFor`) — the rigged planner's boat would count the sail
  // twice.
  const flown = flownSpecialist(prev);
  const twaNow = angularDelta(prev.heading, wind.fromDeg);
  const sailMul = flownSailMul(flown, twaNow, wind.speedKn);
  const speedBoat = speedBoatFor(state) ?? boat;
  const baseSpeed = boatSpeedFor(
    speedBoat,
    src.condition,
    prev.heading,
    wind,
    EFFORT_SPEED[strategy.effort],
    skillMul,
    sailMul
  );
  // The start's lasting bite: a clean-/dirty-air speed multiplier from the start
  // sequence, fading linearly back to neutral over the opening leg (`startFadeNm`).
  // A great start carries you clear; a buried one bleeds the first beat.
  const startMul =
    prev.startFadeNm && prev.startFadeNm > 0 && prev.startSpeedMul && prev.startSpeedMul !== 1
      ? prev.startSpeedMul + (1 - prev.startSpeedMul) * clamp(prev.distanceCoveredNm / prev.startFadeNm, 0, 1)
      : 1;
  const speed = baseSpeed * startMul;
  // Through-water time for this step: the boat sails `stepNm` along its route at
  // its polar speed. Tide is folded in below as a made-good rate, NOT as a 2-D
  // drift — so the boat never leaves its land-routed track and a stream can't push
  // it onto the coast (the recurring over-land bug).
  const dtBase = stepNm / Math.max(speed, 0.3);

  const adv = advanceAlongRoute(prev.route, stepNm);
  // Fool-proof land guard: the boat advances along its planned route, but if that
  // route (or its detour corners) would trace a segment across land — a clip the
  // weather router occasionally leaves on an intricate coast — replace this step
  // with a single clear step that steers around the obstacle in the water, and
  // force an immediate re-route. The boat (and its trail) can therefore never
  // cross land, whatever the route quality.
  let forceReroute = false;
  const landMass = LANDMASSES[race.id];
  if (landMass && pathHitsLand({ lat: prev.lat, lon: prev.lon }, adv.passed, adv.pos, landMass)) {
    const aim = adv.route.length > 1 ? adv.route[1] : adv.pos;
    const desired = bearing(prev.lat, prev.lon, aim.lat, aim.lon);
    const from = { lat: prev.lat, lon: prev.lon };
    const steered =
      clearStep(from, desired, stepNm, landMass) ??
      clearStep(from, desired, stepNm * 0.5, landMass) ??
      clearStep(from, desired, stepNm * 0.25, landMass);
    if (steered) {
      // Steer around the obstacle in open water and replan from there.
      adv.pos = steered;
      adv.passed = [];
      forceReroute = true;
    }
    // else: genuinely boxed (a channel the coarse coastline shows as closed) —
    // keep the route advance so the boat never stalls; can't do better here.
  }
  // Universal backstop: whatever happened above, the boat's position is never left
  // on land (e.g. a boxed sub-resolution channel) — snap it to the nearest water.
  if (landMass) {
    const safe = snapToWater(landMass, adv.pos.lat, adv.pos.lon);
    adv.pos.lat = safe.lat;
    adv.pos.lon = safe.lon;
  }

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

  // Tide as a made-good rate over the ground: a fair stream speeds the boat's
  // progress along the course, a foul one slows it — scaled to the course made
  // good this step (`dGeom`), NOT the tack-inflated route distance, so its effect
  // stays the same size as the fleet's (which drifts its course progress) and the
  // standings stay fair. Because it only adjusts *time*, the boat stays exactly on
  // its land-routed track. Capped so a foul stream slows but can't stall the boat.
  const tideMark = marks[Math.min(prev.nextMarkIndex, marks.length - 1)];
  const courseToMark = brg(prev, tideMark);
  const tide = tideAlong(state.tidalField, prev.lat, prev.lon, prev.elapsedHours, courseToMark);
  const tideCourse = tide * dtBase; // course nm the stream adds (+) / removes (−) this step
  const dtHours = dGeom > 1e-6 ? dtBase * (dGeom / Math.max(dGeom + tideCourse, dGeom * 0.2)) : dtBase;
  const elapsedHours = prev.elapsedHours + dtHours;

  // Wear accrues with geometric progress, so `df` sums to ~1 over a whole race
  // regardless of its length. The coefficients are therefore "points lost over a
  // full race" at this weather/effort. They're tuned so a sensibly sailed race
  // (cruise, conservative calls) comfortably finishes even in heavy weather —
  // wear bites, but it's the player's risky decisions (below) that actually
  // threaten the boat. Tiredness slows the boat (conditionFactor) rather than
  // ending the race; only a destroyed hull forces a retirement.
  const weather = weatherFromWind(wind);
  // Safety gear takes the edge off the weather-driven wear; spares specifically
  // protect the hull.
  const riskMul = 1 - prov.safety;
  const condition: BoatCondition = {
    crewStamina: clamp(src.condition.crewStamina - df * (28 + weather.riskModifier * 45 * riskMul) * wearMul),
    crewMorale: clamp(src.condition.crewMorale - df * (10 + weather.riskModifier * 40 * riskMul)),
    hullIntegrity: clamp(
      src.condition.hullIntegrity -
        df * (6 + weather.riskModifier * 40 * riskMul) * wearMul * (1 - prov.hullWearResist)
    ),
  };

  // A retirement is a broken boat, not an exhausted crew — baseline wear alone
  // can't end a race, but compounding hull damage from gambles can.
  const retired = condition.hullIntegrity <= 0;
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
    forceReroute || // the boat had to steer around a land clip — replan a clean route now
    rounded ||
    route.length < 2 ||
    biasChanged ||
    (shifted && movedSincePlan > total * 0.03) ||
    movedSincePlan > total * 0.1;
  if (!finished && !retired && nextMarkIndex < marks.length && wantReroute) {
    route = planRoute(boat, field, adv.pos, marks, nextMarkIndex, elapsedHours, strategy.bias, LANDMASSES[race.id]);
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
    trail: appendTrail(prev.trail, [...adv.passed, adv.pos]),
    routeWindDir,
    routePlannedAtNm,
    routeBias,
    windDir: wind.fromDeg,
    windSpeedKn: wind.speedKn,
    // Running peak of the true wind this race — a draw-free Math.max (no RNG, no
    // chance branch), writing a brand-new field absent from the golden summary,
    // so it cannot move a pinned stream.
    peakWindKn: Math.max(prev.peakWindKn ?? 0, wind.speedKn),
    nextDecisionAtNm: prev.nextDecisionAtNm,
    decisionsTaken: prev.decisionsTaken,
    shownEventIds: prev.shownEventIds ?? [],
    // Record this tick's instruments so a decision can show the leg's trend.
    readings: appendReading(prev.readings ?? [], {
      atNm: distanceCoveredNm,
      hours: elapsedHours,
      windDir: wind.fromDeg,
      windSpeedKn: wind.speedKn,
      speedKn: speed,
      position: prev.position,
    }),
    legStartNm: prev.legStartNm ?? 0,
    startSpeedMul: prev.startSpeedMul,
    startFadeNm: prev.startFadeNm,
    signatureFired: prev.signatureFired,
    signatureChoiceId: prev.signatureChoiceId,
    decisionTriggerNm: prev.decisionTriggerNm,
    // A choice-opened situation expires once the boat has sailed past its
    // window — the reef question answers itself, the moment is gone.
    pendingSituation:
      prev.pendingSituation && distanceCoveredNm < prev.pendingSituation.expiresAtNm
        ? prev.pendingSituation
        : undefined,
    // The flown sail rides along unchanged — only the picker and event choices
    // write it.
    activeSailId: prev.activeSailId,
    sailChanges: prev.sailChanges,
    sailChangesAuto: prev.sailChangesAuto,
    sailChangesFumbled: prev.sailChangesFumbled,
    unavailableSails: prev.unavailableSails,
    lastSailChangeNm: prev.lastSailChangeNm,
    sailFracTotal: prev.sailFracTotal,
    sailFracRight: prev.sailFracRight,
  };

  // Right-sail bookkeeping: was the best canvas aboard actually up this tick?
  // Weighted by geometric progress like wear (sums toward ~1 over the race),
  // and only measured when the boat carries specialists worth choosing. Pure
  // arithmetic — no RNG, no speed effect — so the default path stays
  // byte-identical.
  const wardrobe = raceWardrobe(speedBoat).filter(
    (s) => !prev.unavailableSails?.includes(s.id)
  );
  if (df > 0 && wardrobe.some((s) => s.boost > 0)) {
    const best = bestWardrobeMul(wardrobe, twaNow, wind.speedKn);
    progress.sailFracTotal = (prev.sailFracTotal ?? 0) + df;
    progress.sailFracRight = (prev.sailFracRight ?? 0) + (sailMul >= best - 0.005 ? df : 0);
  }

  // Advance the AI fleet through the same elapsed time, wind and tide, then rank.
  // The fleet feels the same stream as the player (paced off a tide-free
  // benchmark), so tide cancels in the standings and only sailing it better wins.
  const fleet = advanceFleet(src.fleet ?? [], race, field, prev.elapsedHours, dtHours, state.tidalField);
  progress.position = finished
    ? finalPosition(fleet, elapsedHours)
    : livePosition(fleet, distanceCoveredNm);

  // A docked, unanswered opportunity rides on `decisionTriggerNm` (the cockpit
  // keeps ticking while its cards sit in the lane). While it is live NO fresh
  // event is drawn — one moment at a time — and crucially nothing here consumes
  // or skips a draw: on the immediate-resolve path (decide on the fire tick,
  // as the golden races do) `applyDecision` has already spent the trigger
  // before the next tick, so this gate never engages and the RNG stream is
  // byte-identical. Once the boat has sailed the edge out (edgeDecay below
  // EDGE_SPENT) the moment expires: draw-free, no deltas, the fired slot
  // handed back — see `expireDecision`, whose clearing this mirrors.
  let eventExpired = false;
  if (
    progress.decisionTriggerNm !== undefined &&
    distanceCoveredNm - progress.decisionTriggerNm >= decisionExpiryNm(total)
  ) {
    progress.decisionTriggerNm = undefined;
    progress.decisionsTaken = Math.max(progress.decisionsTaken - 1, 0);
    eventExpired = true;
  }
  const eventPending = progress.decisionTriggerNm !== undefined;

  // Decision scheduling. The signature hazard is a set-piece tied to its mark —
  // it fires as the boat reaches that waypoint, once per race. Everyday calls
  // are drawn on the usual geometric cadence, never repeating until exhausted.
  let event: GameEvent | null = null;
  const canDecide =
    !finished && !retired && !eventPending && progress.decisionsTaken < MAX_DECISIONS;
  // Fit the everyday draw to the moment: the race's waters, the live breeze band
  // and how far through the passage we are. The picker only *prefers* matching
  // events (it always falls back to the flat pool), so this shapes flavour, not
  // the deterministic single-pick contract.
  // A live pending situation (from an earlier choice) is offered to the picker
  // so a matching follow-on event is preferred; with none the picker's path is
  // exactly what it always was.
  const pendingKey = progress.pendingSituation?.key;
  const decisionContext = {
    raceId: race.id,
    band: conditionBand(wind.speedKn),
    phase: racePhase(distanceCoveredNm, total),
    pending: pendingKey,
  };
  const hazardEvent = hazardEventForRace(race);
  const hazardId = hazardEvent.id;
  // A storied race pins its signature decision to a named mark and guarantees it
  // exactly once via the `signatureFired` latch on progress; an un-storied race
  // keeps the original behaviour untouched (gated on shownEventIds), so its
  // stepRace output stays byte-identical and deterministic.
  const story = storylineForRace(race.id);
  const pinName = story ? hazardEvent.pinToWaypoint : undefined;
  const pinnedMark = pinName ? marks.find((m) => m.name === pinName) : undefined;
  const hazardMark = marks.find((m) => m.name === race.hazardWaypoint);
  const nearHazard =
    hazardMark !== undefined &&
    haversineNm(adv.pos.lat, adv.pos.lon, hazardMark.lat, hazardMark.lon) <
      Math.max(total * 0.07, stepNm * 3);
  // Has the boat reached/passed the pinned mark? It's pinned by name, so the
  // trigger fires the first tick the boat is within striking distance of it OR
  // has already rounded past it (so a fast step that overshoots can't skip it).
  const reachedPinned =
    pinnedMark !== undefined &&
    (haversineNm(adv.pos.lat, adv.pos.lon, pinnedMark.lat, pinnedMark.lon) <
      Math.max(total * 0.07, stepNm * 3) ||
      nextMarkIndex > marks.indexOf(pinnedMark));

  if (canDecide && pinnedMark !== undefined) {
    // Storied race: fire the pinned signature decision once, at its mark.
    if (!progress.signatureFired && reachedPinned) {
      event = hazardEvent;
      progress.signatureFired = true;
      progress.decisionsTaken += 1;
      progress.shownEventIds = [...progress.shownEventIds, event.id];
      progress.nextDecisionAtNm =
        distanceCoveredNm + rndRange(DECISION_MIN, DECISION_MAX) * total;
    } else if (distanceCoveredNm >= prev.nextDecisionAtNm) {
      // Suppress the generic draw on the signature tick (the branch above), but
      // otherwise the everyday cadence runs as normal — never drawing the
      // signature hazard (the picker excludes it).
      progress.decisionsTaken += 1;
      progress.nextDecisionAtNm =
        distanceCoveredNm + rndRange(DECISION_MIN, DECISION_MAX) * total;
      event = pickEventForRace(progress.shownEventIds, progress.pointOfSail, decisionContext);
      progress.shownEventIds = [...progress.shownEventIds, event.id];
    }
  } else if (canDecide && nearHazard && !progress.shownEventIds.includes(hazardId)) {
    event = hazardEvent;
    progress.decisionsTaken += 1;
    progress.shownEventIds = [...progress.shownEventIds, event.id];
    progress.nextDecisionAtNm =
      distanceCoveredNm + rndRange(DECISION_MIN, DECISION_MAX) * total;
  } else if (canDecide && distanceCoveredNm >= prev.nextDecisionAtNm) {
    progress.decisionsTaken += 1;
    progress.nextDecisionAtNm =
      distanceCoveredNm + rndRange(DECISION_MIN, DECISION_MAX) * total;
    // Only the pending situation is offered here (the un-storied path is
    // otherwise context-free): with none live this is byte-identical to the
    // plain draw, so legacy behaviour is untouched.
    event = pickEventForRace(progress.shownEventIds, progress.pointOfSail, { pending: pendingKey });
    progress.shownEventIds = [...progress.shownEventIds, event.id];
  }
  if (event) {
    // Anchor the read: a field-resolved call's edge decays with distance sailed
    // past this point, so a commitment delayed is a commitment diminished.
    progress.decisionTriggerNm = distanceCoveredNm;
    // A drawn follow-on consumes its situation — the story beat is spent.
    if (event.followsFrom) progress.pendingSituation = undefined;
  }

  let log: string | undefined;
  if (retired) {
    log = `Forced to retire in ${weather.label.toLowerCase()} after the boat took too much punishment.`;
  } else if (finished) {
    log = `Crossed the finish line at ${race.name}.`;
  } else if (eventExpired) {
    log = DECISION_EXPIRED_LOG;
  } else if (rounded && marks[nextMarkIndex - 1]) {
    log = `Rounded ${marks[nextMarkIndex - 1].name} — ${weather.label}, ${progress.pointOfSail.toLowerCase()}.`;
  }
  // Surface the auto-helm's peel on the ship's log when nothing louder happened
  // this tick (a finish / retirement / rounding line still takes the slot).
  if (log === undefined && autoSailChange) log = autoSailChange.summary;

  return {
    progress,
    condition,
    weather,
    fleet,
    event,
    log,
    finished,
    retired,
    eventExpired,
    autoSailChange,
  };
}

// The odds the crew fumbles this call, pure and inspectable. On top of the
// long-standing model (morale/push pressure, crew-average steadiness, safety
// gear), the roster's specialists earn scoped relief: a tagged sail-handling
// choice leans on its Bowman/Trimmer, and the Skipper takes a small edge off
// heavy-weather (broach/seaway) risk — nothing else. The floor caps the TOTAL
// relief: however stacked the crew and kit, a call never drops below half its
// authored risk, so a dream team tunes the odds rather than deleting them.
const HANDS_RELIEF_MAX = 0.12; // the specialist's shave on a tagged manoeuvre
const SKIPPER_RELIEF_MAX = 0.05; // the skipper's trim on heavy-weather risk
const SKIPPER_RISK_REF = 0.24; // weather riskModifier at which the skipper fully earns it
const BUNGLE_FLOOR_FRACTION = 0.5; // relief cap: never below half the authored risk
export function decisionBungleChance(state: GameState, choice: TacticalChoice): number {
  const race = getRaceById(state.selectedRaceId);
  const ids = state.selectedCrewIds;
  const safety = race ? provisioningPlan(state.provisions, ids.length, race).safety : 0;
  const moralePenalty = state.condition.crewMorale < 40 ? 0.1 : 0;
  const pushPenalty = strategyOf(state).effort === 'push' ? 0.05 : 0;
  const skillRelief = ((crewSkillAverage(ids) - 50) / 100) * 0.12;
  const safetyRelief = safety * 0.2;
  const handsRelief = choice.crewSkill ? roleRelief(ids, choice.crewSkill, HANDS_RELIEF_MAX) : 0;
  const riskMod = state.weather?.riskModifier ?? 0;
  const skipperRelief =
    roleRelief(ids, 'Skipper', SKIPPER_RELIEF_MAX) * Math.min(1, riskMod / SKIPPER_RISK_REF);
  return Math.max(
    choice.risk * BUNGLE_FLOOR_FRACTION,
    choice.risk + moralePenalty + pushPenalty - skillRelief - safetyRelief - handsRelief - skipperRelief
  );
}

// Who owns the fumble, for a debrief line that's true to the manoeuvre.
function fumbleClause(choice: TacticalChoice): string {
  if (choice.crewSkill === 'Bowman') return 'the bowman fumbled the change';
  if (choice.crewSkill === 'Trimmer') return 'the trimmer lost the shape of it';
  return 'the crew made a hash of it';
}

// One causally-true debrief line for the race log — built from what actually
// resolved (the edge, the fumble, the realised cost), never canned flavour.
function resolutionSummary(
  choice: TacticalChoice,
  paidOff: boolean | undefined,
  effEdge: number,
  bungled: boolean,
  lostHours: number
): string {
  const cost = lostHours >= 1 / 60 ? ` (~${Math.round(lostHours * 60)}m lost)` : '';
  const fumble = fumbleClause(choice);
  if (bungled) {
    if (choice.field && paidOff === false) return `Phantom corner — and ${fumble}${cost}.`;
    return `${fumble.charAt(0).toUpperCase()}${fumble.slice(1)}${cost}.`;
  }
  if (choice.field) {
    if (paidOff) return 'Read it right — you banked the shift.';
    if (effEdge > 0.05) return `The shift came soft and late — a wash, near enough${cost}.`;
    return `Phantom corner — the breeze never came${cost}.`;
  }
  return `${choice.label}.`;
}

// Apply the player's choice to the active decision (no distance is sailed),
// then resolve the gamble and any resulting retirement.
export function applyDecision(state: GameState, choice: TacticalChoice): StepResult {
  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  if (!race || !boat || !state.progress || !state.weather) {
    throw new Error('Cannot apply a decision outside a race.');
  }

  // An authored choice can leave a sail flying (the kite call, the storm-jib
  // change): it writes the SAME `activeSailId` the manual picker does — one
  // flown sail, one field, no divergence. Deterministic (no draw here; the
  // manoeuvre's chance already lives in this decision's own bungle roll), and
  // ignored if the boat doesn't carry the sail.
  let nextSailId = state.progress.activeSailId;
  let sailChanges = state.progress.sailChanges;
  if (choice.setsSail) {
    const targetId = isWorkingSail(choice.setsSail) ? undefined : choice.setsSail;
    const carried =
      targetId === undefined || availableWardrobe(state).some((s) => s.id === targetId);
    if (carried && targetId !== (flownSpecialist(state.progress)?.id ?? undefined)) {
      nextSailId = targetId;
      sailChanges = (sailChanges ?? 0) + 1;
    }
  }

  let stamina = state.condition.crewStamina + choice.staminaDelta;
  let morale = state.condition.crewMorale + choice.moraleDelta;
  let hull = state.condition.hullIntegrity + choice.hullDelta;
  // A bold, field-resolved call pays off only if the wind actually supports it.
  // Read it right (a real shift/pressure to exploit) and it GAINS time — you pull
  // clear of the safe option, which only ever bleeds a little. Read it wrong and
  // you've banged a phantom corner: real time lost (a sharp Tactician bails early
  // and gives some of it back — costs only, never a gain), and the crew feels it.
  // The conservative option keeps its authored, dependable outcome.
  let extraHours = choice.timeDelta;
  let paidOff: boolean | undefined;
  const effEdge = effectiveTacticalEdge(state); // ~[-0.25, 1], decayed if committed late
  if (choice.field) {
    paidOff = effEdge >= EDGE_SEND;
    extraHours = resolveFieldDelta(choice, effEdge);
    if (extraHours > 0) extraHours *= 1 - misreadForgiveness(state.selectedCrewIds);
    morale += paidOff ? 2 : -3;
  }

  // A demoralized crew — or a boat being pushed hard — is more likely to bungle;
  // steady hands (the crew average, the tagged specialist, the skipper in a
  // blow) and safety gear shave the odds — see `decisionBungleChance`.
  const prov = provisioningPlan(state.provisions, state.selectedCrewIds.length, race);
  const bungleChance = decisionBungleChance(state, choice);
  const bungled = rnd() < bungleChance;
  if (bungled) {
    extraHours += 0.3 + state.weather.riskModifier * 0.5;
    hull -= 6 * (1 - prov.hullWearResist);
    morale -= 4;
  } else if (choice.risk > 0.15) {
    morale += 2;
  }

  const condition: BoatCondition = {
    crewStamina: clamp(stamina),
    crewMorale: clamp(morale),
    hullIntegrity: clamp(hull),
  };

  const lostHours = realisedDecisionHours(extraHours);
  // If this decision was the storied race's signature set-piece, record which
  // choice was taken so the debrief can pick its matching beat. Detected by the
  // choice belonging to the race's pinned hazard event — purely from the choice,
  // so it needs no extra plumbing through the context.
  const story = storylineForRace(race.id);
  const hazardEvent = hazardEventForRace(race);
  const isSignatureChoice =
    !!story &&
    !!hazardEvent.pinToWaypoint &&
    hazardEvent.choices.some((c) => c.id === choice.id);
  const progress: RaceProgress = {
    ...state.progress,
    // lostHours is now signed (a good read credits time); the floor is belt-and-
    // braces — elapsed is always ≫ the cap by the time a decision fires.
    elapsedHours: Math.max(0, state.progress.elapsedHours + lostHours),
    // Start a fresh leg from here, keeping the latest sample as its baseline so
    // the next decision's "this leg" trend measures from this point.
    legStartNm: state.progress.distanceCoveredNm,
    readings: (state.progress.readings ?? []).slice(-1),
    signatureChoiceId: isSignatureChoice ? choice.id : state.progress.signatureChoiceId,
    // The decision is resolved: the trigger point is spent (a fresh event will
    // set its own), and if this choice leaves the boat in a situation (a tucked
    // reef, a big kite up), open the follow-on window from here.
    decisionTriggerNm: undefined,
    pendingSituation: choice.sets
      ? {
          key: choice.sets,
          expiresAtNm:
            state.progress.distanceCoveredNm +
            state.progress.totalDistanceNm * SITUATION_WINDOW_FRACTION,
        }
      : state.progress.pendingSituation,
    activeSailId: nextSailId,
    sailChanges,
    // A committed sail set (the kite call, the storm-jib change) stamps the same
    // dwell clock the manual picker and auto-helm write.
    lastSailChangeNm:
      sailChanges !== state.progress.sailChanges
        ? state.progress.distanceCoveredNm
        : state.progress.lastSailChangeNm,
  };

  // While the player handles the decision, the fleet sails on — a costly call
  // can drop you down the standings.
  const fleet = state.windField
    ? advanceFleet(state.fleet ?? [], race, state.windField, state.progress.elapsedHours, lostHours, state.tidalField)
    : (state.fleet ?? []);
  progress.position = livePosition(fleet, progress.distanceCoveredNm);

  // Only a destroyed hull ends the race (see stepRace); an exhausted crew just
  // sails slowly.
  const retired = condition.hullIntegrity <= 0;
  // The typed truth of how the call resolved, in the storyline's bold/safe/
  // hedge vocabulary, plus the one debrief line the race log shows.
  const outcome: SignatureOutcome = choice.field ? 'bold' : choice.risk <= 0.12 ? 'safe' : 'hedge';
  const resolution: DecisionResolution = {
    outcome,
    paidOff,
    bungled,
    lostHours,
    summary: resolutionSummary(choice, paidOff, effEdge, bungled, lostHours),
  };
  return {
    progress,
    condition,
    weather: state.weather,
    fleet,
    event: null,
    log: resolution.summary,
    finished: false,
    retired,
    resolution,
  };
}

// ---- Sail changes ----

// Manoeuvre time by the canvas going up (hours): a headsail peel is quick, a
// kite set slower, storm canvas slowest of all. Dousing back to the working set
// is a headsail-speed job. Tuned — with the wrong-sail penalty and the fumble
// recovery below — to the balance target: a well-managed race podiums off the
// wardrobe's edge; a mismanaged one bleeds places, not the boat.
const SAIL_CHANGE_HOURS: Record<SailCategory, number> = {
  headsail: 0.035,
  reacher: 0.05,
  spinnaker: 0.06,
  stormsail: 0.07,
};
// The authored risk of any change (fed through `decisionBungleChance`, so the
// Bowman's relief, the crew average, safety gear and the half-risk floor all
// apply exactly as they do to a tagged decision — the bow owns the manoeuvre).
const SAIL_CHANGE_BASE_RISK = 0.1;
// A sharp Trimmer shortens the recovery from a fumbled change (they get shape
// back on the new sail fast); capped like every other relief.
const SAIL_RECOVERY_TRIMMER_MAX = 0.35;
// A single change can cost minutes, never the race.
const SAIL_CHANGE_CAP_H = 0.5;
// Above this breeze a fumbled specialist hoist can destroy the sail outright.
const HEAVY_AIR_KN = 25;
const BLOWOUT_CHANCE = 0.5;

// The picker's honest cost line: what this hoist takes in minutes, clean.
export function sailChangeMinutes(sail?: Sail): number {
  return Math.round(SAIL_CHANGE_HOURS[sail?.category ?? 'headsail'] * 60);
}

// Which sail categories keep a choice-opened situation honest: a manual change
// away from the category contradicts the story (the big kite came down), so
// the pending follow-on is quietly cleared rather than asked about a sail that
// is no longer up.
const SAIL_SITUATIONS: Record<string, SailCategory[]> = {
  'big-kite': ['spinnaker', 'reacher'],
};

// Commit a manual sail change. Pure given the RNG; draws EXACTLY two seeded
// rolls (the bungle, then the blow-out) and ONLY on a committed distinct
// change — a re-select of the flying sail, an unknown id or a blown-out sail
// returns null without touching the stream, so a zero-change race is
// byte-identical to one with the picker never opened. No distance is sailed;
// the manoeuvre costs time, the fleet sails on through it.
export function resolveSailChange(state: GameState, sailId: string): StepResult | null {
  const race = getRaceById(state.selectedRaceId);
  if (!race || !state.progress || !state.weather) return null;
  const prev = state.progress;

  const hoisted = isWorkingSail(sailId) ? undefined : getSailById(sailId);
  if (!isWorkingSail(sailId) && !hoisted) return null; // unknown sail
  if (hoisted && !availableWardrobe(state).some((s) => s.id === hoisted.id)) return null;
  const current = flownSpecialist(prev);
  if ((hoisted?.id ?? undefined) === (current?.id ?? undefined)) return null; // same sail — no-op

  // The two seeded rolls, in a fixed order so the stream shape never depends on
  // the branch taken.
  const synthetic: TacticalChoice = {
    id: 'sail-change',
    label: 'Sail change',
    description: '',
    timeDelta: 0,
    staminaDelta: 0,
    moraleDelta: 0,
    hullDelta: 0,
    risk: SAIL_CHANGE_BASE_RISK,
    crewSkill: 'Bowman',
  };
  const bungled = rnd() < decisionBungleChance(state, synthetic);
  const blowRoll = rnd();

  const prov = provisioningPlan(state.provisions, state.selectedCrewIds.length, race);
  const trimmer = roleRelief(state.selectedCrewIds, 'Trimmer', SAIL_RECOVERY_TRIMMER_MAX);
  const cost = SAIL_CHANGE_HOURS[hoisted?.category ?? 'headsail'];
  const recovery = bungled ? (0.15 + state.weather.riskModifier * 0.45) * (1 - trimmer) : 0;
  const lostHours = Math.min(cost + recovery, SAIL_CHANGE_CAP_H);

  const heavy = prev.windSpeedKn >= HEAVY_AIR_KN;
  const blown = bungled && heavy && !!hoisted && blowRoll < BLOWOUT_CHANCE;

  const condition: BoatCondition = {
    crewStamina: clamp(state.condition.crewStamina - 2),
    crewMorale: clamp(state.condition.crewMorale + (bungled ? -3 : 0)),
    hullIntegrity: clamp(
      state.condition.hullIntegrity - (bungled ? 2 * (1 - prov.hullWearResist) : 0)
    ),
  };

  // A change that contradicts a live choice-opened situation clears it — the
  // moment the story was about is over.
  let pendingSituation = prev.pendingSituation;
  if (pendingSituation) {
    const wanted = SAIL_SITUATIONS[pendingSituation.key];
    if (wanted && (!hoisted || !wanted.includes(hoisted.category))) {
      pendingSituation = undefined;
    }
  }

  const progress: RaceProgress = {
    ...prev,
    elapsedHours: prev.elapsedHours + lostHours,
    activeSailId: blown ? undefined : hoisted?.id,
    sailChanges: (prev.sailChanges ?? 0) + 1, // committed — even a fumble drops the old sail
    sailChangesFumbled: (prev.sailChangesFumbled ?? 0) + (bungled ? 1 : 0),
    unavailableSails: blown
      ? [...(prev.unavailableSails ?? []), hoisted!.id]
      : prev.unavailableSails,
    // Stamp the dwell clock (shared by the auto-helm's anti-flap gate) on every
    // committed change, manual or auto.
    lastSailChangeNm: prev.distanceCoveredNm,
    pendingSituation,
  };

  // The fleet sails on while the crew wrestles canvas.
  const fleet = state.windField
    ? advanceFleet(state.fleet ?? [], race, state.windField, prev.elapsedHours, lostHours, state.tidalField)
    : (state.fleet ?? []);
  progress.position = livePosition(fleet, progress.distanceCoveredNm);

  const minutes = Math.max(1, Math.round(lostHours * 60));
  let summary: string;
  if (blown) {
    summary = `Sent up the ${hoisted!.name} in ${Math.round(prev.windSpeedKn)} knots and the bowman fumbled the change — it blew out. Working sails the rest of the way (~${minutes}m lost).`;
  } else if (bungled) {
    summary = hoisted
      ? `Peeled to the ${hoisted.name} — the bowman fumbled the change (~${minutes}m lost).`
      : `Doused back to working sails — a slow, messy drop (~${minutes}m lost).`;
  } else {
    summary = hoisted
      ? `Peeled to the ${hoisted.name} — a clean change.`
      : `Doused back to working sails.`;
  }

  const resolution: DecisionResolution = {
    outcome: 'safe',
    bungled,
    lostHours,
    summary,
  };
  return {
    progress,
    condition,
    weather: state.weather,
    fleet,
    event: null,
    log: summary,
    finished: false,
    retired: false,
    resolution,
  };
}

// ---- Results ----

// A boat's handicap rating (corrected time = elapsed × TCC). Catalogue boats
// carry an explicit authored rating (kept as a designer override); everything
// else derives an ORC-style Time-on-Time rating from its own polar — a fast hull
// owes time, a cruiser is given some back, and (unlike the old `baseSpeed`-only
// guess) the boat's upwind/downwind *character* now shapes its handicap, exactly
// as an ORC VPP does. See `engine/orc.ts`.
export function ratingTccFor(boat: Boat): number {
  if (typeof boat.ratingTcc === 'number') return boat.ratingTcc;
  return orcRating(boat);
}

// Evenly thin a polyline to at most `max` points (keeping the ends), so the
// debrief track stored in a result stays small in saves.
// Perpendicular distance (in degrees, planar — fine at course scale) of `p` from
// the segment a→b. Used by Douglas–Peucker below.
function perpDistDeg(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.lon - a.lon, p.lat - a.lat);
  const t = ((p.lon - a.lon) * dx + (p.lat - a.lat) * dy) / len2;
  const cx = a.lon + t * dx;
  const cy = a.lat + t * dy;
  return Math.hypot(p.lon - cx, p.lat - cy);
}

// Douglas–Peucker: simplify a polyline by keeping the points that carry its
// shape (high deviation) and dropping near-collinear ones. Unlike uniform
// decimation it *preserves the corners*, so a coast-hugging track keeps hugging
// the coast instead of chording across a headland.
function rdp(pts: GeoPoint[], epsilon: number): GeoPoint[] {
  if (pts.length < 3) return pts;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = perpDistDeg(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= epsilon) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, idx + 1), epsilon);
  const right = rdp(pts.slice(idx), epsilon);
  return [...left.slice(0, -1), ...right];
}

// Shrink a track for storage/display while keeping it in the water: simplify
// (corner-preserving) to roughly `max` points, then run the land-aware detour so
// no surviving segment chords across land — the post-race debrief draws straight
// lines between these points, so this is what stops the saved track (and the
// optimal line) cutting over islands and headlands.
export function downsampleTrack(pts: GeoPoint[], land?: LandPolygon[], max = 48): GeoPoint[] {
  const round = (p: GeoPoint): GeoPoint => ({
    lat: Math.round(p.lat * 1e4) / 1e4,
    lon: Math.round(p.lon * 1e4) / 1e4,
  });
  let simplified = pts;
  if (pts.length > max) {
    // Grow the tolerance until we're under budget (bounded so it always ends).
    let eps = 1e-4;
    simplified = rdp(pts, eps);
    for (let guard = 0; simplified.length > max && guard < 40; guard += 1) {
      eps *= 1.6;
      simplified = rdp(pts, eps);
    }
  }
  return clearPolyline(simplified, land).map(round);
}

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
  const boat = resolveBoatById(state, state.selectedBoatId);

  // The official result is on CORRECTED time (elapsed × the boat's rating) — the
  // way offshore races are actually scored. Line-honours ("on the water") is
  // kept alongside for the drama of beating a faster boat on handicap.
  const elapsedHours = outcome.progress.elapsedHours;
  const tcc = boat ? ratingTccFor(boat) : 1;
  const correctedHours = elapsedHours * tcc;
  const onWaterPosition = retired ? division.fleetSize : outcome.progress.position;
  const position =
    retired || !finished
      ? division.fleetSize
      : correctedPosition(state.fleet ?? [], race.distanceNm, elapsedHours, tcc);

  // Finishing recoups most of your running costs (entry, wages, provisions —
  // not the one-off boat purchase); retiring forfeits them. Position prizes are
  // upside on top, so a well-sailed race is sustainable rather than a sure loss.
  const cost = campaignCost(state);
  const operating = cost.entryFee + cost.wages + cost.provisions;
  const sponsor = finished ? Math.round(operating * 0.9) : 0;
  const prizeMoney = finished ? sponsor + prizeForPosition(division, position) : 0;

  // Debrief geometry: the line you actually sailed vs the weather-optimal line,
  // and what a clean run on the optimal line would have taken — captured now,
  // while the wind field and trail are still in hand.
  let trail: GeoPoint[] | undefined;
  let optimalRoute: GeoPoint[] | undefined;
  let optimalHours: number | undefined;
  if (finished && boat && state.windField && (outcome.progress.trail?.length ?? 0) > 1) {
    const debriefLand = LANDMASSES[race.id];
    const offLand = (pts: GeoPoint[]): GeoPoint[] =>
      pts.map((p) => snapToWater(debriefLand, p.lat, p.lon));
    trail = offLand(downsampleTrack(outcome.progress.trail, LANDMASSES[race.id]));
    const start = race.waypoints[0];
    const route = planRoute(
      boat,
      state.windField,
      { lat: start.lat, lon: start.lon },
      race.waypoints,
      1,
      0,
      0,
      LANDMASSES[race.id]
    );
    optimalRoute = offLand(downsampleTrack(route, LANDMASSES[race.id]));
    optimalHours = estimateRouteHours(
      boat,
      { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 },
      route,
      state.windField,
      0,
      EFFORT_SPEED.cruise,
      crewSkillFactor(crewSkillAverage(state.selectedCrewIds))
    );
  }

  // Did handicap change the story? (e.g. 5th across the line, 1st corrected.)
  const handicapSwing = finished && !retired && onWaterPosition !== position;
  const swingNote = handicapSwing
    ? ` ${ordinal(onWaterPosition)} across the line, but ${ordinal(position)} once the handicap is applied.`
    : '';

  let summary: string;
  if (retired) {
    summary = `Forced to retire from ${race.name} after the boat took too much punishment. Every campaign has its hard lessons.`;
  } else if (position === 1) {
    summary = `Overall win on corrected time in the ${divisionName} division of ${race.name}!${swingNote || ' A flawless race — the fleet is left in your wake.'}`;
  } else if (position <= 3) {
    summary = `A podium on corrected time — ${ordinal(position)} in the ${divisionName} division of ${race.name}.${swingNote} A strong, well-sailed race.`;
  } else if (prizeMoney > 0) {
    summary = `A solid ${ordinal(position)} on corrected time in the ${divisionName} division of ${race.name}.${swingNote}`;
  } else {
    summary = `${ordinal(position)} of ${division.fleetSize} on corrected time in ${race.name}.${swingNote} Not the result you wanted — back to the drawing board.`;
  }

  // Storyline debrief: for a storied race where the signature decision was made,
  // map the chosen option to its outcome (bold/safe/hedge) and pull the matching
  // beat. Absent on un-storied races, or if the player retired before the mark.
  const story = storylineForRace(race.id);
  const signatureChoiceId = state.progress?.signatureChoiceId;
  let signatureOutcome: RaceResult['signatureOutcome'];
  let storyDebrief: string | undefined;
  if (story && signatureChoiceId) {
    signatureOutcome = signatureOutcomeFor(hazardEventForRace(race), signatureChoiceId);
    storyDebrief = debriefBeat(story, signatureOutcome)?.body;
  }

  // Finish drama facts ("The Duel"): rank the whole fleet — the player folded in —
  // on corrected time at the line, then read off the corrected winner, the
  // player's nearest neighbour, and the gap to them. Pure, read-only over the
  // existing competitor state; computed only for a genuine finish so a retirement
  // or DNF carries none of it.
  let nearestGapSeconds: number | undefined;
  let nearestRivalName: string | undefined;
  let nearestRivalAhead: boolean | undefined;
  let correctedWinnerName: string | undefined;
  if (finished && !retired) {
    const standings = correctedStandings(
      state.fleet ?? [],
      race.distanceNm,
      elapsedHours,
      tcc,
      boat?.name ?? 'Your boat'
    );
    correctedWinnerName = standings[0]?.name;
    nearestGapSeconds = nearestCorrectedGapSeconds(standings);
    const playerIdx = standings.findIndex((s) => s.isPlayer);
    if (playerIdx >= 0) {
      const player = standings[playerIdx].correctedHours;
      let best: { name: string; gap: number; ahead: boolean } | undefined;
      standings.forEach((s, i) => {
        if (i === playerIdx) return;
        const gap = Math.abs(s.correctedHours - player);
        // ahead = this boat is faster on corrected time (the player chased it).
        if (!best || gap < best.gap) best = { name: s.name, gap, ahead: s.correctedHours < player };
      });
      nearestRivalName = best?.name;
      nearestRivalAhead = best?.ahead;
    }
  }

  return {
    raceId: race.id,
    raceName: race.name,
    division: state.selectedDivision,
    boatId: state.selectedBoatId ?? '',
    finished,
    retired,
    position,
    onWaterPosition,
    fleetSize: division.fleetSize,
    elapsedHours,
    correctedHours,
    prizeMoney,
    summary,
    timestamp: Date.now(),
    trail,
    optimalRoute,
    optimalHours,
    // Peak true wind seen this race, carried onto the result for the career fold
    // (absent on the finished progress → undefined).
    peakWindKn: outcome.progress.peakWindKn,
    signatureOutcome,
    storyDebrief,
    nearestCorrectedGapSeconds: nearestGapSeconds,
    nearestRivalName,
    nearestRivalAhead,
    correctedWinnerName,
    // Sail-handling debrief: quality, not just frequency — how many changes,
    // how many fumbled, what fraction of the race was under the best canvas
    // aboard (only once enough of the race has been measured to be honest),
    // and anything blown out along the way.
    sailChanges: outcome.progress.sailChanges,
    sailChangesAuto:
      outcome.progress.sailChanges !== undefined
        ? (outcome.progress.sailChangesAuto ?? 0)
        : undefined,
    sailChangesFumbled:
      outcome.progress.sailChanges !== undefined
        ? (outcome.progress.sailChangesFumbled ?? 0)
        : undefined,
    rightSailPct:
      (outcome.progress.sailFracTotal ?? 0) > 0.2
        ? Math.round(
            (100 * (outcome.progress.sailFracRight ?? 0)) / outcome.progress.sailFracTotal!
          )
        : undefined,
    blownSails: outcome.progress.unavailableSails?.length
      ? outcome.progress.unavailableSails.map((id) => getSailById(id)?.name ?? id)
      : undefined,
    // Weather-scenario provenance: a run sailed on real model output carries
    // its stamp into history (and is thereby gated off the global leaderboard).
    scenario: state.scenario,
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

// A short corrected-time gap (the duel margins): seconds → "3m 12s", "8s",
// "1h 04m". Used by the finish debrief and the photo-finish copy.
export function formatGap(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem.toString().padStart(2, '0')}s`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s - h * 3600) / 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}
