// The fatality vet for historic weather editions — HAND-WRITTEN, never
// generated. This is a hard product rule: we celebrate storied, safely-sailed
// races, and we do not make a game scenario of weather in which sailors lost
// their lives. Any running listed here can never ship as an edition; the
// weatherEditions test fails the build if one does. When curating a new
// edition, research the running first and extend this list before the bake.
//
// The list is deliberately conservative and grows monotonically — entries are
// added, never removed. Keep the entries plain and respectful: a race id, a
// year, and where the record of that running lives. No detail beyond that
// belongs in this codebase.

export interface ExcludedEdition {
  raceId: string;
  year: number;
  reason: 'loss-of-life';
  sourceUrl: string;
}

export const EXCLUDED_EDITIONS: ExcludedEdition[] = [
  {
    raceId: 'race-fastnet',
    year: 1979,
    reason: 'loss-of-life',
    sourceUrl: 'https://en.wikipedia.org/wiki/1979_Fastnet_Race',
  },
  {
    raceId: 'race-sydney-hobart',
    year: 1998,
    reason: 'loss-of-life',
    sourceUrl: 'https://en.wikipedia.org/wiki/1998_Sydney_to_Hobart_Yacht_Race',
  },
  {
    raceId: 'race-sydney-hobart',
    year: 2024,
    reason: 'loss-of-life',
    sourceUrl: 'https://en.wikipedia.org/wiki/2024_Sydney_to_Hobart_Yacht_Race',
  },
  {
    raceId: 'race-chicago-mac',
    year: 2011,
    reason: 'loss-of-life',
    sourceUrl: 'https://en.wikipedia.org/wiki/Chicago_to_Mackinac_Boat_Race',
  },
  {
    raceId: 'race-newport-bermuda',
    year: 2022,
    reason: 'loss-of-life',
    sourceUrl: 'https://en.wikipedia.org/wiki/Newport_Bermuda_Race',
  },
];
