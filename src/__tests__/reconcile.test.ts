import { reconcileSaves, isNewerSave } from '../store/reconcile';
import { GameState, RaceResult, FleetBoat } from '../types';

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

describe('isNewerSave', () => {
  it('is true only beyond the echo guard', () => {
    const current = state({ savedAt: 1000 });
    expect(isNewerSave(state({ savedAt: 2500 }), current)).toBe(true);
    expect(isNewerSave(state({ savedAt: 1500 }), current)).toBe(false); // within 1000ms guard
    expect(isNewerSave(state({ savedAt: 500 }), current)).toBe(false);
  });
});
