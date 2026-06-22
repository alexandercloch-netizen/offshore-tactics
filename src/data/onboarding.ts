import { ExperienceLevel, SailingGoal, SailingRegion } from '../types';

// Catalogs for the quick onboarding quiz — three taps, playful copy. Each
// option carries the value stored on the player profile plus friendly card text.

export interface Choice<T> {
  value: T;
  label: string;
  blurb: string;
}

export const REGION_OPTIONS: Choice<SailingRegion>[] = [
  { value: 'uk', label: 'UK & Ireland', blurb: 'Solent, Fastnet, the Channel' },
  { value: 'med', label: 'Mediterranean', blurb: 'Sun, Sicily, sundowners' },
  { value: 'caribbean', label: 'Caribbean', blurb: 'Trade winds & rum' },
  { value: 'usEast', label: 'US East Coast', blurb: 'Newport to Bermuda' },
  { value: 'usWest', label: 'US West Coast', blurb: 'Cali to Hawaii' },
  { value: 'greatLakes', label: 'Great Lakes', blurb: 'Freshwater grinders' },
  { value: 'ausNz', label: 'Australia & NZ', blurb: 'Sydney, Hobart, Tasman' },
  { value: 'other', label: 'Somewhere else', blurb: 'Bluewater dreamer' },
];

export const GOAL_OPTIONS: Choice<SailingGoal>[] = [
  { value: 'destress', label: 'Just here to chill', blurb: 'Salt air, zero stress' },
  { value: 'tactics', label: 'Outsmart the fleet', blurb: 'Win the chess match' },
  { value: 'routing', label: 'Crack the weather', blurb: 'Read the wind like a pro' },
  { value: 'compete', label: 'Win, obviously', blurb: 'Top of the podium' },
];

export const EXPERIENCE_OPTIONS: Choice<ExperienceLevel>[] = [
  { value: 'novice', label: 'Landlubber', blurb: 'New to the helm' },
  { value: 'club', label: 'Weekend warrior', blurb: 'Beers & buoys' },
  { value: 'seasoned', label: 'Salty', blurb: 'Plenty of miles' },
  { value: 'pro', label: 'Absolute legend', blurb: 'Pointy-end pro' },
];

// Region → the races that best match it, in preference order. Used to pick a
// recommended race for the player's home waters.
export const REGION_RACES: Record<SailingRegion, string[]> = {
  uk: ['race-round-island', 'race-fastnet'],
  med: ['race-middle-sea'],
  caribbean: ['race-caribbean-600'],
  usEast: ['race-newport-bermuda'],
  usWest: ['race-transpac'],
  greatLakes: ['race-chicago-mac'],
  ausNz: ['race-sydney-hobart'],
  other: ['race-round-island', 'race-chicago-mac'],
};
