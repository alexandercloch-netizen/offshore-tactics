import { ExperienceLevel, PortId, SailingGoal, SailingRegion } from '../types';

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
// recommended race for the player's home waters. The home-port classic — the
// accessible, always-open local race — leads each list as the region's on-ramp;
// the crown jewels follow.
export const REGION_RACES: Record<SailingRegion, string[]> = {
  uk: ['race-cowes-dinard', 'race-round-island', 'race-fastnet'],
  med: ['race-malta-syracuse', 'race-giraglia', 'race-middle-sea'],
  caribbean: ['race-antigua-360', 'race-caribbean-600'],
  usEast: ['race-block-island', 'race-annapolis-newport', 'race-marion-bermuda', 'race-newport-bermuda'],
  usWest: ['race-ensenada', 'race-islands-race', 'race-transpac', 'race-swiftsure', 'race-van-isle', 'race-r2ak'],
  greatLakes: ['race-tri-state', 'race-bayview-mac', 'race-chicago-mac'],
  ausNz: ['race-cabbage-tree', 'race-sydney-goldcoast', 'race-sydney-hobart'],
  other: ['race-faerder', 'race-round-island', 'race-chicago-mac'],
};

// ---- Home ports ----
//
// One real harbour per sailing region: the player's home-port identity. Each
// port carries its local fleet's crown-jewel race for flavour; the accessible
// home race is whatever leads REGION_RACES for the port's region.
export interface Port {
  id: PortId;
  name: string; // display name, e.g. "Cowes, Isle of Wight"
  region: SailingRegion;
  crownJewelRaceId: string; // the port's famous race (must be a real race id)
  club: string; // the port's home yacht club — the burgee flown on the Sailor's Card
}

export const PORTS: Port[] = [
  { id: 'cowes', name: 'Cowes, Isle of Wight', region: 'uk', crownJewelRaceId: 'race-fastnet', club: 'Royal Yacht Squadron' },
  { id: 'valletta', name: 'Valletta, Malta', region: 'med', crownJewelRaceId: 'race-middle-sea', club: 'Royal Malta Yacht Club' },
  { id: 'antigua', name: 'English Harbour, Antigua', region: 'caribbean', crownJewelRaceId: 'race-caribbean-600', club: 'Antigua Yacht Club' },
  { id: 'newportRI', name: 'Newport, Rhode Island', region: 'usEast', crownJewelRaceId: 'race-newport-bermuda', club: 'New York Yacht Club' },
  { id: 'sanPedro', name: 'San Pedro, California', region: 'usWest', crownJewelRaceId: 'race-transpac', club: 'Los Angeles Yacht Club' },
  { id: 'portTownsend', name: 'Port Townsend, Washington', region: 'usWest', crownJewelRaceId: 'race-r2ak', club: 'Port Townsend Yacht Club' },
  { id: 'chicago', name: 'Chicago, Illinois', region: 'greatLakes', crownJewelRaceId: 'race-chicago-mac', club: 'Chicago Yacht Club' },
  { id: 'sydney', name: 'Sydney, New South Wales', region: 'ausNz', crownJewelRaceId: 'race-sydney-hobart', club: 'Cruising Yacht Club of Australia' },
];

export function getPortById(id?: PortId): Port | undefined {
  return PORTS.find((p) => p.id === id);
}

// The default home port for an onboarding region — the first port in that
// region's waters ('other' has none; the profile simply carries no port).
export function defaultPortForRegion(region?: SailingRegion): PortId | undefined {
  return PORTS.find((p) => p.region === region)?.id;
}
