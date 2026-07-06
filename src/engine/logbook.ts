import { RaceResult } from '../types';
import { getRaceById } from '../data';

// The Harbour's career analytics, aggregated purely from `state.history`.
// Every RaceResult field newer than the earliest saves is optional, so each
// stat only counts the races that actually carry its data — a stat with no
// data is `undefined` and the UI hides its row. No invented numbers.

export interface DuelStat {
  gapSeconds: number;
  rival: string;
  raceName: string;
}

export interface LogbookStats {
  sailed: number; // every race entered (incl. retirements)
  finished: number;
  podiums: number; // corrected-time top 3
  wins: number; // corrected-time firsts
  nmLogged: number; // course miles of finished races
  // The headline "performance vs rating" metric: mean of optimalHours /
  // elapsedHours over finished races that recorded both — how close, on
  // average, the sailed race came to the weather-optimal line for the SAME
  // boat in the SAME wind. Boat-neutral by construction (the optimum is
  // recomputed per boat per race), unlike raw finishing position, which the
  // fleet's variance can gift or steal. Shown as a percentage.
  paceVsOptimalPct?: number;
  rightSailPct?: number; // mean % of a race spent under the best canvas aboard
  fumbleRatePct?: number; // bungled changes / committed changes, where recorded
  bestDuel?: DuelStat; // the closest corrected-time finish, either way
  biggestWin?: DuelStat; // widest corrected margin over 2nd in a win
  // Corrected-standing percentile per finished race, oldest → newest, capped
  // to the last `SPARK_RACES`: 1 = won the fleet, 0 = last boat home.
  positionSpark: number[];
}

const SPARK_RACES = 10;

export function logbookStats(history: RaceResult[]): LogbookStats {
  const finished = history.filter((r) => r.finished && !r.retired);

  const nmLogged = finished.reduce(
    (sum, r) => sum + (getRaceById(r.raceId)?.distanceNm ?? 0),
    0
  );

  // Pace vs the optimal line — only races that captured the debrief geometry.
  const paced = finished.filter(
    (r) => (r.optimalHours ?? 0) > 0 && r.elapsedHours > 0
  );
  const paceVsOptimalPct =
    paced.length > 0
      ? (paced.reduce((s, r) => s + r.optimalHours! / r.elapsedHours, 0) / paced.length) * 100
      : undefined;

  // Sail-handling quality — wardrobe-era races only.
  const sailRated = finished.filter((r) => r.rightSailPct != null);
  const rightSailPct =
    sailRated.length > 0
      ? sailRated.reduce((s, r) => s + (r.rightSailPct ?? 0), 0) / sailRated.length
      : undefined;
  const changeCounted = history.filter((r) => r.sailChanges != null);
  const totalChanges = changeCounted.reduce((s, r) => s + (r.sailChanges ?? 0), 0);
  const fumbleRatePct =
    totalChanges > 0
      ? (changeCounted.reduce((s, r) => s + (r.sailChangesFumbled ?? 0), 0) / totalChanges) * 100
      : undefined;

  // The duels — corrected-time gaps recorded by the finish drama capture.
  let bestDuel: DuelStat | undefined;
  let biggestWin: DuelStat | undefined;
  for (const r of finished) {
    if (r.nearestCorrectedGapSeconds == null || !r.nearestRivalName) continue;
    const duel = {
      gapSeconds: r.nearestCorrectedGapSeconds,
      rival: r.nearestRivalName,
      raceName: r.raceName,
    };
    if (!bestDuel || duel.gapSeconds < bestDuel.gapSeconds) bestDuel = duel;
    // In a corrected-time win the nearest boat IS second place, so the gap is
    // the winning margin.
    if (r.position === 1 && (!biggestWin || duel.gapSeconds > biggestWin.gapSeconds)) {
      biggestWin = duel;
    }
  }

  const positionSpark = finished
    .slice(-SPARK_RACES)
    .map((r) => (r.fleetSize > 1 ? (r.fleetSize - r.position) / (r.fleetSize - 1) : 1));

  return {
    sailed: history.length,
    finished: finished.length,
    podiums: finished.filter((r) => r.position <= 3).length,
    wins: finished.filter((r) => r.position === 1).length,
    nmLogged,
    paceVsOptimalPct,
    rightSailPct,
    fumbleRatePct,
    bestDuel,
    biggestWin,
    positionSpark,
  };
}
