import { CareerRecord, HazardKey, RaceResult } from '../types';
import { getRaceById } from '../data';
import { RACES } from './races';
import { WEATHER_EDITIONS } from './weatherEditions';

// The Honours catalogue — the game's silverware. Each honour is a pure
// PREDICATE over the lifetime record (+ the capped history), authored from the
// real vocabulary of offshore racing: the Fastnet Challenge Cup, the Tattersall
// Cup, St David's Lighthouse. It reads ONLY data that already exists (career
// counters/sets + history + getRaceById) — nothing here samples a race or draws
// RNG, so evaluating honours can never move a golden pin. An honour with no
// backing data simply isn't earned; nothing is invented.
//
// Progress is `{ have, need }`: earned when `have >= need`. A locked honour is a
// GOAL (the trophy case shows its bar), never a dead cell. `id` is the durable
// persistence/seen key — NEVER renumber it.

export type HonourTier = 'burgee' | 'pennant' | 'cup' | 'blueRiband';
export type HonourGroup =
  | 'firstLight'
  | 'conquest'
  | 'seamanship'
  | 'fleet'
  | 'milestones'
  | 'capstone';

export interface Honour {
  id: string; // stable — the persistence/seen key; NEVER renumber
  name: string; // authentic silverware name
  blurb: string; // one earned-state nautical line
  hint: string; // locked-state teaser
  tier: HonourTier;
  group: HonourGroup;
  // Current/target progress, pure over the record. earned = have >= need.
  progress: (c: CareerRecord, h: RaceResult[]) => { have: number; need: number };
}

// ---- Shared reference sets (also used by the rank ladder) -------------------

// The nine marquee courses whose corrected-time win earns a named trophy — and,
// swept together, the Grand Slam. Order is display order in the trophy case.
export const CONQUEST_COURSES: { id: string; name: string; raceId: string }[] = [
  { id: 'gold-roman-bowl', name: 'Gold Roman Bowl', raceId: 'race-round-island' },
  { id: 'mackinac-cup', name: 'Mackinac Cup', raceId: 'race-chicago-mac' },
  { id: 'fastnet-challenge-cup', name: 'Fastnet Challenge Cup', raceId: 'race-fastnet' },
  { id: 'middle-sea-trophy', name: 'Middle Sea Race Trophy', raceId: 'race-middle-sea' },
  { id: 'st-davids-lighthouse', name: "St David's Lighthouse Trophy", raceId: 'race-newport-bermuda' },
  { id: 'caribbean-600-trophy', name: 'RORC Caribbean 600 Trophy', raceId: 'race-caribbean-600' },
  { id: 'tattersall-cup', name: 'Tattersall Cup', raceId: 'race-sydney-hobart' },
  { id: 'king-kalakaua-trophy', name: 'King Kalākaua Trophy', raceId: 'race-transpac' },
  { id: 'nailed-to-the-tree', name: 'Nailed to the Tree', raceId: 'race-r2ak' },
];

export const MARQUEE_RACE_IDS: string[] = CONQUEST_COURSES.map((c) => c.raceId);

// The home-waters classics and terminal capstones — every port's local trophy
// and the end-of-ladder silverware. Separate from CONQUEST_COURSES so the Grand
// Slam keeps its original nine; these cups are their own reason to return.
export const CLASSIC_COURSES: { id: string; name: string; raceId: string }[] = [
  { id: 'st-malo-trophy', name: 'St Malo Trophy', raceId: 'race-cowes-dinard' },
  { id: 'siracusa-cup', name: 'Siracusa Cup', raceId: 'race-malta-syracuse' },
  { id: 'round-antigua-trophy', name: 'Round Antigua Trophy', raceId: 'race-antigua-360' },
  { id: 'annapolis-newport-trophy', name: 'Annapolis–Newport Trophy', raceId: 'race-annapolis-newport' },
  { id: 'islands-race-trophy', name: 'Islands Race Trophy', raceId: 'race-islands-race' },
  { id: 'tri-state-trophy', name: 'Tri-State Trophy', raceId: 'race-tri-state' },
  { id: 'cabbage-tree-trophy', name: 'Cabbage Tree Island Trophy', raceId: 'race-cabbage-tree' },
  { id: 'cape-to-rio-trophy', name: 'Cape to Rio Trophy', raceId: 'race-cape2rio' },
  { id: 'china-sea-trophy', name: 'China Sea Race Trophy', raceId: 'race-china-sea' },
  { id: 'van-isle-trophy', name: 'Van Isle 360 Trophy', raceId: 'race-van-isle' },
  { id: 'founders-trophy', name: 'Founders Trophy', raceId: 'race-marion-bermuda' },
];

// The documented historic editions that ship (weatherEditions.ts), keyed in the
// career record's '<raceId>:<year>' form. Keeper of the Record targets this set.
export const DOCUMENTED_EDITION_KEYS: string[] = Object.values(WEATHER_EDITIONS)
  .filter((s) => s.year != null)
  .map((s) => `${s.raceId}:${s.year}`);

// Every hazard that has a real course (so All Weathers is always achievable) —
// derived from the roster, never hand-listed, so it can't drift from the data.
export const ALL_HAZARDS: HazardKey[] = [...new Set(RACES.map((r) => r.hazard))];

// ---- Small pure helpers over the record ------------------------------------

const won = (c: CareerRecord): string[] => c.wonRaceIds ?? [];
const finishedIds = (c: CareerRecord): string[] => c.finishedRaceIds ?? [];

// Count distinct finished courses whose difficulty is one of `levels`.
function finishedOfDifficulty(c: CareerRecord, levels: string[]): number {
  return finishedIds(c).filter((id) => {
    const race = getRaceById(id);
    return race != null && levels.includes(race.difficulty);
  }).length;
}

// Distinct hazards among the courses finished.
function hazardsFinished(c: CareerRecord): number {
  const set = new Set<string>();
  for (const id of finishedIds(c)) {
    const race = getRaceById(id);
    if (race) set.add(race.hazard);
  }
  return set.size;
}

// The longest run of consecutive races that did NOT end in a retirement, read
// off the history (order-only, so a stable metric). History is capped at 50, so
// this measures the streak within what's remembered — an honest floor.
export function longestCleanStreak(history: RaceResult[]): number {
  let best = 0;
  let run = 0;
  for (const r of history ?? []) {
    if (r.retired) {
      run = 0;
    } else {
      run += 1;
      if (run > best) best = run;
    }
  }
  return best;
}

// ---- The catalogue ----------------------------------------------------------

const classicHonours: Honour[] = CLASSIC_COURSES.map((course) => ({
  id: course.id,
  name: course.name,
  blurb: `Your name is on the ${course.name} — a corrected-time win at its course.`,
  hint: 'Win this course on corrected time to lift the trophy.',
  tier: 'cup' as const,
  group: 'conquest' as const,
  progress: (c: CareerRecord) => ({ have: won(c).includes(course.raceId) ? 1 : 0, need: 1 }),
}));

const conquestHonours: Honour[] = CONQUEST_COURSES.map((course) => ({
  id: course.id,
  name: course.name,
  blurb: `Your name is on the ${course.name} — a corrected-time win at its course.`,
  hint: 'Win this course on corrected time to lift the trophy.',
  tier: 'cup',
  group: 'conquest',
  progress: (c) => ({ have: won(c).includes(course.raceId) ? 1 : 0, need: 1 }),
}));

export const HONOURS: Honour[] = [
  // ---- First Light: the opening rites of a campaign ----
  {
    id: 'cast-off',
    name: 'Cast Off',
    blurb: 'Lines slipped, the campaign begun — your first race entered.',
    hint: 'Enter your first race.',
    tier: 'burgee',
    group: 'firstLight',
    progress: (c) => ({ have: c.racesSailed, need: 1 }),
  },
  {
    id: 'first-blood',
    name: 'First Blood',
    blurb: 'First gun to first finish — a race sailed clean across the line.',
    hint: 'Finish a race.',
    tier: 'burgee',
    group: 'firstLight',
    progress: (c) => ({ have: c.racesFinished, need: 1 }),
  },
  {
    id: 'on-the-board',
    name: 'On the Board',
    blurb: 'Silverware in sight — your first corrected-time podium.',
    hint: 'Finish in the top three on corrected time.',
    tier: 'burgee',
    group: 'firstLight',
    progress: (c) => ({ have: c.podiums, need: 1 }),
  },
  {
    id: 'maiden-win',
    name: 'Maiden Win',
    blurb: 'The gun is yours — a first corrected-time victory.',
    hint: 'Win a race on corrected time.',
    tier: 'pennant',
    group: 'firstLight',
    progress: (c) => ({ have: c.wins, need: 1 }),
  },

  // ---- Conquest: a named trophy per marquee course ----
  ...conquestHonours,
  ...classicHonours,

  // ---- Seamanship: how well the boat was sailed, not just where it placed ----
  {
    id: 'rod-stephens-seamanship',
    name: 'Rod Stephens Seamanship',
    blurb: 'Five races won without a fumbled sail change — flawless boat handling.',
    hint: 'Finish five races with sail changes and no fumbles.',
    tier: 'cup',
    group: 'seamanship',
    progress: (c) => ({ have: c.cleanSailRaces, need: 5 }),
  },
  {
    id: 'in-the-groove',
    name: 'In the Groove',
    blurb: 'A race sailed to within a whisker of the weather-optimal line.',
    hint: 'Reach 97% of the optimal line in a race.',
    tier: 'cup',
    group: 'seamanship',
    progress: (c) => ({ have: Math.round(c.bestPaceVsOptimalPct ?? 0), need: 97 }),
  },
  {
    id: 'ironclad',
    name: 'Ironclad',
    blurb: 'Eight races running without once hoisting the retirement flag.',
    hint: 'Sail eight races in a row without retiring.',
    tier: 'cup',
    group: 'seamanship',
    progress: (_c, h) => ({ have: longestCleanStreak(h), need: 8 }),
  },
  {
    id: 'blue-water',
    name: 'Blue Water',
    blurb: 'An ocean-class passage completed — the deep-water badge.',
    hint: 'Finish an Ocean-class race.',
    tier: 'cup',
    group: 'seamanship',
    progress: (c) => ({ have: finishedOfDifficulty(c, ['Ocean']), need: 1 }),
  },

  // ---- Fleet: how you beat the boats around you ----
  {
    id: 'photo-finish',
    name: 'Photo Finish',
    blurb: 'A win decided by seconds on corrected time — nerve held to the line.',
    hint: 'Win with the nearest rival inside a minute on corrected time.',
    tier: 'pennant',
    group: 'fleet',
    progress: (c) => ({ have: c.photoFinishWins, need: 1 }),
  },
  {
    id: 'giant-killer',
    name: 'Giant Killer',
    blurb: 'Beaten to the line yet first on handicap — the rating turned in your favour.',
    hint: 'Win on corrected time after being beaten across the water.',
    tier: 'cup',
    group: 'fleet',
    progress: (c) => ({ have: c.handicapSwingWins, need: 1 }),
  },
  {
    id: 'corinthian-champion',
    name: 'Corinthian Champion',
    blurb: 'An offshore-grade race won with an amateur crew — the Corinthian ideal.',
    hint: 'Win an Offshore/Ocean race in the Corinthian division.',
    tier: 'cup',
    group: 'fleet',
    progress: (c) => ({ have: c.corinthianOffshoreWins ?? 0, need: 1 }),
  },

  // ---- Milestones: miles under the keel, races in the wake ----
  {
    id: 'miles-500',
    name: 'Miles in the Wake',
    blurb: '500 nautical miles logged across finished races.',
    hint: 'Log 500 nm of finished races.',
    tier: 'burgee',
    group: 'milestones',
    progress: (c) => ({ have: Math.round(c.nmLogged), need: 500 }),
  },
  {
    id: 'miles-2500',
    name: 'Ocean Wanderer',
    blurb: '2,500 nautical miles in the wake — a serious sea mileage.',
    hint: 'Log 2,500 nm of finished races.',
    tier: 'pennant',
    group: 'milestones',
    progress: (c) => ({ have: Math.round(c.nmLogged), need: 2500 }),
  },
  {
    id: 'miles-10000',
    name: 'Circumnavigator',
    blurb: '10,000 nautical miles logged — the miles of a life afloat.',
    hint: 'Log 10,000 nm of finished races.',
    tier: 'cup',
    group: 'milestones',
    progress: (c) => ({ have: Math.round(c.nmLogged), need: 10000 }),
  },
  {
    id: 'miles-25000',
    name: 'Master of the Oceans',
    blurb: '25,000 nautical miles in your wake — a world of water sailed.',
    hint: 'Log 25,000 nm of finished races.',
    tier: 'blueRiband',
    group: 'milestones',
    progress: (c) => ({ have: Math.round(c.nmLogged), need: 25000 }),
  },
  {
    id: 'the-century',
    name: 'The Century',
    blurb: 'One hundred races entered — a campaign of true endurance.',
    hint: 'Enter 100 races.',
    tier: 'cup',
    group: 'milestones',
    progress: (c) => ({ have: c.racesSailed, need: 100 }),
  },

  // ---- Capstone: the blue-riband achievements a whole career builds toward ----
  {
    id: 'grand-slam',
    name: 'The Grand Slam',
    blurb: 'A corrected-time win at all nine marquee courses — the complete offshore sailor.',
    hint: 'Win all nine marquee courses on corrected time.',
    tier: 'blueRiband',
    group: 'capstone',
    progress: (c) => ({
      have: MARQUEE_RACE_IDS.filter((id) => won(c).includes(id)).length,
      need: MARQUEE_RACE_IDS.length,
    }),
  },
  {
    id: 'keeper-of-the-record',
    name: 'Keeper of the Record',
    blurb: 'Every documented historic edition sailed to the finish — the archive, kept.',
    hint: 'Finish every documented historic edition.',
    tier: 'blueRiband',
    group: 'capstone',
    progress: (c) => ({
      have: (c.historicEditions ?? []).filter((k) => DOCUMENTED_EDITION_KEYS.includes(k)).length,
      need: DOCUMENTED_EDITION_KEYS.length,
    }),
  },
  {
    id: 'all-weathers',
    name: 'All Weathers',
    blurb: 'A race finished under every signature hazard the oceans throw — nothing unseen.',
    hint: 'Finish a race of every hazard type.',
    tier: 'blueRiband',
    group: 'capstone',
    progress: (c) => ({ have: hazardsFinished(c), need: ALL_HAZARDS.length }),
  },
];

// Display order + label for the trophy case's group headers.
export const HONOUR_GROUPS: { key: HonourGroup; label: string }[] = [
  { key: 'firstLight', label: 'First Light' },
  { key: 'conquest', label: 'Conquest' },
  { key: 'seamanship', label: 'Seamanship' },
  { key: 'fleet', label: 'Fleet' },
  { key: 'milestones', label: 'Milestones' },
  { key: 'capstone', label: 'Capstone' },
];

export function getHonourById(id: string): Honour | undefined {
  return HONOURS.find((h) => h.id === id);
}
