import { CareerRecord, RaceResult } from '../types';
import { getRaceById } from '../data';
import { REGION_RACES } from '../data/onboarding';

// Push a value into a deduped list, returning a fresh array (never mutating the
// source). Keeps the SET fields honest: distinct entries, insertion order.
function withUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

// The difficulties that count as "offshore-grade" for the Corinthian honour.
const OFFSHORE_GRADE = new Set(['Offshore', 'Ocean']);

// The player's lifetime record. `state.history` is hard-capped at 50 races, so
// cumulative career stats cannot be read off it — a veteran's early races are
// discarded. This module folds each finished result FORWARD into a record that
// never truncates. It is pure and deterministic: no RNG, no Date.now(), no
// React/UI imports — so it can run in the reducer (outside the engine RNG path)
// without touching a golden pin. `stepRace`/`applyDecision` NEVER call anything
// here, which is what protects the determinism contract.

// A photo finish: won on corrected time with the nearest rival inside a minute.
export const PHOTO_FINISH_SECONDS = 60;

// A gale on the Beaufort scale is force 8 (34 kn). The race wind field caps the
// local sample at 50 kn (see wind.ts `sampleWind`); baseSpeed comes from the
// seasonal climatology (means stay under ~20 kn), so only a gale-prone hazard —
// celtic_weather (Fastnet) or bass_strait (Sydney–Hobart), speedMul 1.15 with a
// deep +0.6 puff and a passing front stacked on top — pushes a running peak past
// 34 kn over a passage. That makes a gale finish genuinely rare and earned,
// which is the point, so we keep the honest Beaufort-8 threshold rather than
// softening it.
export const GALE_KN = 34;

// raceId → region key, reversed from REGION_RACES. Built from the data layer
// only (no UI import). The 'other' onboarding answer merely borrows races from
// the real regions, so we skip it: a race's region is its first real listing.
const REGION_OF_RACE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [region, ids] of Object.entries(REGION_RACES)) {
    if (region === 'other') continue;
    for (const id of ids) {
      if (map[id] === undefined) map[id] = region; // first real region wins
    }
  }
  return map;
})();

export function emptyCareer(): CareerRecord {
  return {
    racesSailed: 0,
    racesFinished: 0,
    wins: 0,
    podiums: 0,
    nmLogged: 0,
    handicapSwingWins: 0,
    photoFinishWins: 0,
    cleanSailRaces: 0,
    galeFinishes: 0,
    boldStoryWins: 0,
    scenarioRuns: 0,
    regionsSailed: [],
    updatedAt: 0,
    wonRaceIds: [],
    podiumRaceIds: [],
    finishedRaceIds: [],
    corinthianOffshoreWins: 0,
    historicEditions: [],
  };
}

// Fold ONE result into the record. Pure — returns a fresh object, never mutates
// `prev` (the regions array is copied). Only a genuine finish (`finished` and
// not `retired`) advances the achievement counters; a retirement or DNF still
// counts toward `racesSailed`.
export function applyRaceToCareer(prev: CareerRecord, r: RaceResult): CareerRecord {
  const next: CareerRecord = {
    ...prev,
    regionsSailed: [...prev.regionsSailed],
    racesSailed: prev.racesSailed + 1,
    updatedAt: r.timestamp,
    // Copy the (optionally-absent) sets forward as arrays so a push never
    // mutates `prev`. Missing on an old PR-1 record → start from [].
    wonRaceIds: [...(prev.wonRaceIds ?? [])],
    podiumRaceIds: [...(prev.podiumRaceIds ?? [])],
    finishedRaceIds: [...(prev.finishedRaceIds ?? [])],
    corinthianOffshoreWins: prev.corinthianOffshoreWins ?? 0,
    historicEditions: [...(prev.historicEditions ?? [])],
  };

  if (!r.finished || r.retired) return next;

  const won = r.position === 1;
  const race = getRaceById(r.raceId);

  next.racesFinished += 1;
  if (won) next.wins += 1;
  if (r.position <= 3) next.podiums += 1;
  next.nmLogged += race?.distanceNm ?? 0;

  // Distinct-race sets (deduped): sailed-this-course, podiumed-it, won-it.
  next.finishedRaceIds = withUnique(next.finishedRaceIds!, r.raceId);
  if (r.position <= 3) next.podiumRaceIds = withUnique(next.podiumRaceIds!, r.raceId);
  if (won) next.wonRaceIds = withUnique(next.wonRaceIds!, r.raceId);

  // A Corinthian win on an offshore-grade course (the amateur hero honour).
  if (won && r.division === 'corinthian' && race && OFFSHORE_GRADE.has(race.difficulty)) {
    next.corinthianOffshoreWins = (next.corinthianOffshoreWins ?? 0) + 1;
  }

  // A finished historic edition — keyed '<raceId>:<year>' so re-sailing the
  // same edition doesn't double-count, but each documented running is its own.
  if (r.scenario?.kind === 'historic' && r.scenario.year != null) {
    next.historicEditions = withUnique(next.historicEditions!, `${r.raceId}:${r.scenario.year}`);
  }

  if (won && (r.onWaterPosition ?? 1) > 1) next.handicapSwingWins += 1;
  if (
    won &&
    r.nearestCorrectedGapSeconds != null &&
    r.nearestCorrectedGapSeconds < PHOTO_FINISH_SECONDS
  ) {
    next.photoFinishWins += 1;
  }
  if ((r.sailChanges ?? 0) > 0 && (r.sailChangesFumbled ?? 0) === 0) next.cleanSailRaces += 1;
  if ((r.peakWindKn ?? 0) >= GALE_KN) next.galeFinishes += 1;
  if (r.signatureOutcome === 'bold' && won) next.boldStoryWins += 1;
  if (r.scenario != null) next.scenarioRuns += 1;

  const region = REGION_OF_RACE[r.raceId];
  if (region && !next.regionsSailed.includes(region)) next.regionsSailed.push(region);

  if (r.nearestCorrectedGapSeconds != null) {
    next.bestCorrectedGapSeconds =
      prev.bestCorrectedGapSeconds != null
        ? Math.min(prev.bestCorrectedGapSeconds, r.nearestCorrectedGapSeconds)
        : r.nearestCorrectedGapSeconds;
  }
  if (r.optimalHours != null && r.elapsedHours > 0) {
    const pace = (r.optimalHours / r.elapsedHours) * 100;
    next.bestPaceVsOptimalPct =
      prev.bestPaceVsOptimalPct != null ? Math.max(prev.bestPaceVsOptimalPct, pace) : pace;
  }

  return next;
}

// One-time honest-floor backfill for a save that predates this record. History
// is newest-first and capped at 50, so we replay a reversed (oldest-first) copy
// from an empty record. Because the cap has already discarded a veteran's early
// races, this UNDER-counts a long career and can never OVER-count — a safe floor
// the reducer then accrues forward from.
export function careerFrom(history: RaceResult[]): CareerRecord {
  const oldestFirst = [...(history ?? [])].reverse();
  return oldestFirst.reduce(applyRaceToCareer, emptyCareer());
}

function unionLists(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b])];
}

// Migration for a PR-1-era record that predates the distinct-race SET fields.
// When any new field is undefined we recompute the sets from the (capped)
// history via `careerFrom` and UNION them in — an honest floor that recovers
// whatever the surviving history still holds, and never lowers a counter. A
// record already carrying the fields is returned untouched. Pure/deterministic:
// no RNG, no clock, so it is safe to call in the reducer and in a selector.
export function hydrateCareer(
  career: CareerRecord | undefined,
  history: RaceResult[]
): CareerRecord {
  if (!career) return careerFrom(history);
  const complete =
    career.wonRaceIds !== undefined &&
    career.podiumRaceIds !== undefined &&
    career.finishedRaceIds !== undefined &&
    career.corinthianOffshoreWins !== undefined &&
    career.historicEditions !== undefined;
  if (complete) return career;

  const floor = careerFrom(history);
  return {
    ...career,
    wonRaceIds: unionLists(career.wonRaceIds, floor.wonRaceIds),
    podiumRaceIds: unionLists(career.podiumRaceIds, floor.podiumRaceIds),
    finishedRaceIds: unionLists(career.finishedRaceIds, floor.finishedRaceIds),
    corinthianOffshoreWins: Math.max(
      career.corinthianOffshoreWins ?? 0,
      floor.corinthianOffshoreWins ?? 0
    ),
    historicEditions: unionLists(career.historicEditions, floor.historicEditions),
  };
}
