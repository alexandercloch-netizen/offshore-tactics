import { reducer, INITIAL_STATE } from '../store/gameReducer';
import { getSeriesById, seriesForRace, SERIES } from '../data/series';
import { seriesStandings, playerSeriesRank, PLAYER_NAME } from '../engine/series';
import { getRaceById } from '../data';
import { GameState, RaceResult, Series } from '../types';

// The regatta layer: pure data + pure scoring + reducer folds. The engine never
// sees a series — these tests pin the whole layer without a race sim.

const cowes = getSeriesById('series-cowes-week')!;

const day = (
  raceId: string,
  position: number,
  order: string[],
  over: Partial<RaceResult> = {}
): RaceResult => ({
  raceId,
  raceName: raceId,
  boatId: 'boat-sprite',
  finished: true,
  retired: false,
  position,
  onWaterPosition: position,
  fleetSize: order.length + 1,
  elapsedHours: 2,
  prizeMoney: 0,
  summary: '',
  timestamp: 1000,
  correctedOrder: order,
  ...over,
});

describe('series catalogue integrity', () => {
  it('every member race exists, carries the seriesId marker, and pays via the series', () => {
    for (const s of SERIES) {
      expect(s.memberRaceIds.length).toBeGreaterThanOrEqual(3);
      for (const id of s.memberRaceIds) {
        const race = getRaceById(id)!;
        expect(race).toBeDefined();
        expect(race.seriesId).toBe(s.id);
        // Money flows through the series, once — member days are free to enter.
        expect(race.divisions.corinthian.entryFee).toBe(0);
        expect(race.divisions.pro.entryFee).toBe(0);
      }
      expect(seriesForRace(s.memberRaceIds[0])?.id).toBe(s.id);
    }
  });
});

describe('seriesStandings — low-point scoring', () => {
  const AI = ['Rán', 'Comanche', 'Leopard'];
  const twoDay: Series = { ...cowes, memberRaceIds: ['race-cowes-day1', 'race-cowes-day2'] };

  it('scores day rank as points and ranks lowest-total first', () => {
    // Day 1: player 1st (AI order Rán, Comanche, Leopard → they score 2,3,4).
    // Day 2: player 3rd (Rán 1, Comanche 2 stay ahead; Leopard 4).
    const history = [
      day('race-cowes-day2', 3, AI),
      day('race-cowes-day1', 1, AI),
    ];
    const rows = seriesStandings(twoDay, history);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    // The 2-of-2 week is COMPLETE, so points are post-discard: player drops the
    // 3 (keeps 1), Rán drops the 2 (keeps 1) — a genuine tie at the top.
    expect(byName[PLAYER_NAME].points).toBe(1);
    expect(byName['Rán'].points).toBe(1);
    // Tie on 3 points (discard only applies when the week is COMPLETE — it is
    // here, 2 of 2 days — so with >1 day each drops the worst: player 1, Rán 1).
    expect(byName[PLAYER_NAME].discarded).toBe(3);
    expect(byName['Rán'].discarded).toBe(2);
    expect(byName[PLAYER_NAME].rank).toBe(1); // 1 vs Rán's 1 → tie, shared rank
    expect(byName['Rán'].rank).toBe(1);
  });

  it('a retired day scores DNF = entrants + 1, and an unsailed week has no discard', () => {
    const oneOfTwo = [day('race-cowes-day1', 2, AI, { retired: true, finished: false })];
    const rows = seriesStandings(twoDay, oneOfTwo);
    const player = rows.find((r) => r.isPlayer)!;
    expect(player.points).toBe(AI.length + 2); // entrants = 4 → DNF 5
    expect(player.discarded).toBeUndefined(); // week incomplete → no discard
  });

  it('re-sailing a day supersedes the old score (newest-first history)', () => {
    const history = [
      day('race-cowes-day1', 1, AI, { timestamp: 2000 }), // the retry, newest
      day('race-cowes-day1', 4, AI, { timestamp: 1000 }),
    ];
    const rows = seriesStandings(twoDay, history);
    expect(rows.find((r) => r.isPlayer)!.points).toBe(1);
  });
});

describe('reducer — the series lifecycle', () => {
  const campaign = (over: Partial<GameState> = {}): GameState =>
    ({ ...INITIAL_STATE, freeSailing: false, ...over });

  it('ENTER_SERIES charges the fee once in Campaign, refuses when broke, and is free in Free Sailing', () => {
    const entered = reducer(campaign({ funds: 5000 }), { type: 'ENTER_SERIES', payload: cowes.id });
    expect(entered.funds).toBe(5000 - cowes.entryFee);
    expect(entered.seriesProgress).toEqual({ seriesId: cowes.id, sailedRaceIds: [] });
    // Re-entering the active series is a no-op (no double charge).
    expect(reducer(entered, { type: 'ENTER_SERIES', payload: cowes.id })).toBe(entered);
    // Broke → refused.
    expect(reducer(campaign({ funds: 100 }), { type: 'ENTER_SERIES', payload: cowes.id }).seriesProgress).toBeUndefined();
    // Free Sailing → no charge.
    const free = reducer({ ...INITIAL_STATE, funds: 100 }, { type: 'ENTER_SERIES', payload: cowes.id });
    expect(free.funds).toBe(100);
    expect(free.seriesProgress?.seriesId).toBe(cowes.id);
  });

  it('FINISH_RACE marks a member day sailed; completing the week settles prize + career', () => {
    const AI = ['Rán', 'Comanche'];
    let s = reducer(campaign({ funds: 20000 }), { type: 'ENTER_SERIES', payload: cowes.id });
    // Sail days 1–4 as wins.
    for (const id of cowes.memberRaceIds.slice(0, 4)) {
      s = reducer(s, { type: 'FINISH_RACE', payload: { result: day(id, 1, AI) } });
    }
    expect(s.seriesProgress?.sailedRaceIds).toHaveLength(4);
    expect(s.career?.seriesWins ?? []).toHaveLength(0); // not yet
    const before = s.funds;
    // The decider: winning it completes and wins the week.
    s = reducer(s, { type: 'FINISH_RACE', payload: { result: day(cowes.memberRaceIds[4], 1, AI) } });
    expect(s.seriesProgress).toBeUndefined(); // the week is over
    expect(s.career?.seriesWins).toEqual([cowes.id]);
    expect(s.funds).toBe(before + cowes.prizeMoney);
  });

  it('a lost week completes without prize or career mark; a non-member finish never touches the series', () => {
    const AI = ['Rán', 'Comanche'];
    let s = reducer({ ...INITIAL_STATE }, { type: 'ENTER_SERIES', payload: cowes.id });
    const funds0 = s.funds;
    for (const id of cowes.memberRaceIds) {
      s = reducer(s, { type: 'FINISH_RACE', payload: { result: day(id, 3, AI) } });
    }
    expect(s.seriesProgress).toBeUndefined();
    expect(s.career?.seriesWins ?? []).toHaveLength(0);
    expect(s.funds).toBe(funds0); // free mode + no prize
    // An ordinary race mid-series leaves progress untouched.
    let t = reducer({ ...INITIAL_STATE }, { type: 'ENTER_SERIES', payload: cowes.id });
    t = reducer(t, { type: 'FINISH_RACE', payload: { result: day('race-round-island', 1, AI) } });
    expect(t.seriesProgress?.sailedRaceIds).toHaveLength(0);
  });

  it('ABANDON_SERIES clears progress; sailed results stay in history (resumable by re-entry)', () => {
    let s = reducer({ ...INITIAL_STATE }, { type: 'ENTER_SERIES', payload: cowes.id });
    s = reducer(s, { type: 'FINISH_RACE', payload: { result: day(cowes.memberRaceIds[0], 1, ['Rán']) } });
    s = reducer(s, { type: 'ABANDON_SERIES' });
    expect(s.seriesProgress).toBeUndefined();
    expect(s.history.some((r) => r.raceId === cowes.memberRaceIds[0])).toBe(true);
    expect(playerSeriesRank(cowes, s.history)).toBe(1); // standings derive regardless
  });
});
