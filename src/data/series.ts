import { Series } from '../types';

// The regatta catalogue. A series is data + the pure reducer + display — each
// member day is an ordinary Race (see the seriesId marker in data/races.ts);
// the engine never learns what a series is. Scoring is classic low-point (day
// rank = points, DNC/retired = entrants + 1, one discard once every day is
// sailed), computed from stored results in engine/series.ts.
export const SERIES: Series[] = [
  {
    id: 'series-cowes-week',
    name: 'Cowes Week',
    location: 'The Solent, Isle of Wight',
    description:
      "The oldest and grandest regatta of them all: a week of racing off the Royal Yacht Squadron's cannons, round Solent marks the tide owns as much as the race committee does. Five days, one discard, and the week is decided by whoever squanders least.",
    memberRaceIds: [
      'race-cowes-day1',
      'race-cowes-day2',
      'race-cowes-day3',
      'race-cowes-day4',
      'race-cowes-day5',
    ],
    entryFee: 1500,
    prizeMoney: 15000,
    season: 'August',
  },
  {
    id: 'series-chicago-beercan',
    name: 'Chicago Beer Can Series',
    location: 'Monroe Harbor, Chicago',
    description:
      "Columbia Yacht Club has run Wednesday nights off Monroe Harbor since the 1950s, and the point of it has never been the silverware. Anything over twenty feet, rotate the crew through the jobs, sail the lakefront until the breeze gives out, then raft up on Columbia's Aft Deck for the Navy Pier fireworks. Six Wednesdays, one discard, and the last of the summer light.",
    memberRaceIds: [
      'race-beercan-wk1',
      'race-beercan-wk2',
      'race-beercan-wk3',
      'race-beercan-wk4',
      'race-beercan-wk5',
      'race-beercan-wk6',
    ],
    entryFee: 400,
    prizeMoney: 3000,
    season: 'July',
  },
];

export function getSeriesById(id?: string): Series | undefined {
  return SERIES.find((s) => s.id === id);
}

export function seriesForRace(raceId?: string): Series | undefined {
  return SERIES.find((s) => raceId != null && s.memberRaceIds.includes(raceId));
}

// Mid-week regatta days are LITE members: they sail the full engine (tide,
// weather, everyday + Cowes-local events) but carry no bespoke storyline or
// pinned signature — the week's narrative lives in its bookends (day 1's
// Bramble Scramble, day 5's Decider). The content-floor tests exempt exactly
// these ids; a new series must either kit every day or list its lite days here.
export const SERIES_LITE_MEMBER_IDS: Set<string> = new Set([
  'race-cowes-day2',
  'race-cowes-day3',
  'race-cowes-day4',
  // The mid-summer Wednesdays: the beer cans' narrative lives in opening night
  // and the last Wednesday, exactly as Cowes' does in its bookends.
  'race-beercan-wk2',
  'race-beercan-wk3',
  'race-beercan-wk4',
  'race-beercan-wk5',
]);
