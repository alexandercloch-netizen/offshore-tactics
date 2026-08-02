import { RaceResult, Series } from '../types';

// Series (regatta) scoring — pure functions over stored member RaceResults, in
// the career.ts mould: reducer-side and display-side only, never touched by
// stepRace/applyDecision. Standings are DERIVED, so SeriesProgress can stay a
// two-field record and an abandoned week resumes exactly where it stopped.

export interface SeriesStandingRow {
  name: string; // boat name ('You' for the player row)
  isPlayer: boolean;
  points: number; // low-point total AFTER any discard
  discarded?: number; // the day score dropped, once the discard applies
  daysScored: number; // days with a real (sailed) score
  rank: number; // 1-based, ties share a rank
}

export const PLAYER_NAME = 'You';

// The newest stored result per member race id — history is newest-first, so the
// first hit per id wins (a re-sailed day supersedes the old score).
export function memberResults(series: Series, history: RaceResult[]): Map<string, RaceResult> {
  const byRace = new Map<string, RaceResult>();
  for (const r of history) {
    if (series.memberRaceIds.includes(r.raceId) && !byRace.has(r.raceId)) {
      byRace.set(r.raceId, r);
    }
  }
  return byRace;
}

// Classic low-point regatta scoring. Entrants = every boat named across the
// sailed days plus the player; a day rank = its points; a boat absent or
// retired on a sailed day scores entrants + 1 (DNC/DNF); once EVERY member day
// is sailed, each boat drops its single worst day (the discard). Unsailed days
// score nothing for anyone — the table always reflects only the racing done.
export function seriesStandings(series: Series, history: RaceResult[]): SeriesStandingRow[] {
  const results = memberResults(series, history);
  const sailed = series.memberRaceIds.filter((id) => results.has(id));
  if (sailed.length === 0) return [];

  // The roster: the AI fleet is drawn deterministically by index (fleet.ts), so
  // day-to-day names coincide; the union covers any drift defensively.
  const names = new Set<string>([PLAYER_NAME]);
  for (const id of sailed) {
    for (const n of results.get(id)!.correctedOrder ?? []) names.add(n);
  }
  const entrants = names.size;
  const dnc = entrants + 1;

  const scores = new Map<string, number[]>();
  for (const n of names) scores.set(n, []);
  for (const id of sailed) {
    const r = results.get(id)!;
    const order = r.correctedOrder ?? [];
    // The player's day rank is their corrected position; a retirement is DNF.
    const playerScore = r.finished && !r.retired ? r.position : dnc;
    for (const n of names) {
      if (n === PLAYER_NAME) {
        scores.get(n)!.push(playerScore);
        continue;
      }
      const i = order.indexOf(n);
      if (i < 0) {
        scores.get(n)!.push(dnc);
        continue;
      }
      // `order` is the AI corrected order; the player's finish slots in at
      // `position`, pushing every boat at/after that rank down one.
      const aiRank = i + 1;
      scores.get(n)!.push(playerScore <= aiRank ? aiRank + 1 : aiRank);
    }
  }

  const complete = sailed.length === series.memberRaceIds.length;
  const rows: SeriesStandingRow[] = [...names].map((n) => {
    const s = scores.get(n)!;
    let discarded: number | undefined;
    let points = s.reduce((a, b) => a + b, 0);
    if (complete && s.length > 1) {
      discarded = Math.max(...s);
      points -= discarded;
    }
    return { name: n, isPlayer: n === PLAYER_NAME, points, discarded, daysScored: s.length, rank: 0 };
  });

  rows.sort((a, b) => a.points - b.points || a.name.localeCompare(b.name));
  let rank = 0;
  let prev = Number.NaN;
  rows.forEach((row, i) => {
    if (row.points !== prev) {
      rank = i + 1;
      prev = row.points;
    }
    row.rank = rank;
  });
  return rows;
}

// The player's overall rank, or undefined before any day is sailed.
export function playerSeriesRank(series: Series, history: RaceResult[]): number | undefined {
  return seriesStandings(series, history).find((r) => r.isPlayer)?.rank;
}
