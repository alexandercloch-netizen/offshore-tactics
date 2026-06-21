// Core domain types for Offshore Tactics

export type RaceDifficulty = 'Inshore' | 'Coastal' | 'Offshore' | 'Ocean';

// Which division the player enters. Corinthian = amateur-friendly (cheaper
// entry, smaller purse, a more forgiving pace target). Pro = the full-bore
// fleet (steeper entry, bigger purse, you must be near record pace to win).
export type DivisionKey = 'corinthian' | 'pro';

export interface RaceDivision {
  entryFee: number;
  prizeMoney: number; // first-place purse for this division
  fleetSize: number;
  paceTarget: number; // multiplier on recordTimeHours used for positioning
}

// Signature challenge that biases a race's weather and unlocks a special event.
export type HazardKey =
  | 'tidal_gate'
  | 'light_air'
  | 'med_fickle'
  | 'gulf_stream'
  | 'celtic_weather'
  | 'island_accel'
  | 'bass_strait'
  | 'doldrums';

export type WaypointType = 'start' | 'turn' | 'island' | 'mark' | 'finish';

export interface Waypoint {
  name: string;
  lat: number;
  lon: number;
  type: WaypointType;
}

export interface Race {
  id: string;
  name: string;
  location: string;
  description: string;
  distanceNm: number; // course length in nautical miles (gameplay-tuned)
  difficulty: RaceDifficulty;
  waypoints: Waypoint[]; // real course geometry for the map & bearings
  recordTimeHours: number; // course record, used as a pace benchmark
  corinthianRating: number; // 1-5, higher = more accessible to amateur crews
  hazard: HazardKey;
  signatureHazard: string; // human-readable description of the signature challenge
  season: string; // when the race is traditionally run
  unlockAfter?: string; // race id that must be finished to unlock this one
  divisions: Record<DivisionKey, RaceDivision>;
}

export interface Boat {
  id: string;
  name: string;
  className: string;
  description: string;
  baseSpeed: number; // boat speed in knots in ideal conditions
  upwind: number; // 0-100 pointing ability
  downwind: number; // 0-100 running ability
  stability: number; // 0-100 resistance to heavy-weather damage
  crewCapacity: number; // max crew berths
  price: number; // charter cost for the campaign
}

export type CrewRole = 'Skipper' | 'Navigator' | 'Tactician' | 'Trimmer' | 'Bowman';

export interface CrewMember {
  id: string;
  name: string;
  role: CrewRole;
  skill: number; // 0-100
  stamina: number; // 0-100
  morale: number; // 0-100
  wage: number; // cost to sign for the campaign
  bio: string;
}

export type ProvisionCategory = 'Food' | 'Water' | 'Medical' | 'Spares' | 'Safety';

export interface Provision {
  id: string;
  name: string;
  category: ProvisionCategory;
  description: string;
  unitCost: number;
  staminaBoost: number; // applied per unit at start of race
  moraleBoost: number;
  repairBoost: number; // bonus hull integrity
  safetyBoost: number; // reduces incident risk
}

export interface ProvisionSelection {
  provisionId: string;
  quantity: number;
}

export type WindStrength =
  | 'Calm'
  | 'Light'
  | 'Moderate'
  | 'Fresh'
  | 'Strong'
  | 'Gale';

export type PointOfSail = 'Upwind' | 'Reach' | 'Downwind';

export interface WeatherCondition {
  id: string;
  label: string;
  windStrength: WindStrength;
  windSpeedKts: number;
  windDirection: number; // degrees the wind is coming FROM (0 = N)
  description: string;
  speedModifier: number; // multiplier on boat speed
  riskModifier: number; // added incident risk (0-1 scale contribution)
}

export interface TacticalChoice {
  id: string;
  label: string;
  description: string;
  timeDelta: number; // hours added (negative = time saved)
  staminaDelta: number;
  moraleDelta: number;
  hullDelta: number; // hull integrity change
  risk: number; // 0-1 chance of an adverse twist
}

export type EventKind = 'tactical' | 'weather' | 'mob' | 'hazard';

export interface GameEvent {
  id: string;
  title: string;
  prompt: string;
  kind: EventKind;
  pointOfSail?: PointOfSail;
  hazard?: HazardKey; // present on hazard-specific events
  choices: TacticalChoice[];
}

// Velocity-made-good preview shown in the tactical decision modal: the current
// VMG and the projected VMG for each choice.
export interface VmgPreview {
  before: number;
  after: Record<string, number>;
}

export interface RaceProgress {
  distanceCoveredNm: number;
  totalDistanceNm: number;
  elapsedHours: number;
  position: number; // current standing in the fleet
  pointOfSail: PointOfSail; // derived from current course bearing vs wind
  // Internal scheduling, hidden from the UI:
  nextDecisionAtNm: number; // distance at which the next decision fires
  decisionsTaken: number;
}

export interface BoatCondition {
  hullIntegrity: number; // 0-100
  crewStamina: number; // 0-100 (fleet average)
  crewMorale: number; // 0-100 (fleet average)
}

export interface RaceResult {
  raceId: string;
  raceName: string;
  division?: DivisionKey;
  boatId: string;
  finished: boolean;
  retired: boolean;
  position: number;
  fleetSize: number;
  elapsedHours: number;
  prizeMoney: number;
  summary: string;
  timestamp: number;
}

export interface GameState {
  funds: number;
  selectedRaceId?: string;
  selectedDivision: DivisionKey;
  selectedBoatId?: string;
  selectedCrewIds: string[];
  provisions: ProvisionSelection[];
  progress?: RaceProgress;
  condition: BoatCondition;
  weather?: WeatherCondition;
  lastResult?: RaceResult;
  history: RaceResult[];
  eventLog: string[];
}

// Outcome returned by the engine after a simulation step.
export interface StepResult {
  progress: RaceProgress;
  condition: BoatCondition;
  weather: WeatherCondition;
  event: GameEvent | null; // a decision that interrupts the auto-play, if any
  log?: string;
  finished: boolean;
  retired: boolean;
}

// Global leaderboard row (mirrors the Supabase `leaderboard` table)
export interface LeaderboardEntry {
  id?: string;
  user_id: string;
  display_name: string;
  race_id: string;
  race_name: string;
  position: number;
  fleet_size: number;
  elapsed_hours: number;
  prize_money: number;
  retired: boolean;
  created_at?: string;
}

// React Navigation route map
export type RootStackParamList = {
  Home: undefined;
  Auth: undefined;
  Leaderboard: undefined;
  RaceSelect: undefined;
  BoatSelect: undefined;
  CrewSelect: undefined;
  Provisioning: undefined;
  RaceMap: undefined;
  Results: undefined;
};
