import {
  BoatType,
  ExperienceLevel,
  SailingGoal,
  SailingRegion,
  SailorRole,
} from '../types';

// Catalogs for the onboarding quiz. Each option carries a value (stored on the
// player profile) and friendly copy for the cards.

export interface Choice<T> {
  value: T;
  label: string;
  blurb: string;
}

export const ROLE_OPTIONS: Choice<SailorRole>[] = [
  { value: 'owner', label: 'Owner', blurb: 'I own a boat' },
  { value: 'skipper', label: 'Skipper', blurb: 'I helm / run the boat' },
  { value: 'tactician', label: 'Tactician', blurb: 'I call the shifts' },
  { value: 'navigator', label: 'Navigator', blurb: 'I plan the route' },
  { value: 'crew', label: 'Crew', blurb: 'I sail on others’ boats' },
  { value: 'fan', label: 'Enthusiast', blurb: 'I love the sport' },
];

export const REGION_OPTIONS: Choice<SailingRegion>[] = [
  { value: 'uk', label: 'UK & Ireland', blurb: 'Solent, Channel, Celtic Sea' },
  { value: 'med', label: 'Mediterranean', blurb: 'Sicily, Malta, Riviera' },
  { value: 'caribbean', label: 'Caribbean', blurb: 'Antigua & the islands' },
  { value: 'usEast', label: 'US East Coast', blurb: 'Newport, Bermuda, Atlantic' },
  { value: 'usWest', label: 'US West Coast', blurb: 'California & the Pacific' },
  { value: 'greatLakes', label: 'Great Lakes', blurb: 'Chicago, Mackinac' },
  { value: 'ausNz', label: 'Australia & NZ', blurb: 'Sydney, Hobart, Tasman' },
  { value: 'other', label: 'Elsewhere', blurb: 'Bluewater & beyond' },
];

export const GOAL_OPTIONS: Choice<SailingGoal>[] = [
  { value: 'destress', label: 'Unwind', blurb: 'Relax with a race before mine' },
  { value: 'tactics', label: 'Sharpen tactics', blurb: 'Practise the big calls' },
  { value: 'routing', label: 'Weather routing', blurb: 'Learn to read the breeze' },
  { value: 'compete', label: 'Compete', blurb: 'Climb the leaderboard' },
];

export const EXPERIENCE_OPTIONS: Choice<ExperienceLevel>[] = [
  { value: 'novice', label: 'New to it', blurb: 'Still learning the ropes' },
  { value: 'club', label: 'Club racer', blurb: 'Weeknights & weekends' },
  { value: 'seasoned', label: 'Seasoned', blurb: 'Many offshore miles' },
  { value: 'pro', label: 'Pro', blurb: 'I race at the sharp end' },
];

// Boat-class choices reuse the build library; 'none' means they don't sail one.
export const BOAT_CHOICES: Choice<BoatType | 'none'>[] = [
  { value: 'cruiserRacerIRC', label: 'Cruiser-Racer', blurb: 'IRC 40-footer' },
  { value: 'tp52', label: 'TP52', blurb: 'Grand-prix inshore' },
  { value: 'class40', label: 'Class40', blurb: 'Shorthanded offshore' },
  { value: 'maxi72', label: 'Maxi 72', blurb: 'Big-boat pace' },
  { value: 'none', label: 'I don’t own one', blurb: 'Or not sure yet' },
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
