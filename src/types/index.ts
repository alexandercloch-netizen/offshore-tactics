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

export interface GeoPoint {
  lat: number;
  lon: number;
}

// A wind sample at a point/time: the direction it blows FROM and its speed.
export interface WindSample {
  fromDeg: number; // degrees the wind is coming FROM (0 = N)
  speedKn: number;
}

// A drifting puff (deltaKn > 0) or hole (deltaKn < 0) in the wind field.
export interface WindFeature {
  lat: number;
  lon: number;
  radiusNm: number;
  deltaKn: number;
  driftDir: number; // bearing the feature drifts toward
  driftKn: number; // drift speed in knots
}

// Analytic spatial + temporal wind field for a race. Drives both the boat's
// speed (via the polar) and the isochrone router; it evolves with elapsed hours
// and varies across the course, so the optimal route changes through the race.
export interface WindField {
  baseDir: number; // prevailing direction FROM
  baseSpeed: number;
  shiftAmpDeg: number; // oscillating shift amplitude
  shiftPeriodH: number;
  shiftPhase: number;
  rotateDegPerH: number; // systematic veer/back (e.g. a front passing through)
  gradientAxisDeg: number; // bearing along which wind speed increases
  gradientPerNm: number; // knots gained per nm along that axis
  refLat: number; // gradient reference point (course centre)
  refLon: number;
  feature: WindFeature;
}

export interface Race {
  id: string;
  name: string;
  location: string;
  description: string;
  distanceNm: number; // course length in nautical miles (gameplay-tuned)
  difficulty: RaceDifficulty;
  waypoints: Waypoint[]; // real course geometry for the map & bearings
  prevailingWind: WindSample; // seasonal prevailing wind that anchors the field
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
  price: number; // purchase / commission cost
}

// ---- Custom boats: real polar diagrams (TWA x TWS speed tables) ----

export type BoatType = 'cruiserRacerIRC' | 'tp52' | 'class40' | 'maxi72';

// Optimum VMG angles & speeds, one entry per TWS column.
export interface PolarTargets {
  beatAngle: number[];
  beatSpeed: number[];
  runAngle: number[];
  runSpeed: number[];
}

// PredictWind-style multiplicative performance scaling (handicap / cruising).
export interface SpeedAdjustment {
  upwindPct: number; // 0-100
  downwindPct: number; // 0-100
  nightPct: number; // 0-100, multiplies on top
}

export interface BoatPolar {
  tws: number[]; // ascending wind-speed columns (kn) — data-driven
  twa: number[]; // ascending wind-angle rows (deg)
  speed: number[][]; // speed[twaIndex][twsIndex] = boat speed (kn)
  targets: PolarTargets;
  source: 'class' | 'imported';
  importedFrom?: 'predictwind' | 'expedition' | 'orc' | 'generic';
}

// ---- Sail inventory: a wardrobe of specialist sails over the base polar ----

// What part of the wind range a sail is cut for.
export type SailCategory = 'headsail' | 'reacher' | 'spinnaker' | 'stormsail';

// A specialist sail the player can add to a boat's wardrobe. The base polar
// already represents the boat's standard wardrobe (the working main + jib +
// all-round kite); a specialist sail lifts boat speed within its operating
// envelope — its crossover — by `boost`, tapering to nothing outside it.
export interface Sail {
  id: string;
  name: string;
  category: SailCategory;
  blurb: string; // human-readable niche, e.g. "light-air reaching"
  twaMin: number; // operating envelope (true wind angle band, deg)
  twaMax: number;
  twsMin: number; // operating envelope (true wind speed band, kn)
  twsMax: number;
  boost: number; // peak fractional speed gain inside the envelope (e.g. 0.08)
  baseCost: number; // price for the cruiser-baseline boat; scaled by class
}

// A boat the player has built/owns, carrying its own polar.
export interface FleetBoat extends Boat {
  custom: true;
  boatType: BoatType;
  polar: BoatPolar; // base polar = the boat with its standard wardrobe
  speedAdjustment: SpeedAdjustment;
  sails?: string[]; // ids of specialist sails added to the wardrobe
}

export interface Profile {
  fleet: FleetBoat[]; // custom boats the player has built (crew & sails come later)
  player?: PlayerProfile; // onboarding answers that personalise the experience
}

// ---- Player profile: captured at onboarding to tailor the experience ----

export type SailorRole =
  | 'owner'
  | 'skipper'
  | 'tactician'
  | 'navigator'
  | 'crew'
  | 'fan';

export type SailingRegion =
  | 'uk'
  | 'med'
  | 'caribbean'
  | 'usEast'
  | 'usWest'
  | 'greatLakes'
  | 'ausNz'
  | 'other';

export type SailingGoal = 'destress' | 'tactics' | 'routing' | 'compete';

export type ExperienceLevel = 'novice' | 'club' | 'seasoned' | 'pro';

export interface PlayerProfile {
  region: SailingRegion;
  goal: SailingGoal;
  experience: ExperienceLevel;
  role?: SailorRole; // optional; not asked in the quick quiz
  boatType?: BoatType; // the class they sail, if any
  onboardedAt: number; // epoch ms the quiz was completed
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

// Player-controlled tactics, adjustable mid-race.
export type RoutingBias = -1 | 0 | 1; // favour left of course / optimal / right
export type EffortMode = 'conserve' | 'cruise' | 'push';

export interface PlayerStrategy {
  bias: RoutingBias;
  effort: EffortMode;
}

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
  distanceCoveredNm: number; // geometric advance toward the finish
  totalDistanceNm: number; // geometric course length (mark to mark)
  elapsedHours: number;
  position: number; // current standing in the fleet
  pointOfSail: PointOfSail; // derived from boat heading vs local wind
  // Live position & weather-routed track:
  lat: number;
  lon: number;
  heading: number; // current heading (bearing of the active route segment)
  nextMarkIndex: number; // index of the next mandatory mark to round
  route: GeoPoint[]; // remaining weather-routed path (route[0] = current pos)
  trail: GeoPoint[]; // track actually sailed so far
  routeWindDir: number; // wind direction the current route was planned for
  routePlannedAtNm: number; // distance covered when the route was last planned
  routeBias: RoutingBias; // the routing bias the current route was planned with
  windDir: number; // local wind direction FROM at the boat
  windSpeedKn: number; // local wind speed at the boat
  // Internal scheduling, hidden from the UI:
  nextDecisionAtNm: number; // distance at which the next decision fires
  decisionsTaken: number;
  shownEventIds: string[]; // ids of decisions already presented, to avoid repeats
}

// An AI competitor sailing the same course & wind field as the player.
export interface Competitor {
  id: string;
  name: string;
  speedMul: number; // skill multiplier on made-good speed
  distanceNm: number; // geometric distance covered along the course
  finishedHours: number | null; // elapsed time at finish, or null if still racing
  retired: boolean;
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
  ownedBoatIds: string[]; // boats already bought — no charter charged again
  selectedCrewIds: string[];
  provisions: ProvisionSelection[];
  progress?: RaceProgress;
  windField?: WindField;
  fleet?: Competitor[];
  strategy: PlayerStrategy;
  profile: Profile; // the player's fleet of custom boats (local-first)
  condition: BoatCondition;
  weather?: WeatherCondition;
  lastResult?: RaceResult;
  history: RaceResult[];
  eventLog: string[];
  tutorialSeen?: boolean; // whether the player has seen the race how-to-play
  savedAt?: number; // epoch ms the save was last written; drives cloud sync reconciliation
}

// Outcome returned by the engine after a simulation step.
export interface StepResult {
  progress: RaceProgress;
  condition: BoatCondition;
  weather: WeatherCondition;
  fleet: Competitor[];
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

// React Navigation route maps
export type MainTabParamList = {
  Race: undefined;
  Fleet: undefined;
  Leaderboard: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Main: { screen?: keyof MainTabParamList } | undefined;
  Onboarding: undefined;
  AuthGate: undefined; // full-screen login wall shown when signed out
  Auth: undefined; // account management when signed in
  RaceSelect: undefined;
  BoatSelect: undefined;
  CrewSelect: undefined;
  Provisioning: undefined;
  Briefing: undefined;
  RaceMap: undefined;
  Results: undefined;
  BoatBuilder: undefined;
  SailLocker: { boatId: string };
};
