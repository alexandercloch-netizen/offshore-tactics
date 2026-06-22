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
      .filter((r): r is Race => Boolean(r) && isRaceUnlocked(r as Race, history));
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

const GOAL_HEADLINES: Record<SailingGoal, string> = {
  destress: 'Cast off and unwind — a race to clear your head.',
  tactics: 'Sharpen your tactical calls against a live fleet.',
  routing: 'Read the breeze and route your way to the front.',
  compete: 'Post a time and climb the global leaderboard.',
};

export function goalHeadline(goal: SailingGoal | undefined): string {
  return goal ? GOAL_HEADLINES[goal] : 'Pick your race, outwit the weather, take line honours.';
}
