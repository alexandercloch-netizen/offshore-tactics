import {
  emptyCareer,
  applyRaceToCareer,
  careerFrom,
  hydrateCareer,
  PHOTO_FINISH_SECONDS,
  GALE_KN,
} from '../engine/career';
import { CareerRecord, RaceResult } from '../types';

// A finishing result with sensible defaults; override per test. Real race ids so
// the region + distance lookups resolve against the actual catalogue.
function finish(overrides: Partial<RaceResult> = {}): RaceResult {
  return {
    raceId: 'race-round-island', // uk, distanceNm 50
    raceName: 'Round the Island',
    boatId: 'b',
    finished: true,
    retired: false,
    position: 5,
    onWaterPosition: 5,
    fleetSize: 20,
    elapsedHours: 10,
    prizeMoney: 0,
    summary: '',
    timestamp: 1000,
    ...overrides,
  };
}

describe('applyRaceToCareer — the per-race fold', () => {
  it('always counts racesSailed and stamps updatedAt from the result', () => {
    const c = applyRaceToCareer(emptyCareer(), finish({ timestamp: 42 }));
    expect(c.racesSailed).toBe(1);
    expect(c.updatedAt).toBe(42);
  });

  it('a retirement or DNF only bumps racesSailed, nothing else', () => {
    const retired = applyRaceToCareer(emptyCareer(), finish({ retired: true, position: 1 }));
    expect(retired.racesSailed).toBe(1);
    expect(retired.racesFinished).toBe(0);
    expect(retired.wins).toBe(0);
    expect(retired.nmLogged).toBe(0);

    const dnf = applyRaceToCareer(emptyCareer(), finish({ finished: false, position: 1 }));
    expect(dnf.racesFinished).toBe(0);
    expect(dnf.wins).toBe(0);
  });

  it('counts a win, a podium, and logs the race distance', () => {
    const win = applyRaceToCareer(emptyCareer(), finish({ position: 1 }));
    expect(win.wins).toBe(1);
    expect(win.podiums).toBe(1);
    expect(win.racesFinished).toBe(1);
    expect(win.nmLogged).toBe(50); // race-round-island distanceNm

    const third = applyRaceToCareer(emptyCareer(), finish({ position: 3 }));
    expect(third.wins).toBe(0);
    expect(third.podiums).toBe(1);

    const fourth = applyRaceToCareer(emptyCareer(), finish({ position: 4 }));
    expect(fourth.podiums).toBe(0);
  });

  it('counts a handicap-swing win only when beaten on the water', () => {
    const swing = applyRaceToCareer(emptyCareer(), finish({ position: 1, onWaterPosition: 4 }));
    expect(swing.handicapSwingWins).toBe(1);
    const clean = applyRaceToCareer(emptyCareer(), finish({ position: 1, onWaterPosition: 1 }));
    expect(clean.handicapSwingWins).toBe(0);
  });

  it('counts a photo-finish win only inside the gap threshold', () => {
    const inside = applyRaceToCareer(
      emptyCareer(),
      finish({ position: 1, nearestCorrectedGapSeconds: PHOTO_FINISH_SECONDS - 1 })
    );
    expect(inside.photoFinishWins).toBe(1);
    const outside = applyRaceToCareer(
      emptyCareer(),
      finish({ position: 1, nearestCorrectedGapSeconds: PHOTO_FINISH_SECONDS })
    );
    expect(outside.photoFinishWins).toBe(0);
    // A close gap without the win does not count.
    const loser = applyRaceToCareer(
      emptyCareer(),
      finish({ position: 2, nearestCorrectedGapSeconds: 5 })
    );
    expect(loser.photoFinishWins).toBe(0);
  });

  it('counts a clean-sail race only with changes and zero fumbles', () => {
    expect(applyRaceToCareer(emptyCareer(), finish({ sailChanges: 3, sailChangesFumbled: 0 })).cleanSailRaces).toBe(1);
    expect(applyRaceToCareer(emptyCareer(), finish({ sailChanges: 3, sailChangesFumbled: 1 })).cleanSailRaces).toBe(0);
    expect(applyRaceToCareer(emptyCareer(), finish({ sailChanges: 0 })).cleanSailRaces).toBe(0);
  });

  it('counts a gale finish at or above the threshold', () => {
    expect(applyRaceToCareer(emptyCareer(), finish({ peakWindKn: GALE_KN })).galeFinishes).toBe(1);
    expect(applyRaceToCareer(emptyCareer(), finish({ peakWindKn: GALE_KN - 0.1 })).galeFinishes).toBe(0);
    expect(applyRaceToCareer(emptyCareer(), finish({})).galeFinishes).toBe(0);
  });

  it('counts a bold story win only when bold AND first', () => {
    expect(applyRaceToCareer(emptyCareer(), finish({ signatureOutcome: 'bold', position: 1 })).boldStoryWins).toBe(1);
    expect(applyRaceToCareer(emptyCareer(), finish({ signatureOutcome: 'bold', position: 2 })).boldStoryWins).toBe(0);
    expect(applyRaceToCareer(emptyCareer(), finish({ signatureOutcome: 'safe', position: 1 })).boldStoryWins).toBe(0);
  });

  it('counts a scenario run when the result carries a stamp', () => {
    const stamped = applyRaceToCareer(
      emptyCareer(),
      finish({ scenario: { kind: 'forecast' } as unknown as RaceResult['scenario'] })
    );
    expect(stamped.scenarioRuns).toBe(1);
    expect(applyRaceToCareer(emptyCareer(), finish({})).scenarioRuns).toBe(0);
  });

  it('accrues the distinct-race SETS, deduped', () => {
    let c = emptyCareer();
    c = applyRaceToCareer(c, finish({ raceId: 'race-fastnet', position: 1 }));
    c = applyRaceToCareer(c, finish({ raceId: 'race-fastnet', position: 1 })); // same course again
    c = applyRaceToCareer(c, finish({ raceId: 'race-round-island', position: 3 }));
    c = applyRaceToCareer(c, finish({ raceId: 'race-sydney-hobart', position: 8 }));
    expect(c.wonRaceIds).toEqual(['race-fastnet']); // deduped
    expect(c.podiumRaceIds!.sort()).toEqual(['race-fastnet', 'race-round-island']);
    expect(c.finishedRaceIds!.sort()).toEqual([
      'race-fastnet',
      'race-round-island',
      'race-sydney-hobart',
    ]);
  });

  it('counts a Corinthian offshore win only in the right division and grade', () => {
    // race-fastnet is Offshore; race-round-island is Inshore.
    expect(
      applyRaceToCareer(emptyCareer(), finish({ raceId: 'race-fastnet', position: 1, division: 'corinthian' }))
        .corinthianOffshoreWins
    ).toBe(1);
    expect(
      applyRaceToCareer(emptyCareer(), finish({ raceId: 'race-fastnet', position: 1, division: 'pro' }))
        .corinthianOffshoreWins
    ).toBe(0);
    expect(
      applyRaceToCareer(
        emptyCareer(),
        finish({ raceId: 'race-round-island', position: 1, division: 'corinthian' })
      ).corinthianOffshoreWins
    ).toBe(0); // Inshore does not count
  });

  it('records a finished historic edition, deduped by raceId:year', () => {
    const stamp = { kind: 'historic', model: 'era5', issuedAt: '', label: '2011', year: 2011 } as const;
    let c = applyRaceToCareer(emptyCareer(), finish({ raceId: 'race-fastnet', scenario: stamp }));
    c = applyRaceToCareer(c, finish({ raceId: 'race-fastnet', scenario: stamp })); // same edition again
    expect(c.historicEditions).toEqual(['race-fastnet:2011']);
    // A live (non-historic) scenario is not an edition.
    const live = applyRaceToCareer(
      emptyCareer(),
      finish({ scenario: { kind: 'live', model: 'ecmwf', issuedAt: '', label: 'today' } })
    );
    expect(live.historicEditions).toEqual([]);
  });

  it('dedupes regions and unions distinct ones', () => {
    let c = emptyCareer();
    c = applyRaceToCareer(c, finish({ raceId: 'race-round-island' })); // uk
    c = applyRaceToCareer(c, finish({ raceId: 'race-fastnet' })); // uk again
    c = applyRaceToCareer(c, finish({ raceId: 'race-sydney-hobart' })); // ausNz
    expect(c.regionsSailed.sort()).toEqual(['ausNz', 'uk']);
  });

  it('bestCorrectedGapSeconds only decreases', () => {
    let c = applyRaceToCareer(emptyCareer(), finish({ nearestCorrectedGapSeconds: 120 }));
    expect(c.bestCorrectedGapSeconds).toBe(120);
    c = applyRaceToCareer(c, finish({ nearestCorrectedGapSeconds: 300 }));
    expect(c.bestCorrectedGapSeconds).toBe(120); // worse gap does not overwrite
    c = applyRaceToCareer(c, finish({ nearestCorrectedGapSeconds: 45 }));
    expect(c.bestCorrectedGapSeconds).toBe(45);
  });

  it('bestPaceVsOptimalPct only increases and guards elapsed>0', () => {
    let c = applyRaceToCareer(emptyCareer(), finish({ optimalHours: 9, elapsedHours: 10 }));
    expect(c.bestPaceVsOptimalPct).toBeCloseTo(90);
    c = applyRaceToCareer(c, finish({ optimalHours: 8, elapsedHours: 10 })); // worse pace (80)
    expect(c.bestPaceVsOptimalPct).toBeCloseTo(90);
    c = applyRaceToCareer(c, finish({ optimalHours: 9.5, elapsedHours: 10 })); // better (95)
    expect(c.bestPaceVsOptimalPct).toBeCloseTo(95);
    // elapsed 0 is guarded — no NaN/Infinity.
    const guarded = applyRaceToCareer(emptyCareer(), finish({ optimalHours: 9, elapsedHours: 0 }));
    expect(guarded.bestPaceVsOptimalPct).toBeUndefined();
  });

  it('does not mutate the previous record', () => {
    const prev = emptyCareer();
    const snapshot = JSON.stringify(prev);
    const next = applyRaceToCareer(prev, finish({ position: 1, raceId: 'race-fastnet' }));
    expect(JSON.stringify(prev)).toBe(snapshot); // prev untouched
    expect(next).not.toBe(prev);
    expect(next.regionsSailed).not.toBe(prev.regionsSailed); // array copied, not shared
  });
});

describe('careerFrom — the honest-floor backfill', () => {
  it('replays a newest-first history oldest-first, matching a manual replay', () => {
    // history is stored newest-first
    const history: RaceResult[] = [
      finish({ raceId: 'race-fastnet', position: 1, timestamp: 300 }), // newest
      finish({ raceId: 'race-round-island', position: 3, timestamp: 200 }),
      finish({ raceId: 'race-sydney-hobart', position: 5, timestamp: 100 }), // oldest
    ];
    const c = careerFrom(history);
    expect(c.racesSailed).toBe(3);
    expect(c.racesFinished).toBe(3);
    expect(c.wins).toBe(1);
    expect(c.podiums).toBe(2);
    expect(c.regionsSailed.sort()).toEqual(['ausNz', 'uk']);
    // updatedAt is the LAST folded (newest) result's timestamp.
    expect(c.updatedAt).toBe(300);

    // Equivalent to an explicit oldest-first replay.
    const manual = [...history]
      .reverse()
      .reduce(applyRaceToCareer, emptyCareer());
    expect(c).toEqual(manual);
  });

  it('never over-counts — equals a full replay when history is within the 50 cap', () => {
    const history: RaceResult[] = Array.from({ length: 40 }, (_, i) =>
      finish({ position: 1, timestamp: 1000 - i })
    );
    const c = careerFrom(history);
    expect(c.wins).toBe(40); // one per race, no double count
    expect(c.racesSailed).toBe(40);
  });

  it('is back-compatible: empty/undefined inputs do not throw', () => {
    expect(careerFrom([])).toEqual(emptyCareer());
    // @ts-expect-error exercising the runtime guard for a legacy save
    expect(() => careerFrom(undefined)).not.toThrow();
  });
});

describe('hydrateCareer — the PR-1 migration', () => {
  it('builds a complete record from history when there is no record at all', () => {
    const history: RaceResult[] = [
      finish({ raceId: 'race-fastnet', position: 1, timestamp: 200 }),
      finish({ raceId: 'race-round-island', position: 3, timestamp: 100 }),
    ];
    const c = hydrateCareer(undefined, history);
    expect(c.wonRaceIds).toEqual(['race-fastnet']);
    expect(c.finishedRaceIds!.sort()).toEqual(['race-fastnet', 'race-round-island']);
  });

  it('backfills the SET fields on a PR-1-era record that lacks them', () => {
    // A record with the counters but none of the new SET fields (undefined).
    const legacy = {
      ...emptyCareer(),
      racesSailed: 2,
      racesFinished: 2,
      wins: 1,
      podiums: 2,
    } as CareerRecord;
    delete legacy.wonRaceIds;
    delete legacy.podiumRaceIds;
    delete legacy.finishedRaceIds;
    delete legacy.corinthianOffshoreWins;
    delete legacy.historicEditions;

    const history: RaceResult[] = [
      finish({ raceId: 'race-fastnet', position: 1, timestamp: 200 }),
      finish({ raceId: 'race-round-island', position: 2, timestamp: 100 }),
    ];
    const c = hydrateCareer(legacy, history);
    // Counters preserved; sets recovered from the surviving history (a floor).
    expect(c.wins).toBe(1);
    expect(c.wonRaceIds).toEqual(['race-fastnet']);
    expect(c.finishedRaceIds!.sort()).toEqual(['race-fastnet', 'race-round-island']);
    expect(c.corinthianOffshoreWins).toBe(0);
  });

  it('returns a record that already has the SET fields untouched', () => {
    const complete = applyRaceToCareer(emptyCareer(), finish({ raceId: 'race-fastnet', position: 1 }));
    // A DIFFERENT history must not be unioned in when the record is complete.
    const c = hydrateCareer(complete, [finish({ raceId: 'race-sydney-hobart', position: 1 })]);
    expect(c).toBe(complete);
  });
});

// The career layer is pure display/record bookkeeping folded in the reducer. It
// must NOT be reachable from the seeded engine loop, or it could perturb the RNG
// stream and move a golden pin. This asserts the source barrier explicitly.
describe('career.ts is off the engine RNG path', () => {
  it('is not imported by stepRace/applyDecision (gameEngine)', () => {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const src = fs.readFileSync(path.join(__dirname, '../engine/gameEngine.ts'), 'utf8');
    expect(src).not.toMatch(/from '\.\/career'/);
    expect(src).not.toMatch(/require\(['"]\.\/career['"]\)/);
  });
});
