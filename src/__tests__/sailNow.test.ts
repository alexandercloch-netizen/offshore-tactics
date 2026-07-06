import {
  breezeBand,
  breezeQuality,
  compassPoint,
  harbourRead,
  hazardRelevance,
  isInSeason,
  rankRaces,
  seasonMonths,
  seasonalBoardConditions,
  windReadout,
  BoardConditions,
} from '../engine/sailNow';
import { RACES, getRaceById } from '../data';
import { WEATHER_CLIMATOLOGY } from '../data/weatherClimatology';
import { RaceResult, WindSample } from '../types';

// The "where to sail today" ranker is pure and deterministic — same inputs,
// same board, and every why-line says only what the score counted.

const race = (id: string) => getRaceById(id)!;

function conditions(samples: Record<string, WindSample>): BoardConditions {
  return { source: 'seasonal', samples };
}

function finish(raceId: string, position: number): RaceResult {
  return {
    raceId,
    raceName: raceId,
    boatId: 'b',
    finished: true,
    retired: false,
    position,
    fleetSize: 10,
    elapsedHours: 5,
    prizeMoney: 0,
    summary: '',
    timestamp: 1,
  };
}

// Mid-month noon avoids month-boundary flakiness in any CI timezone.
const JUNE = new Date(2026, 5, 15, 12).getTime();
const OCTOBER = new Date(2026, 9, 15, 12).getTime();

describe('season parsing', () => {
  it('reads authored month names, including ranges and asides', () => {
    expect(seasonMonths('July / August')).toEqual([6, 7]);
    expect(seasonMonths('June (biennial)')).toEqual([5]);
    expect(seasonMonths('December')).toEqual([11]);
  });

  it('every catalogue race has a parseable season', () => {
    for (const r of RACES) {
      expect(seasonMonths(r.season).length).toBeGreaterThan(0);
    }
  });

  it('answers the in-season question for a month index', () => {
    expect(isInSeason('July / August', 6)).toBe(true);
    expect(isInSeason('July / August', 5)).toBe(false);
  });
});

describe('the sailor vocabulary', () => {
  it('bands the breeze honestly and contiguously', () => {
    expect(breezeBand(3)).toBe('light');
    expect(breezeBand(12)).toBe('champagne');
    expect(breezeBand(20)).toBe('fresh');
    expect(breezeBand(30)).toBe('heavy');
  });

  it('scores the 10–20 kn sweet spot at 1 and the extremes at 0', () => {
    expect(breezeQuality(3)).toBe(0);
    expect(breezeQuality(14)).toBe(1);
    expect(breezeQuality(26)).toBeCloseTo(0.5);
    expect(breezeQuality(38)).toBe(0);
  });

  it('boxes the compass', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(225)).toBe('SW');
    expect(compassPoint(359)).toBe('N');
    expect(windReadout({ fromDeg: 225, speedKn: 14.4 })).toBe('14 kn SW');
  });
});

describe('hazard relevance', () => {
  it('lights up a light-air trap only in light air', () => {
    expect(hazardRelevance('med_fickle', 6)).toBe(1);
    expect(hazardRelevance('med_fickle', 18)).toBe(0);
  });
  it('wakes a heavy-weather test only in a blow', () => {
    expect(hazardRelevance('bass_strait', 20)).toBe(1);
    expect(hazardRelevance('bass_strait', 8)).toBe(0);
  });
  it('leaves the tide-driven hazards out of the breeze question', () => {
    expect(hazardRelevance('tidal_gate', 6)).toBe(0);
    expect(hazardRelevance('tidal_gate', 20)).toBe(0);
  });
});

describe('rankRaces', () => {
  const trio = [race('race-round-island'), race('race-cowes-dinard'), race('race-malta-syracuse')];

  it('puts the racing breeze on top, over glassy and survival courses', () => {
    const board = rankRaces({
      conditions: conditions({
        'race-round-island': { fromDeg: 270, speedKn: 14 },
        'race-cowes-dinard': { fromDeg: 250, speedKn: 38 },
        'race-malta-syracuse': { fromDeg: 260, speedKn: 3 },
      }),
      history: [],
      now: OCTOBER,
      races: trio,
    });
    expect(board.map((s) => s.race.id)).toEqual([
      'race-round-island',
      // Both extremes score zero breeze; the drifter edges the gale because
      // Malta's fickle-Med signature hazard is live in light air.
      'race-malta-syracuse',
      'race-cowes-dinard',
    ]);
    expect(board[0].quality).toBe(1);
  });

  it('prefers the race whose signature moment the breeze puts in play', () => {
    // Both drifting at 6 kn, both out of season in October, both unwon —
    // Malta–Syracuse's fickle-Med hazard is live in light air; the tidal
    // Cowes–Dinard's is not.
    const board = rankRaces({
      conditions: conditions({
        'race-cowes-dinard': { fromDeg: 250, speedKn: 6 },
        'race-malta-syracuse': { fromDeg: 260, speedKn: 6 },
      }),
      history: [],
      now: OCTOBER,
      races: [race('race-cowes-dinard'), race('race-malta-syracuse')],
    });
    expect(board[0].race.id).toBe('race-malta-syracuse');
    expect(board[0].hazardLive).toBe(true);
  });

  it('ranks an unwon course above a won one, all else equal', () => {
    const board = rankRaces({
      conditions: conditions({
        'race-round-island': { fromDeg: 270, speedKn: 14 },
        'race-cowes-dinard': { fromDeg: 250, speedKn: 14 },
      }),
      history: [finish('race-round-island', 1)],
      now: OCTOBER,
      races: [race('race-round-island'), race('race-cowes-dinard')],
    });
    expect(board[0].race.id).toBe('race-cowes-dinard');
    expect(board[0].notYetWon).toBe(true);
    expect(board[1].notYetWon).toBe(false);
  });

  it('lets the profile recommendation break an otherwise-even tie', () => {
    const pair = [race('race-islands-race'), race('race-swiftsure')];
    const even = conditions({
      'race-islands-race': { fromDeg: 270, speedKn: 14 },
      'race-swiftsure': { fromDeg: 264, speedKn: 14 },
    });
    const withoutRec = rankRaces({ conditions: even, history: [], now: OCTOBER, races: pair });
    expect(withoutRec[0].race.id).toBe('race-islands-race'); // catalogue order tie-break
    const withRec = rankRaces({
      conditions: even,
      history: [],
      now: OCTOBER,
      races: pair,
      recommendedId: 'race-swiftsure',
    });
    expect(withRec[0].race.id).toBe('race-swiftsure');
  });

  it('never lists a locked race', () => {
    const board = rankRaces({
      conditions: seasonalBoardConditions(),
      history: [],
      now: JUNE,
    });
    const ids = board.map((s) => s.race.id);
    expect(ids).not.toContain('race-fastnet'); // locked behind the ladder
    expect(ids).toContain('race-round-island');
  });

  it('assembles the why-line from the parts it actually scored', () => {
    const board = rankRaces({
      conditions: conditions({ 'race-round-island': { fromDeg: 270, speedKn: 14 } }),
      history: [],
      now: JUNE, // Round the Island is a June race
      races: [race('race-round-island')],
    });
    const top = board[0];
    expect(top.inSeason).toBe(true);
    expect(top.why).toContain('14 kn W');
    expect(top.why).toContain('June is its month');
    expect(top.why).not.toContain('great conditions');
  });

  it('is deterministic — the same inputs produce the identical board', () => {
    const input = {
      conditions: seasonalBoardConditions(),
      history: [finish('race-round-island', 2)],
      now: JUNE,
    };
    const a = rankRaces(input);
    const b = rankRaces(input);
    expect(a.map((s) => [s.race.id, s.score, s.why])).toEqual(
      b.map((s) => [s.race.id, s.score, s.why])
    );
  });
});

describe('seasonalBoardConditions', () => {
  it('covers every race from the baked climatology', () => {
    const board = seasonalBoardConditions();
    expect(board.source).toBe('seasonal');
    for (const r of RACES) {
      expect(board.samples[r.id]).toBeDefined();
      const c = WEATHER_CLIMATOLOGY[r.id];
      if (c) expect(board.samples[r.id].speedKn).toBe(c.speedKn);
    }
  });
});

describe('harbourRead', () => {
  it('reads the numbers, band and season character back as one line', () => {
    const line = harbourRead({ fromDeg: 225, speedKn: 14 }, 'the Solent', {
      gustFactor: 0.3,
      variabilityDeg: 50,
    });
    expect(line).toBe('14 kn SW on the Solent — champagne sailing — kite weather');
  });

  it('mentions a puffy or shifty season only when the climatology says so', () => {
    expect(
      harbourRead({ fromDeg: 90, speedKn: 10 }, 'the Med', { gustFactor: 0.59, variabilityDeg: 62 })
    ).toContain('puffy this season');
    expect(
      harbourRead({ fromDeg: 90, speedKn: 10 }, 'the Med', { gustFactor: 0.3, variabilityDeg: 70 })
    ).toContain('shifty this season');
  });
});
