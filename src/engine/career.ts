import { CareerRecord, RaceResult } from '../types';
import { getRaceById } from '../data';
import { REGION_RACES } from '../data/onboarding';

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
  };

  if (!r.finished || r.retired) return next;

  const won = r.position === 1;

  next.racesFinished += 1;
  if (won) next.wins += 1;
  if (r.position <= 3) next.podiums += 1;
  next.nmLogged += getRaceById(r.raceId)?.distanceNm ?? 0;

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
