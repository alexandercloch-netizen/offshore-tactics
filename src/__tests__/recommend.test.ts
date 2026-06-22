import { recommendedRace, defaultDivision, goalHeadline } from '../engine/recommend';
import { isRaceUnlocked } from '../engine/gameEngine';
import { PlayerProfile, RaceResult, SailingRegion } from '../types';

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
    const r = recommendedRace(player('greatLakes'), []);
    expect(r?.id).toBe('race-chicago-mac');
  });

  it('honours the unlock ladder — locked regional races are skipped', () => {
    // The Med race (Middle Sea) is locked until Chicago Mac is won, so a Med
    // sailor with no history gets an unlocked race instead, never a locked one.
    const r = recommendedRace(player('med'), []);
    expect(r).toBeDefined();
    expect(isRaceUnlocked(r!, [])).toBe(true);
  });

  it('picks the UK inshore race for a UK sailor at the start', () => {
    expect(recommendedRace(player('uk'), [])?.id).toBe('race-round-island');
  });

  it('moves on to a fresh race once the home one is won', () => {
    const r = recommendedRace(player('uk'), [win('race-round-island')]);
    expect(r).toBeDefined();
    expect(r?.id).not.toBe('race-round-island');
    expect(isRaceUnlocked(r!, [win('race-round-island')])).toBe(true);
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
