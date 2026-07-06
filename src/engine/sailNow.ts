import { HazardKey, Race, RaceResult, WindSample } from '../types';
import { RACES } from '../data/races';
import { WEATHER_CLIMATOLOGY } from '../data/weatherClimatology';
import { isRaceUnlocked } from './gameEngine';

// The Harbour's "where to sail today" board: a pure, deterministic ranker over
// the unlocked races, scored against the conditions on each course right now
// (live when the flag allows, the baked seasonal climatology otherwise). No
// RNG anywhere — the same inputs always produce the same board, and every
// "why" line is assembled from the actual scoring parts, so the card can never
// claim a reason the score didn't count.

// ---- Conditions -------------------------------------------------------------

// One wind sample per race, with honest provenance: 'live' is a real
// open-meteo reading for the course right now; 'seasonal' is the baked
// climatology for the race's season (the offline/CI/guest path).
export interface BoardConditions {
  source: 'live' | 'seasonal';
  samples: Record<string, WindSample>;
}

// The seasonal fallback: every race gets its climatological mean breeze. Total
// by construction — the climatology coverage test guarantees an entry per race,
// and the prevailing wind backstops a race the bake somehow missed.
export function seasonalBoardConditions(races: Race[] = RACES): BoardConditions {
  const samples: Record<string, WindSample> = {};
  for (const race of races) {
    const c = WEATHER_CLIMATOLOGY[race.id];
    samples[race.id] = c
      ? { fromDeg: c.fromDeg, speedKn: c.speedKn }
      : { ...race.prevailingWind };
  }
  return { source: 'seasonal', samples };
}

// ---- The sailor's vocabulary --------------------------------------------------

// The four honest breeze bands of the Harbour's copy. Contiguous so every
// speed lands somewhere: light under 8 kn, champagne 8–16, fresh to 25,
// heavy beyond.
export type BreezeBand = 'light' | 'champagne' | 'fresh' | 'heavy';

export function breezeBand(speedKn: number): BreezeBand {
  if (speedKn < 8) return 'light';
  if (speedKn <= 16) return 'champagne';
  if (speedKn <= 25) return 'fresh';
  return 'heavy';
}

const BAND_PHRASE: Record<BreezeBand, string> = {
  light: 'drifting conditions — a patience race',
  champagne: 'champagne sailing — kite weather',
  fresh: 'a proper breeze — rail down',
  heavy: 'survival weather — storm canvas',
};

export function bandPhrase(band: BreezeBand): string {
  return BAND_PHRASE[band];
}

// 8-point compass for wind readouts ("14 kn SW").
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassPoint(fromDeg: number): string {
  const norm = ((fromDeg % 360) + 360) % 360;
  return COMPASS[Math.round(norm / 45) % 8];
}

// "14 kn SW" — the one readout format used everywhere on the dashboard.
export function windReadout(sample: WindSample): string {
  return `${Math.round(sample.speedKn)} kn ${compassPoint(sample.fromDeg)}`;
}

// ---- Season -------------------------------------------------------------------

// Race seasons are authored as month names ("July", "July / August",
// "June (biennial)") — southern-hemisphere races carry their real month
// (Sydney Hobart is December), so no hemisphere flip is needed: match the
// month names in the string, honestly, and nothing else.
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

// Month indices (0–11) named in an authored season string.
export function seasonMonths(season: string): number[] {
  const lower = season.toLowerCase();
  return MONTH_NAMES.reduce<number[]>((acc, name, i) => {
    if (lower.includes(name)) acc.push(i);
    return acc;
  }, []);
}

export function isInSeason(season: string, monthIndex: number): boolean {
  return seasonMonths(season).includes(monthIndex);
}

// ---- Scoring ------------------------------------------------------------------

// Breeze quality, 0–1: the racing sweet spot is 10–20 kn; glassy (<5 kn) and
// survival (>32 kn) both score zero, with linear shoulders between.
export function breezeQuality(speedKn: number): number {
  if (speedKn <= 5) return 0;
  if (speedKn < 10) return (speedKn - 5) / 5;
  if (speedKn <= 20) return 1;
  if (speedKn >= 32) return 0;
  return (32 - speedKn) / 12;
}

// Which signature hazards are genuinely wind-dependent. A light-air hazard
// (a drifter's park-up, a fickle sea breeze) is the race's whole story when
// the course is light; a heavy-weather hazard needs a blow to bite. Tide- and
// current-driven hazards run on the clock, not the breeze, so they stay out.
const LIGHT_AIR_HAZARDS: ReadonlySet<HazardKey> = new Set<HazardKey>([
  'light_air',
  'med_fickle',
  'doldrums',
  'island_lee',
]);
const HEAVY_AIR_HAZARDS: ReadonlySet<HazardKey> = new Set<HazardKey>([
  'bass_strait',
  'celtic_weather',
]);

// 1 when the course's breeze makes the signature moment live, else 0. The
// thresholds match the band vocabulary (light < 8, fresh from 17) so a card
// never claims a "light-air trap" in a working breeze.
export function hazardRelevance(hazard: HazardKey, speedKn: number): number {
  if (LIGHT_AIR_HAZARDS.has(hazard) && speedKn < 8) return 1;
  if (HEAVY_AIR_HAZARDS.has(hazard) && speedKn >= 17) return 1;
  return 0;
}

// The scoring weights, in one visible place. Breeze quality dominates (it is
// the whole point of "where to sail TODAY"); season and the ladder tilt the
// order; a live signature hazard is a nudge, not a headline.
export const SAIL_NOW_WEIGHTS = {
  breeze: 10, // × breezeQuality (0–1)
  inSeason: 2, // the race's real month
  ladder: 2, // unlocked but not yet won
  hazard: 1.5, // × hazardRelevance (0–1)
  recommended: 1, // the profile engine's pick (recommend.ts feeds this in)
} as const;

export interface SailNowScore {
  race: Race;
  sample: WindSample;
  score: number;
  // The parts, kept so the why-line can only say what was actually counted.
  quality: number;
  inSeason: boolean;
  hazardLive: boolean;
  notYetWon: boolean;
  recommended: boolean;
  why: string;
}

// One plain sailor's sentence assembled from the scoring parts — the breeze
// verdict always, then the strongest secondary reasons.
function whyLine(s: Omit<SailNowScore, 'why'>, monthName: string): string {
  const readout = windReadout(s.sample);
  const band = breezeBand(s.sample.speedKn);
  const breeze =
    s.quality >= 0.99
      ? `${readout} on the course — ${bandPhrase(band)}`
      : s.quality > 0
        ? `${readout} — workable, if ${s.sample.speedKn < 10 ? 'soft' : 'boisterous'}`
        : `${readout} — ${band === 'light' ? 'glassy out there' : 'survival conditions'}`;

  const reasons: string[] = [];
  if (s.inSeason) reasons.push(`${monthName} is its month`);
  if (s.hazardLive) {
    reasons.push(
      LIGHT_AIR_HAZARDS.has(s.race.hazard)
        ? 'this breeze puts its light-air trap in play'
        : 'this breeze wakes its heavy-weather test'
    );
  }
  if (s.notYetWon) reasons.push('still unwon in your logbook');
  return reasons.length > 0 ? `${breeze}; ${reasons.slice(0, 2).join(', ')}.` : `${breeze}.`;
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface SailNowInput {
  conditions: BoardConditions;
  history: RaceResult[];
  now: number; // epoch ms — the caller passes Date.now(); the ranker stays pure
  recommendedId?: string; // recommend.ts's pick, folded in as ladder fit
  races?: Race[]; // injectable for tests; defaults to the full catalogue
}

// Score every UNLOCKED race and return the board, best first. Ties break by
// catalogue order (stable sort), so the result is fully deterministic.
export function rankRaces(input: SailNowInput): SailNowScore[] {
  const { conditions, history, recommendedId } = input;
  const races = input.races ?? RACES;
  const month = new Date(input.now).getMonth();
  // The ladder cares about wins, not mere finishes — a finished-but-unwon
  // course still owes the player something.
  const winIds = new Set(
    history.filter((r) => r.finished && !r.retired && r.position === 1).map((r) => r.raceId)
  );

  const scored: SailNowScore[] = [];
  for (const race of races) {
    if (!isRaceUnlocked(race, history)) continue;
    const sample = conditions.samples[race.id] ?? { ...race.prevailingWind };
    const quality = breezeQuality(sample.speedKn);
    const inSeason = isInSeason(race.season, month);
    const hazardLive = hazardRelevance(race.hazard, sample.speedKn) > 0;
    const notYetWon = !winIds.has(race.id);
    const recommended = race.id === recommendedId;
    const score =
      SAIL_NOW_WEIGHTS.breeze * quality +
      (inSeason ? SAIL_NOW_WEIGHTS.inSeason : 0) +
      (hazardLive ? SAIL_NOW_WEIGHTS.hazard : 0) +
      (notYetWon ? SAIL_NOW_WEIGHTS.ladder : 0) +
      (recommended ? SAIL_NOW_WEIGHTS.recommended : 0);
    const parts = { race, sample, score, quality, inSeason, hazardLive, notYetWon, recommended };
    scored.push({ ...parts, why: whyLine(parts, MONTH_LABELS[month]) });
  }
  return scored.sort((a, b) => b.score - a.score);
}

// ---- The conditions hero ---------------------------------------------------

// The hero's one-line sailor's read: the readout, the band verdict, and the
// season's character straight from the climatology numbers (a gusty season
// reads "puffy", a swingy one "shifty") — generated, never invented.
export function harbourRead(
  sample: WindSample,
  watersName: string,
  climate?: { gustFactor: number; variabilityDeg: number }
): string {
  const band = breezeBand(sample.speedKn);
  const character =
    climate && climate.gustFactor >= 0.5
      ? ' — puffy this season'
      : climate && climate.variabilityDeg >= 65
        ? ' — shifty this season'
        : '';
  return `${windReadout(sample)} on ${watersName} — ${bandPhrase(band)}${character}`;
}
