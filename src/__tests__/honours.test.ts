import { CareerRecord, RaceResult } from '../types';
import { emptyCareer } from '../engine/career';
import { evaluateHonours, sailorRank } from '../engine/honours';
import {
  HONOURS,
  CONQUEST_COURSES,
  MARQUEE_RACE_IDS,
  DOCUMENTED_EDITION_KEYS,
  ALL_HAZARDS,
  getHonourById,
} from '../data/honours';
import { getRaceById } from '../data';

function career(overrides: Partial<CareerRecord> = {}): CareerRecord {
  return { ...emptyCareer(), ...overrides };
}

describe('the honours catalogue — data integrity', () => {
  it('has unique, stable ids', () => {
    const ids = HONOURS.map((h) => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('maps every conquest honour to a real race', () => {
    for (const course of CONQUEST_COURSES) {
      expect(getRaceById(course.raceId)).toBeDefined();
      expect(getHonourById(course.id)).toBeDefined();
    }
  });

  it('has a real documented-edition set and covers every hazard', () => {
    expect(DOCUMENTED_EDITION_KEYS.length).toBeGreaterThan(0);
    expect(MARQUEE_RACE_IDS.length).toBe(9);
    // ALL_HAZARDS is derived from the roster, so every entry necessarily has a
    // course — All Weathers is always achievable.
    expect(ALL_HAZARDS.length).toBeGreaterThan(0);
    expect(new Set(ALL_HAZARDS).size).toBe(ALL_HAZARDS.length);
  });

  it('progress() never throws on an empty career', () => {
    const empty = emptyCareer();
    for (const h of HONOURS) {
      expect(() => h.progress(empty, [])).not.toThrow();
      const p = h.progress(empty, []);
      expect(p.need).toBeGreaterThan(0);
      expect(p.have).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('evaluateHonours — earn boundaries', () => {
  it('earns exactly at have === need, not at need - 1', () => {
    // Cast Off needs racesSailed >= 1.
    const at = evaluateHonours(career({ racesSailed: 1 }), []);
    expect(at.awards.find((a) => a.id === 'cast-off')!.earned).toBe(true);
    const below = evaluateHonours(career({ racesSailed: 0 }), []);
    expect(below.awards.find((a) => a.id === 'cast-off')!.earned).toBe(false);
  });

  it('stamps earnedAt from `now` for a freshly-earned honour, undefined without it', () => {
    const stamped = evaluateHonours(career({ racesFinished: 1 }), [], [], 4242);
    expect(stamped.awards.find((a) => a.id === 'first-blood')!.earnedAt).toBe(4242);
    const unstamped = evaluateHonours(career({ racesFinished: 1 }), []);
    expect(unstamped.awards.find((a) => a.id === 'first-blood')!.earnedAt).toBeUndefined();
  });
});

describe('evaluateHonours — latching and justEarned', () => {
  it('latches an earned honour even if the metric later dips', () => {
    const first = evaluateHonours(career({ racesSailed: 1 }), [], [], 100);
    const castOff = first.awards.find((a) => a.id === 'cast-off')!;
    expect(castOff.earned).toBe(true);

    // Same honour, but the metric has regressed below the bar — it stays earned,
    // keeping its original earnedAt.
    const later = evaluateHonours(career({ racesSailed: 0 }), [], first.awards, 200);
    const latched = later.awards.find((a) => a.id === 'cast-off')!;
    expect(latched.earned).toBe(true);
    expect(latched.earnedAt).toBe(100);
  });

  it('reports only newly-earned ids in justEarned', () => {
    const first = evaluateHonours(career({ racesSailed: 1, racesFinished: 1 }), []);
    expect(first.justEarned).toEqual(expect.arrayContaining(['cast-off', 'first-blood']));

    // Re-evaluate with those as prior — nothing new.
    const same = evaluateHonours(career({ racesSailed: 1, racesFinished: 1 }), [], first.awards);
    expect(same.justEarned).toEqual([]);

    // Now a podium earns On the Board, and only that.
    const next = evaluateHonours(
      career({ racesSailed: 1, racesFinished: 1, podiums: 1 }),
      [],
      first.awards
    );
    expect(next.justEarned).toEqual(['on-the-board']);
  });

  it('is safe on a wholly empty career', () => {
    const evaluation = evaluateHonours(emptyCareer(), []);
    expect(evaluation.earned).toEqual([]);
    expect(evaluation.justEarned).toEqual([]);
    expect(evaluation.awards.length).toBe(HONOURS.length);
  });
});

describe('the Ironclad streak', () => {
  function res(retired: boolean): RaceResult {
    return {
      raceId: 'race-round-island',
      raceName: 'x',
      boatId: 'b',
      finished: !retired,
      retired,
      position: 1,
      fleetSize: 10,
      elapsedHours: 5,
      prizeMoney: 0,
      summary: '',
      timestamp: 1,
    };
  }
  it('measures the longest run of non-retired races', () => {
    const history = [res(false), res(false), res(true), res(false), res(false), res(false)];
    const p = getHonourById('ironclad')!.progress(emptyCareer(), history);
    expect(p.have).toBe(3); // the trailing three clean, broken by the retirement
  });
});

describe('sailorRank — the RYA ladder', () => {
  it('is a Dock-hand with nothing sailed', () => {
    expect(sailorRank(emptyCareer()).title).toBe('Dock-hand');
    expect(sailorRank(emptyCareer()).next).toBe('Competent Crew');
  });

  it('climbs Competent Crew → Day Skipper → Coastal Skipper on the thresholds', () => {
    expect(sailorRank(career({ racesFinished: 1 })).title).toBe('Competent Crew');
    expect(sailorRank(career({ racesFinished: 1, podiums: 1, nmLogged: 500 })).title).toBe(
      'Day Skipper'
    );
    expect(
      sailorRank(
        career({ racesFinished: 3, podiums: 2, wins: 1, nmLogged: 2500 })
      ).title
    ).toBe('Coastal Skipper');
  });

  it('reaches Yachtmaster Offshore only with 3 wins across 2 courses and pace >= 90', () => {
    const base = career({
      racesFinished: 5,
      podiums: 3,
      wins: 3,
      nmLogged: 2500,
      wonRaceIds: ['race-round-island', 'race-fastnet'],
      bestPaceVsOptimalPct: 91,
    });
    expect(sailorRank(base).title).toBe('Yachtmaster Offshore');
    // One course only → does not qualify (stuck below).
    const oneCourse = { ...base, wonRaceIds: ['race-round-island'] };
    expect(sailorRank(oneCourse).title).not.toBe('Yachtmaster Offshore');
  });

  it('crowns Master Mariner only for the Grand Slam', () => {
    const slam = career({
      racesFinished: 20,
      podiums: 15,
      wins: 15,
      nmLogged: 30000,
      wonRaceIds: [...MARQUEE_RACE_IDS],
      bestPaceVsOptimalPct: 95,
    });
    expect(sailorRank(slam).title).toBe('Master Mariner');
    expect(sailorRank(slam).next).toBeUndefined();
  });
});

// The honours layer must stay OFF the engine's simulation path — a golden pin
// could move if a honour were computed inside the seeded loop.
describe('honours.ts is off the engine RNG path', () => {
  it('is not imported by gameEngine', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../engine/gameEngine.ts'), 'utf8');
    expect(src).not.toMatch(/from '\.\/honours'/);
    expect(src).not.toMatch(/from '\.\.\/data\/honours'/);
    expect(src).not.toMatch(/require\(['"]\.\/honours['"]\)/);
  });
});
