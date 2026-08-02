import {
  recommendedRace,
  defaultDivision,
  goalHeadline,
  raceOfTheWeek,
  weekIndex,
} from '../engine/recommend';
import { isRaceUnlocked } from '../engine/gameEngine';
import { RACES } from '../data/races';
import { PlayerProfile, Race, RaceResult, SailingRegion } from '../types';

describe('raceOfTheWeek', () => {
  // Series member days live behind their regatta hub, so the weekly spotlight
  // rotates over the standalone catalogue only.
  const races = RACES.filter((r) => !r.seriesId);
  it('is stable within a week and rotates across weeks', () => {
    const w = 12345;
    expect(raceOfTheWeek(w)?.id).toBe(raceOfTheWeek(w)?.id); // same week → same race
    // Over a full cycle of weeks, every standalone race is featured exactly once
    // — and no member day ever is.
    const seen = new Set<string>();
    for (let k = 0; k < races.length; k += 1) seen.add(raceOfTheWeek(w + k)!.id);
    expect(seen.size).toBe(races.length);
    seen.forEach((id) => expect(RACES.find((r) => r.id === id)?.seriesId).toBeUndefined());
  });

  it('wraps safely for any week index and never returns undefined for a non-empty catalogue', () => {
    for (const w of [0, 1, -1, -7, 999999]) {
      expect(raceOfTheWeek(w)).toBeDefined();
    }
  });

  it('returns undefined only for an empty catalogue', () => {
    expect(raceOfTheWeek(3, [] as Race[])).toBeUndefined();
  });

  it('weekIndex advances by one every 7 days and is stable within a week', () => {
    const day = 24 * 60 * 60 * 1000;
    const base = 20 * 7 * day; // an exact week boundary
    expect(weekIndex(base)).toBe(weekIndex(base + 6 * day)); // same week
    expect(weekIndex(base + 7 * day)).toBe(weekIndex(base) + 1); // next week
  });
});

function player(region: SailingRegion, over: Partial<PlayerProfile> = {}): PlayerProfile {
  return { role: 'skipper', region, goal: 'compete', experience: 'club', onboardedAt: 1, ...over };
}

function win(raceId: string): RaceResult {
  return {
    raceId,
    raceName: raceId,
    boatId: 'b',
    finished: true,
    retired: false,
    position: 1,
    fleetSize: 10,
    elapsedHours: 5,
    prizeMoney: 0,
    summary: '',
    timestamp: 1,
  };
}

describe('recommendedRace', () => {
  it('suggests a home-waters race that is unlocked', () => {
    // The home-port classic (always open) leads each region's list.
    const r = recommendedRace(player('greatLakes'), []);
    expect(r?.id).toBe('race-tri-state');
  });

  it('honours the unlock ladder — locked regional races are skipped', () => {
    // A Med sailor with no history gets an unlocked race (the always-open
    // Malta–Syracuse), never a locked one (the Middle Sea until Mac is won).
    const r = recommendedRace(player('med'), []);
    expect(r).toBeDefined();
    expect(r?.id).toBe('race-malta-syracuse');
    expect(isRaceUnlocked(r!, [])).toBe(true);
  });

  it('picks the UK home-port classic for a UK sailor at the start', () => {
    // Round the Island now leads the UK list — the Inshore on-ramp before the
    // 151nm Channel crossing (the six-lens journey review's re-seat).
    expect(recommendedRace(player('uk'), [])?.id).toBe('race-round-island');
  });

  it('moves on to a fresh race once the home ones are won', () => {
    const history = [win('race-cowes-dinard'), win('race-round-island')];
    const r = recommendedRace(player('uk'), history);
    expect(r).toBeDefined();
    expect(r?.id).not.toBe('race-cowes-dinard');
    expect(r?.id).not.toBe('race-round-island');
    expect(isRaceUnlocked(r!, history)).toBe(true);
  });

  it('still returns an unlocked race with no profile', () => {
    const r = recommendedRace(undefined, []);
    expect(r).toBeDefined();
    expect(isRaceUnlocked(r!, [])).toBe(true);
  });
});

describe('defaultDivision', () => {
  it('puts pros in the pro division and everyone else in corinthian', () => {
    expect(defaultDivision('pro')).toBe('pro');
    expect(defaultDivision('seasoned')).toBe('corinthian');
    expect(defaultDivision('novice')).toBe('corinthian');
    expect(defaultDivision(undefined)).toBe('corinthian');
  });
});

describe('goalHeadline', () => {
  it('returns a goal-specific line, and a default when unset', () => {
    expect(goalHeadline('compete')).toMatch(/leaderboard/i);
    expect(goalHeadline(undefined)).toBeTruthy();
  });
});
