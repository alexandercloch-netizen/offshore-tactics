import { Race, SailingRegion } from '../../types';
import { RACES } from '../../data/races';
import { REGION_RACES } from '../../data/onboarding';

// Chart-side metadata for the seven real sailing regions (the 'other'
// onboarding answer borrows their races and gets no station of its own).
// Labels are deliberately SHORT — they live on pins on a small chart — and
// deliberately NOT the onboarding card labels ('UK & Ireland' etc.), which the
// e2e clicks by exact text during the quiz while the Harbour is mounted below.

export type RegionKey = Exclude<SailingRegion, 'other'>;

export const REGION_KEYS: RegionKey[] = [
  'uk',
  'med',
  'caribbean',
  'usEast',
  'usWest',
  'greatLakes',
  'ausNz',
];

export const REGION_META: Record<RegionKey, { short: string; waters: string }> = {
  uk: { short: 'UK', waters: 'the Solent' },
  med: { short: 'Med', waters: 'the Middle Sea' },
  caribbean: { short: 'Caribbean', waters: 'the trade winds' },
  usEast: { short: 'US East', waters: 'the Eastern Seaboard' },
  usWest: { short: 'US West', waters: 'the Pacific coast' },
  greatLakes: { short: 'Lakes', waters: 'the Great Lakes' },
  ausNz: { short: 'Aus/NZ', waters: 'the Tasman' },
};

// The races of a region, resolved to full Race records in preference order.
export function regionRaces(region: RegionKey): Race[] {
  return (REGION_RACES[region] ?? [])
    .map((id) => RACES.find((r) => r.id === id))
    .filter((r): r is Race => !!r);
}

// The region a race belongs to (each race is listed under exactly one real
// region; 'other' only borrows).
export function regionOfRace(raceId: string): RegionKey | undefined {
  return REGION_KEYS.find((key) => (REGION_RACES[key] ?? []).includes(raceId));
}

// The player's chartable home region: their onboarding answer when it maps to
// a station, else the region of the race the profile engine recommends, else
// the UK (the catalogue's home waters).
export function homeRegion(
  playerRegion: SailingRegion | undefined,
  recommendedId: string | undefined
): RegionKey {
  if (playerRegion && playerRegion !== 'other') return playerRegion;
  const fromRec = recommendedId ? regionOfRace(recommendedId) : undefined;
  return fromRec ?? 'uk';
}

// Pin-sized race names: sponsors and the generic tail dropped, long titles
// clipped at a word break; the one name that resists both gets an override.
const SPONSOR_PREFIXES = ['Rolex ', 'RORC '];
const NAME_OVERRIDES: Record<string, string> = {
  'race-chicago-mac': 'Race to Mackinac',
};
export function shortRaceName(race: Pick<Race, 'id' | 'name'>): string {
  const override = NAME_OVERRIDES[race.id];
  if (override) return override;
  let short = race.name;
  for (const prefix of SPONSOR_PREFIXES) {
    if (short.startsWith(prefix)) short = short.slice(prefix.length);
  }
  short = short.replace(/ (Race|Regatta)$/, '');
  if (short.length <= 20) return short;
  const words = short.split(' ');
  let out = words[0];
  for (let i = 1; i < words.length && (out + ' ' + words[i]).length <= 20; i += 1) {
    out += ' ' + words[i];
  }
  return out;
}
