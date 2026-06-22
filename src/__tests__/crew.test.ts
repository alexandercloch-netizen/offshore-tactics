import { CREW, crewForTier, getBoatById } from '../data';
import {
  autoSelectCrew,
  campaignCost,
  crewPoolForDivision,
  crewSkillAverage,
  crewSkillFactor,
  crewWageForDivision,
  rankCrewForPreset,
  tierForDivision,
} from '../engine/gameEngine';
import { CrewRole, GameState } from '../types';

// A boat with enough berths to exercise role-filling and doubling-up.
const BOAT_ID = 'boat-mistral';

function stateFor(division: 'corinthian' | 'pro', crewIds: string[] = []): GameState {
  return {
    funds: 1_000_000,
    selectedRaceId: 'race-round-island',
    selectedDivision: division,
    selectedBoatId: BOAT_ID,
    ownedBoatIds: [BOAT_ID],
    selectedCrewIds: crewIds,
    provisions: [],
    condition: { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 },
    strategy: { effort: 'steady', bias: 0 },
    profile: { fleet: [] },
    history: [],
    eventLog: [],
  } as unknown as GameState;
}

describe('crew roster integrity', () => {
  it('has 20 pros and 20 Corinthians, four sailors per role per tier', () => {
    expect(CREW).toHaveLength(40);
    expect(crewForTier('pro')).toHaveLength(20);
    expect(crewForTier('corinthian')).toHaveLength(20);

    const roles: CrewRole[] = ['Skipper', 'Navigator', 'Tactician', 'Trimmer', 'Bowman'];
    for (const tier of ['pro', 'corinthian'] as const) {
      for (const role of roles) {
        const count = crewForTier(tier).filter((c) => c.role === role).length;
        expect(count).toBe(4);
      }
    }
  });

  it('gives every sailor unique ids and sane, in-range stats', () => {
    expect(new Set(CREW.map((c) => c.id)).size).toBe(CREW.length);
    for (const c of CREW) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.homePort.length).toBeGreaterThan(0);
      expect(c.bio.length).toBeGreaterThan(0);
      expect(c.age).toBeGreaterThanOrEqual(16);
      expect(c.age).toBeLessThanOrEqual(80);
      for (const stat of [c.skill, c.stamina, c.morale]) {
        expect(stat).toBeGreaterThanOrEqual(0);
        expect(stat).toBeLessThanOrEqual(100);
      }
    }
  });

  it('pays professionals and leaves Corinthians unpaid', () => {
    expect(crewForTier('pro').every((c) => c.wage > 0)).toBe(true);
    expect(crewForTier('corinthian').every((c) => c.wage === 0)).toBe(true);
  });
});

describe('division pools & wages', () => {
  it('maps divisions to the right tier pool', () => {
    expect(tierForDivision('corinthian')).toBe('corinthian');
    expect(tierForDivision('pro')).toBe('pro');
    expect(crewPoolForDivision('corinthian').every((c) => c.tier === 'corinthian')).toBe(true);
    expect(crewPoolForDivision('pro').every((c) => c.tier === 'pro')).toBe(true);
  });

  it('never charges crew wages in the Corinthian division', () => {
    const pros = crewForTier('pro').slice(0, 3).map((c) => c.id);
    expect(crewWageForDivision(pros, 'corinthian')).toBe(0);
    expect(crewWageForDivision(pros, 'pro')).toBeGreaterThan(0);
  });

  it('zeroes wages in campaignCost for a Corinthian campaign', () => {
    const pros = crewForTier('pro').slice(0, 3).map((c) => c.id);
    expect(campaignCost(stateFor('corinthian', pros)).wages).toBe(0);
    expect(campaignCost(stateFor('pro', pros)).wages).toBeGreaterThan(0);
  });
});

describe('crew skill feeds the sim', () => {
  it('scales speed from 0.9 (green) to 1.1 (flawless), ~1.0 mid', () => {
    expect(crewSkillFactor(0)).toBeCloseTo(0.9);
    expect(crewSkillFactor(100)).toBeCloseTo(1.1);
    expect(crewSkillFactor(50)).toBeCloseTo(1.0);
    expect(crewSkillFactor(90)).toBeGreaterThan(crewSkillFactor(40));
  });

  it('averages signed-crew skill, falling back for an empty boat', () => {
    const a = crewForTier('pro')[0];
    const b = crewForTier('pro')[1];
    expect(crewSkillAverage([a.id, b.id])).toBeCloseTo((a.skill + b.skill) / 2);
    expect(crewSkillAverage([])).toBeGreaterThan(0); // a thin crew still sails
  });
});

describe('auto-crew presets', () => {
  const capacity = getBoatById(BOAT_ID)!.crewCapacity;

  it('fills exactly the berths from the correct division pool', () => {
    const ids = autoSelectCrew(stateFor('corinthian'), 'balanced');
    expect(ids).toHaveLength(capacity);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    const pool = crewPoolForDivision('corinthian');
    expect(ids.every((id) => pool.some((m) => m.id === id))).toBe(true);
  });

  it('prefers role diversity before doubling up', () => {
    const ids = autoSelectCrew(stateFor('pro'), 'veteran');
    const roles = ids
      .map((id) => crewForTier('pro').find((c) => c.id === id)!.role)
      .slice(0, 5);
    // First five berths should cover five distinct roles.
    expect(new Set(roles).size).toBe(Math.min(5, ids.length));
  });

  it('seasoned salts out-skill young guns, balanced lands between', () => {
    const vet = crewSkillAverage(autoSelectCrew(stateFor('pro'), 'veteran'));
    const bal = crewSkillAverage(autoSelectCrew(stateFor('pro'), 'balanced'));
    const young = crewSkillAverage(autoSelectCrew(stateFor('pro'), 'novice'));
    expect(vet).toBeGreaterThan(young);
    expect(bal).toBeLessThanOrEqual(vet);
    expect(bal).toBeGreaterThanOrEqual(young);
  });

  it('young guns are younger on average than seasoned salts', () => {
    const ageOf = (ids: string[]) =>
      ids.reduce((s, id) => s + crewForTier('pro').find((c) => c.id === id)!.age, 0) / ids.length;
    expect(ageOf(autoSelectCrew(stateFor('pro'), 'novice'))).toBeLessThan(
      ageOf(autoSelectCrew(stateFor('pro'), 'veteran'))
    );
  });

  it('ranks the whole pool for each preset (deterministic)', () => {
    const pool = crewPoolForDivision('pro');
    expect(rankCrewForPreset(pool, 'veteran')).toHaveLength(pool.length);
    expect(rankCrewForPreset(pool, 'veteran')[0].skill).toBe(
      Math.max(...pool.map((c) => c.skill))
    );
  });
});
