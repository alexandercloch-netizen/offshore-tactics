import {
  DivisionKey,
  ExperienceLevel,
  PlayerProfile,
  Race,
  RaceResult,
  SailingGoal,
} from '../types';
import { RACES } from '../data/races';
import { REGION_RACES } from '../data/onboarding';
import { finishedRaceIds, isRaceUnlocked } from './gameEngine';

// The race to surface on the home screen for this player: their home-waters
// race when it's unlocked and not yet won, otherwise the most advanced race
// they've unlocked, so there's always a sensible next thing to sail.
export function recommendedRace(
  player: PlayerProfile | undefined,
  history: RaceResult[]
): Race | undefined {
  const unlocked = RACES.filter((r) => isRaceUnlocked(r, history));
  if (unlocked.length === 0) return undefined;
  const won = finishedRaceIds(history);
  const freshUnlocked = unlocked.filter((r) => !won.has(r.id));

  if (player) {
    const regional = (REGION_RACES[player.region] ?? [])
      .map((id) => RACES.find((r) => r.id === id))
      .filter((r): r is Race => !!r && isRaceUnlocked(r, history));
    // Prefer a home-waters race they haven't won; if those are all won, suggest
    // the next unlocked race instead; only then fall back to a won regional one.
    const freshRegional = regional.find((r) => !won.has(r.id));
    if (freshRegional) return freshRegional;
    if (freshUnlocked.length > 0) return freshUnlocked[freshUnlocked.length - 1];
    if (regional.length > 0) return regional[0];
  }

  // No profile: the furthest-progressed unlocked race not yet won, else the
  // last unlocked race in the ladder.
  const pool = freshUnlocked.length > 0 ? freshUnlocked : unlocked;
  return pool[pool.length - 1];
}

// Seasoned hands start in the Pro division; everyone else eases in Corinthian.
export function defaultDivision(experience: ExperienceLevel | undefined): DivisionKey {
  return experience === 'pro' ? 'pro' : 'corinthian';
}

// The ISO-style week number since the epoch, so "this week" is one stable integer
// the whole app agrees on. Pure — the clock reading is passed in.
export function weekIndex(nowMs: number): number {
  return Math.floor(nowMs / (7 * 24 * 60 * 60 * 1000));
}

// A deterministic, weekly-rotating featured race — a reason to come back and sail
// something off the usual ladder. Display-only: it touches no economy or engine
// RNG, so it can spotlight even a locked, aspirational race. Pure and stable per
// week (the week index is supplied), so it's trivially testable and identical on
// every device in the same week.
export function raceOfTheWeek(week: number, races: Race[] = RACES): Race | undefined {
  if (races.length === 0) return undefined;
  const i = ((week % races.length) + races.length) % races.length;
  return races[i];
}

const GOAL_HEADLINES: Record<SailingGoal, string> = {
  destress: 'Cast off and unwind — a race to clear your head.',
  tactics: 'Sharpen your tactical calls against a live fleet.',
  routing: 'Read the breeze and route your way to the front.',
  compete: 'Post a time and climb the global leaderboard.',
};

export function goalHeadline(goal: SailingGoal | undefined): string {
  return goal ? GOAL_HEADLINES[goal] : 'Pick your race, outwit the weather, take line honours.';
}
