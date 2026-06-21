// Core domain types for Offshore Tactics

export type RaceDifficulty = 'Inshore' | 'Coastal' | 'Offshore' | 'Ocean';

export interface Race {
  id: string;
  name: string;
  location: string;
  description: string;
  distanceNm: number; // course length in nautical miles
  difficulty: RaceDifficulty;
  totalLegs: number; // number of tactical legs in the course
  fleetSize: number; // number of competing boats
  entryFee: number;
  prizeMoney: number; // first-place purse
  recordTimeHours: number; // course record, used as a pace benchmark
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

export interface GameEvent {
  id: string;
  title: string;
  prompt: string;
  pointOfSail?: PointOfSail;
  choices: TacticalChoice[];
}

export interface RaceProgress {
  currentLeg: number; // legs completed
  totalLegs: number;
  elapsedHours: number;
  distanceCoveredNm: number;
  position: number; // current standing in the fleet
}

export interface BoatCondition {
  hullIntegrity: number; // 0-100
  crewStamina: number; // 0-100 (fleet average)
  crewMorale: number; // 0-100 (fleet average)
}

export interface RaceResult {
  raceId: string;
  raceName: string;
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

// Outcome returned by the engine after sailing a leg
export interface LegOutcome {
  progress: RaceProgress;
  condition: BoatCondition;
  weather: WeatherCondition;
  pointOfSail: PointOfSail;
  legHours: number;
  log: string;
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
