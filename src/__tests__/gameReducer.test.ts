import { reducer, INITIAL_STATE, Action } from '../store/gameReducer';
import { STARTING_FUNDS, STIPEND_FLOOR } from '../data';
import { GameState, RaceResult } from '../types';

// The GameContext reducer is the economy + progression state machine — pure
// (state, action) => state, so unit-testable in isolation. These pins guard the
// money and career invariants that had no net: funds can't go negative, a finish
// folds the career exactly once, and history stays capped. (The UI gates these
// today; the reducer is the source of truth and must be safe on its own.)

const base = (over: Partial<GameState> = {}): GameState => ({ ...INITIAL_STATE, ...over });

const result = (over: Partial<RaceResult> = {}): RaceResult => ({
  raceId: 'race-round-island',
  raceName: 'Round the Island',
  boatId: 'boat-sprite',
  finished: true,
  retired: false,
  position: 1,
  onWaterPosition: 1,
  fleetSize: 20,
  elapsedHours: 10,
  prizeMoney: 4000,
  summary: '',
  timestamp: 1000,
  ...over,
});

describe('economy — funds never go negative', () => {
  it('BUY_SAIL and ADD_FLEET_BOAT refuse an unaffordable purchase (no negative funds)', () => {
    const poor = base({ funds: 100, profile: { fleet: [{ id: 'b1', sails: [] } as never] } });
    const afterSail = reducer(poor, { type: 'BUY_SAIL', payload: { boatId: 'b1', sailId: 'code-zero', cost: 5000 } });
    expect(afterSail).toBe(poor); // refused, unchanged
    expect(afterSail.funds).toBe(100);

    const afterBoat = reducer(poor, {
      type: 'ADD_FLEET_BOAT',
      payload: { boat: { id: 'b2' } as never, cost: 5000 },
    });
    expect(afterBoat.funds).toBe(100);
    expect(afterBoat.profile.fleet).toHaveLength(1); // not added
  });

  it('an affordable purchase subtracts exactly the cost', () => {
    const rich = base({ funds: 10000, profile: { fleet: [{ id: 'b1', sails: [] } as never] } });
    const after = reducer(rich, { type: 'BUY_SAIL', payload: { boatId: 'b1', sailId: 'code-zero', cost: 5000 } });
    expect(after.funds).toBe(5000);
    expect(after.profile.fleet[0].sails).toEqual(['code-zero']);
  });

  it('BUY_SAIL is idempotent; SELL_SAIL refunds and removes', () => {
    const owned = base({ funds: 10000, profile: { fleet: [{ id: 'b1', sails: ['code-zero'] } as never] } });
    const dupe = reducer(owned, { type: 'BUY_SAIL', payload: { boatId: 'b1', sailId: 'code-zero', cost: 5000 } });
    expect(dupe.profile.fleet[0].sails).toEqual(['code-zero']); // no duplicate
    expect(dupe.funds).toBe(5000); // still charged (matches shipped behavior)

    const sold = reducer(owned, { type: 'SELL_SAIL', payload: { boatId: 'b1', sailId: 'code-zero', refund: 2000 } });
    expect(sold.funds).toBe(12000);
    expect(sold.profile.fleet[0].sails).toEqual([]);
  });
});

describe('FINISH_RACE — career folds exactly once', () => {
  it('adds prize money, prepends history, and counts the win once', () => {
    const s0 = base({ funds: 1000, history: [], career: undefined });
    const s1 = reducer(s0, { type: 'FINISH_RACE', payload: { result: result({ prizeMoney: 4000, position: 1 }) } });
    expect(s1.funds).toBe(5000);
    expect(s1.history).toHaveLength(1);
    expect(s1.career?.racesFinished).toBe(1);
    expect(s1.career?.wins).toBe(1);

    // A SECOND finish must count the career exactly once more — not re-fold the
    // now-in-history first result (the double-count trap the composition guards).
    const s2 = reducer(s1, { type: 'FINISH_RACE', payload: { result: result({ prizeMoney: 0, position: 5, timestamp: 2000 }) } });
    expect(s2.career?.racesFinished).toBe(2);
    expect(s2.career?.wins).toBe(1); // the 5th place didn't add a win
    expect(s2.history).toHaveLength(2);
  });

  it('caps history at 50, newest first', () => {
    const fifty = Array.from({ length: 50 }, (_, i) => result({ timestamp: i }));
    const s = reducer(base({ history: fifty }), {
      type: 'FINISH_RACE',
      payload: { result: result({ timestamp: 9999 }) },
    });
    expect(s.history).toHaveLength(50);
    expect(s.history[0].timestamp).toBe(9999); // newest prepended
  });
});

describe('campaign lifecycle', () => {
  it('PREPARE_NEXT_RACE tops up a broke campaign to the stipend floor and clears race state', () => {
    const broke = base({ funds: 500, selectedRaceId: 'race-fastnet', progress: {} as never });
    const next = reducer(broke, { type: 'PREPARE_NEXT_RACE' });
    expect(next.funds).toBe(STIPEND_FLOOR);
    expect(next.selectedRaceId).toBeUndefined();
    expect(next.progress).toBeUndefined();
  });

  it('RESET_CAMPAIGN returns a fresh campaign', () => {
    const played = base({ funds: 12345, history: [result()], ownedBoatIds: ['boat-sprite'] });
    const fresh = reducer(played, { type: 'RESET_CAMPAIGN' });
    expect(fresh.funds).toBe(STARTING_FUNDS);
    expect(fresh.history).toEqual([]);
    expect(fresh.ownedBoatIds).toEqual([]);
  });

  it('the default case is a pure passthrough', () => {
    const s = base({ funds: 999 });
    expect(reducer(s, { type: 'NONSENSE' } as unknown as Action)).toBe(s);
  });
});

describe('display-only "seen" flags', () => {
  it('SET_SCORING_SEEN and SET_TUTORIAL_SEEN set their flag and touch nothing else', () => {
    const s0 = base({ funds: 4242, scoringSeen: false, tutorialSeen: false });
    const s1 = reducer(s0, { type: 'SET_SCORING_SEEN' });
    expect(s1.scoringSeen).toBe(true);
    expect(s1.tutorialSeen).toBe(false);
    expect(s1.funds).toBe(4242);

    const s2 = reducer(s1, { type: 'SET_TUTORIAL_SEEN' });
    expect(s2.tutorialSeen).toBe(true);
    expect(s2.scoringSeen).toBe(true); // still set
  });
});
