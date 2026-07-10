import { reconcileSaves, isNewerSave } from '../store/reconcile';
import { CareerRecord, GameState, RaceResult, FleetBoat } from '../types';

function result(raceId: string, timestamp: number, prize = 1000): RaceResult {
  return {
    raceId,
    raceName: raceId,
    boatId: 'b',
    finished: true,
    retired: false,
    position: 1,
    fleetSize: 10,
    elapsedHours: 10,
    prizeMoney: prize,
    summary: '',
    timestamp,
  };
}

function boat(id: string): FleetBoat {
  return {
    id,
    name: id,
    className: 'X',
    description: '',
    baseSpeed: 8,
    upwind: 60,
    downwind: 60,
    stability: 60,
    crewCapacity: 6,
    price: 1000,
    custom: true,
    boatType: 'cruiserRacerIRC',
    polar: { tws: [8], twa: [90], speed: [[6]], targets: { beatAngle: [], beatSpeed: [], runAngle: [], runSpeed: [] }, source: 'class' },
    speedAdjustment: { upwindPct: 100, downwindPct: 100, nightPct: 100 },
    sails: [],
  };
}

function state(overrides: Partial<GameState>): GameState {
  return {
    funds: 1000,
    selectedDivision: 'corinthian',
    ownedBoatIds: [],
    selectedCrewIds: [],
    provisions: [],
    strategy: { bias: 0, effort: 'cruise' },
    profile: { fleet: [] },
    condition: { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 },
    history: [],
    eventLog: [],
    ...overrides,
  };
}

describe('reconcileSaves', () => {
  it('returns whichever side exists when only one does', () => {
    const s = state({ funds: 5 });
    expect(reconcileSaves(s, null)).toBe(s);
    expect(reconcileSaves(null, s)).toBe(s);
    expect(reconcileSaves(null, null)).toBeNull();
  });

  it('takes the newer save as the base by savedAt', () => {
    const older = state({ savedAt: 100, selectedRaceId: 'old', funds: 10 });
    const newer = state({ savedAt: 200, selectedRaceId: 'new', funds: 10 });
    expect(reconcileSaves(older, newer)!.selectedRaceId).toBe('new');
    expect(reconcileSaves(newer, older)!.selectedRaceId).toBe('new');
  });

  it('never loses funds — keeps the higher balance', () => {
    const local = state({ savedAt: 200, funds: 50 });
    const cloud = state({ savedAt: 100, funds: 9000 });
    expect(reconcileSaves(local, cloud)!.funds).toBe(9000);
  });

  it('unions race history, de-duplicated and newest-first', () => {
    const shared = result('cowes', 500);
    const local = state({ savedAt: 200, history: [result('fastnet', 600), shared] });
    const cloud = state({ savedAt: 100, history: [shared, result('sydney', 400)] });
    const merged = reconcileSaves(local, cloud)!;
    expect(merged.history.map((r) => r.raceId)).toEqual(['fastnet', 'cowes', 'sydney']);
  });

  it('unions the fleet and owned boats, base winning on id conflicts', () => {
    const local = state({
      savedAt: 200,
      ownedBoatIds: ['a'],
      profile: { fleet: [{ ...boat('shared'), name: 'LOCAL' }, boat('only-local')] },
    });
    const cloud = state({
      savedAt: 100,
      ownedBoatIds: ['b'],
      profile: { fleet: [{ ...boat('shared'), name: 'CLOUD' }, boat('only-cloud')] },
    });
    const merged = reconcileSaves(local, cloud)!;
    expect(merged.ownedBoatIds.sort()).toEqual(['a', 'b']);
    const ids = merged.profile.fleet.map((b) => b.id).sort();
    expect(ids).toEqual(['only-cloud', 'only-local', 'shared']);
    // Base (local, newer) wins the conflicting boat.
    expect(merged.profile.fleet.find((b) => b.id === 'shared')!.name).toBe('LOCAL');
  });

  it('keeps tutorialSeen if either side has seen it', () => {
    const local = state({ savedAt: 200, tutorialSeen: false });
    const cloud = state({ savedAt: 100, tutorialSeen: true });
    expect(reconcileSaves(local, cloud)!.tutorialSeen).toBe(true);
  });

  it('treats a missing savedAt as oldest', () => {
    const noStamp = state({ selectedRaceId: 'nostamp' });
    const stamped = state({ savedAt: 1, selectedRaceId: 'stamped' });
    expect(reconcileSaves(noStamp, stamped)!.selectedRaceId).toBe('stamped');
  });
});

// Funds-union is scoped to the guest→user first sign-in. Across a user's own
// devices (or two different accounts) it must NOT union, or a stale device would
// refund money already spent elsewhere while the bought boat stays owned — the
// cross-device "free boat" exploit.
describe('reconcileSaves — funds scope', () => {
  it('unions funds when folding a guest save into an account (guest→user)', () => {
    const guest = state({ savedAt: 100, funds: 9000 });
    const cloud = state({ savedAt: 200, funds: 50 });
    expect(reconcileSaves(guest, cloud, true)!.funds).toBe(9000);
  });

  it('takes the newer balance (no union) for one account across devices', () => {
    // Newer cloud spent down to 50; a stale local still shows 9000. Without the
    // scope gate the union would refund the difference while keeping the boat.
    const staleLocal = state({ savedAt: 100, funds: 9000, ownedBoatIds: ['fast'] });
    const cloud = state({ savedAt: 200, funds: 50, ownedBoatIds: ['fast'] });
    const merged = reconcileSaves(staleLocal, cloud, false)!;
    expect(merged.funds).toBe(50); // newest-wins on funds
    expect(merged.ownedBoatIds).toContain('fast'); // assets still merge
  });

  it('never leaks a different account into another (assets from the newer base only for funds)', () => {
    // Account A (rich) local, account B (poor) cloud is the newer base: funds must
    // come from B, not be unioned up from A.
    const accountA = state({ savedAt: 100, funds: 100000 });
    const accountB = state({ savedAt: 200, funds: 200 });
    expect(reconcileSaves(accountA, accountB, false)!.funds).toBe(200);
  });
});

// The realtime handler reconciles an incoming push against current state rather
// than blindly overwriting: the newer push wins as the base, but a race just
// finished locally (present only in current) is still folded in, not dropped.
describe('reconcileSaves — realtime push is a merge, not an overwrite', () => {
  it('keeps a locally-finished race that the newer push does not have', () => {
    const localOnly = result('just-finished', 999);
    const current = state({ savedAt: 500, history: [localOnly], funds: 300 });
    const incoming = state({ savedAt: 900, history: [], funds: 700 });
    const merged = reconcileSaves(current, incoming, false)!;
    // Newer push is the base…
    expect(merged.funds).toBe(700);
    // …but the local-only result survives the merge (not overwritten away).
    expect(merged.history.map((r) => r.raceId)).toContain('just-finished');
  });
});

// The lifetime record must never be LOWERED by a stale device (the same exploit
// the funds guard blocks). reconcileSaves folds it through mergeCareer: per
// counter Math.max, regions union, best-gap min, best-pace max, later updatedAt.
function career(overrides: Partial<CareerRecord> = {}): CareerRecord {
  return {
    racesSailed: 0,
    racesFinished: 0,
    wins: 0,
    podiums: 0,
    nmLogged: 0,
    handicapSwingWins: 0,
    photoFinishWins: 0,
    cleanSailRaces: 0,
    galeFinishes: 0,
    boldStoryWins: 0,
    scenarioRuns: 0,
    regionsSailed: [],
    updatedAt: 0,
    ...overrides,
  };
}

describe('reconcileSaves — career record is merged exploit-safely', () => {
  it('takes the higher of every counter (a stale device cannot lower a total)', () => {
    const local = state({
      savedAt: 200, // newer base, but with LOWER lifetime totals
      career: career({ racesSailed: 5, wins: 1, nmLogged: 400, updatedAt: 200 }),
    });
    const cloud = state({
      savedAt: 100,
      career: career({ racesSailed: 12, wins: 3, nmLogged: 3000, updatedAt: 100 }),
    });
    const merged = reconcileSaves(local, cloud)!.career!;
    expect(merged.racesSailed).toBe(12);
    expect(merged.wins).toBe(3);
    expect(merged.nmLogged).toBe(3000);
  });

  it('unions regions, mins the best gap, maxes the best pace, and takes the later updatedAt', () => {
    const local = state({
      savedAt: 200,
      career: career({
        regionsSailed: ['uk', 'med'],
        bestCorrectedGapSeconds: 120,
        bestPaceVsOptimalPct: 88,
        updatedAt: 200,
      }),
    });
    const cloud = state({
      savedAt: 100,
      career: career({
        regionsSailed: ['med', 'ausNz'],
        bestCorrectedGapSeconds: 45,
        bestPaceVsOptimalPct: 95,
        updatedAt: 100,
      }),
    });
    const merged = reconcileSaves(local, cloud)!.career!;
    expect(merged.regionsSailed.sort()).toEqual(['ausNz', 'med', 'uk']);
    expect(merged.bestCorrectedGapSeconds).toBe(45); // closest duel wins
    expect(merged.bestPaceVsOptimalPct).toBe(95); // fastest pace wins
    expect(merged.updatedAt).toBe(200);
  });

  it('takes the present side when only one has a record, undefined when neither does', () => {
    const only = career({ racesSailed: 4 });
    expect(reconcileSaves(state({ savedAt: 200, career: only }), state({ savedAt: 100 }))!.career).toEqual(only);
    expect(reconcileSaves(state({ savedAt: 200 }), state({ savedAt: 100, career: only }))!.career).toEqual(only);
    expect(reconcileSaves(state({ savedAt: 200 }), state({ savedAt: 100 }))!.career).toBeUndefined();
  });
});

describe('isNewerSave', () => {
  it('is true only beyond the echo guard', () => {
    const current = state({ savedAt: 1000 });
    expect(isNewerSave(state({ savedAt: 2500 }), current)).toBe(true);
    expect(isNewerSave(state({ savedAt: 1500 }), current)).toBe(false); // within 1000ms guard
    expect(isNewerSave(state({ savedAt: 500 }), current)).toBe(false);
  });
});
