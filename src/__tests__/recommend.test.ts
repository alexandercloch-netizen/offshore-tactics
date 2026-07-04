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
    expect(recommendedRace(player('uk'), [])?.id).toBe('race-cowes-dinard');
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
