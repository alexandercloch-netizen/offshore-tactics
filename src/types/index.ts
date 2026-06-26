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
  | 'doldrums'
  | 'tidal_rapids';

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

// A travelling weather front: a line sweeping across the course, with the wind
// veering/backing and building/easing as it passes — the banded structure real
// charts show.
export interface WindFront {
  bearing: number; // direction the front line advances toward (its normal)
  posNmAt0: number; // signed offset of the line from the ref point at t=0, along the normal
  speedKn: number; // how fast the line propagates along the normal
  widthNm: number; // transition width across the front
  dirShiftDeg: number; // total direction change from pre- to post-frontal
  speedDeltaKn: number; // total speed change from pre- to post-frontal
}

// Fine, static spatial texture — the small-scale streakiness of real wind, as
// two crossed sinusoids over the course.
export interface WindTexture {
  ampKn: number;
  scaleANm: number;
  scaleBNm: number;
  phaseA: number;
  phaseB: number;
  dirDeg: number; // orientation of the texture grid
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
  feature: WindFeature; // the headline drifting system (drawn on the chart)
  features?: WindFeature[]; // all drifting systems (incl. the headline); summed when sampling
  front?: WindFront; // a travelling front sweeping the course
  diurnalAmpKn?: number; // day/night swing in strength
  diurnalPhaseH?: number; // phase of the diurnal cycle, in hours
  texture?: WindTexture; // fine spatial streakiness
}

// ---- Tidal currents ----

// The set & rate of the tidal stream at a point and time. `setDeg` is the
// direction the water flows TOWARD (0 = N); `rateKn` is its speed.
export interface CurrentSample {
  setDeg: number;
  rateKn: number;
}

// A tidal stream sample at a grid point, for drawing current arrows on the chart.
export interface CurrentArrow {
  lat: number;
  lon: number;
  setDeg: number; // the way the stream sets TOWARD
  rateKn: number;
}

// A tide gate: a headland or channel where the stream runs harder. Amplifies the
// rate within `radiusNm` of the point, tapering to nothing at the edge.
export interface TideGate {
  lat: number;
  lon: number;
  radiusNm: number;
  gain: number; // peak extra multiple of the rate at the centre (e.g. 1 = double)
}

// Per-race tidal data (authored on the Race). A semidiurnal flood/ebb stream on
// a principal axis, optionally amplified at named marks (tide gates). Absent or
// zero-rate → a slack course that sails exactly as before.
export interface TideProfile {
  floodDeg: number; // direction the flood stream sets TOWARD
  peakRateKn: number; // peak (springs-ish) stream rate at mid-flood/ebb
  periodH?: number; // tidal period; defaults to the semidiurnal 12.42h
  gates?: { waypoint: string; gain: number; radiusNm: number }[]; // amplify near a mark
  // A persistent ocean current on top of (or instead of) the oscillating tide —
  // the Gulf Stream, the EAC, a trade-wind drift. Unlike the tide it does NOT
  // reverse; it's a steady vector, gate-amplified like the tide. peakRateKn may be
  // 0 for a pure-current course (no shelf tide).
  driftDeg?: number; // direction the steady current sets TOWARD
  driftKn?: number; // steady current rate
}

// Resolved, race-ready tidal field: an oscillating stream evolving with elapsed
// hours, with the gate marks resolved to coordinates. Mirrors WindField.
export interface TidalField {
  floodDeg: number;
  peakRateKn: number;
  periodH: number;
  phaseH: number; // where in the cycle the gun fires (seeded at race setup)
  gates: TideGate[];
  driftDeg: number; // steady (non-reversing) ocean current set
  driftKn: number; // steady current rate (0 = none)
  refLat: number;
  refLon: number;
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
  hazardWaypoint: string; // name of the mark where the signature challenge bites
  signatureHazard: string; // human-readable description of the signature challenge
  season: string; // when the race is traditionally run
  unlockAfter?: string; // race id that must be finished to unlock this one
  tide?: TideProfile; // tidal stream for the course (absent → slack water)
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
  ratingTcc?: number; // IRC-style time correction coefficient (corrected = elapsed × TCC); derived if absent
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

// Display currency for the (abstract, game) money. Symbol only — amounts don't
// convert. Auto-detected from locale, overridable by the player.
export type Currency = 'USD' | 'EUR';

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
  currency?: Currency; // preferred money symbol; auto-detected, overridable
  onboardedAt: number; // epoch ms the quiz was completed
}

export type CrewRole = 'Skipper' | 'Navigator' | 'Tactician' | 'Trimmer' | 'Bowman';

// A sailor is either a paid professional or a Corinthian (amateur). Corinthian
// races are amateur-only and unpaid, so the tier both gates the pool you can
// sign from and decides whether wages are owed.
export type CrewTier = 'pro' | 'corinthian';

// Presets for the one-tap auto-crew: stack the deck with veterans, run a
// balanced watch, or blood a boatful of young guns.
export type AutoCrewPreset = 'veteran' | 'balanced' | 'novice';
export type AutoProvisionPreset = 'minimum' | 'balanced' | 'bluewater';

export interface CrewMember {
  id: string;
  name: string;
  tier: CrewTier;
  role: CrewRole;
  age: number; // years — flavour, and a tiebreak for the auto-crew presets
  homePort: string; // where they sail out of
  skill: number; // 0-100 — now feeds boat speed and steadies decisions
  stamina: number; // 0-100
  morale: number; // 0-100
  wage: number; // cost to sign for a pro campaign; 0 for Corinthian amateurs
  bio: string;
}

export type ProvisionCategory = 'Food' | 'Water' | 'Medical' | 'Spares' | 'Safety';

// Consumables (food, water) must cover the crew for the length of the passage;
// equipment (medical, spares, safety) is a one-off fit-out for the boat.
export type ProvisionKind = 'consumable' | 'equipment';

export interface Provision {
  id: string;
  name: string;
  category: ProvisionCategory;
  kind: ProvisionKind;
  description: string;
  unitCost: number;
  crewDaysPerUnit?: number; // consumables: how many crew-days one unit feeds
  staminaBoost: number; // per-unit quality bonus (consumables) at the start
  moraleBoost: number;
  repairBoost: number; // spares: resistance to hull wear during the race
  safetyBoost: number; // safety/medical: reduces incident & retirement risk
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
  field?: boolean; // the bold option — its time outcome is resolved against the real wind field
}

export type EventKind = 'tactical' | 'weather' | 'mob' | 'hazard';

export interface GameEvent {
  id: string;
  title: string;
  prompt: string;
  kind: EventKind;
  pointOfSail?: PointOfSail;
  hazard?: HazardKey; // present on hazard-specific events
  // Storyline wiring (optional, back-compatible). A storied race's signature
  // event is pinned to a course mark: it fires deterministically as the boat
  // reaches `pinToWaypoint`, exactly once, and links the narrative `storyBeat`
  // shown in the modal. Un-storied events leave both undefined and behave as
  // before (drawn on the everyday cadence near their hazard mark).
  pinToWaypoint?: string; // waypoint name where this signature decision fires
  storyBeat?: string; // id of the Storyline beat this decision belongs to
  choices: TacticalChoice[];
}

// ---- Race storylines ----

// How a signature choice is categorised for the debrief: the bold (field-
// resolved) gamble, the dependable safe option, or a middle hedge. Mapped from
// the choice the player actually made at the pinned signature decision.
export type SignatureOutcome = 'bold' | 'safe' | 'hedge';

// A single authored narrative beat in a race's storyline. `briefing` beats set
// the scene before the gun; the pinned `beat` is the signature decision's framing
// (tied to a course mark via `pinnedWaypoint`); `debrief` beats are the post-race
// payoff, keyed to which signature outcome the player chose.
export interface StoryBeat {
  kind: 'briefing' | 'beat' | 'debrief';
  body: string; // cockpit-legible narrative prose
  pinnedWaypoint?: string; // for the signature beat: the mark it fires at
  outcome?: SignatureOutcome; // for debrief beats: the choice this beat answers
}

// A self-contained per-race storyline: a theme, the stakes, and a small set of
// beats (a briefing scene, the pinned signature beat, and bold/safe/hedge
// debriefs). No cross-race continuity and no persisted meta-state.
export interface Storyline {
  raceId: string;
  theme: string; // one-line framing shown under the briefing header
  stakes: string; // what's on the line — the dramatic hook
  coached: string; // the Navigator's tactical note for the signature challenge
  beats: StoryBeat[];
}

// Velocity-made-good preview shown in the tactical decision modal: the current
// VMG and the projected VMG for each choice.
export interface VmgPreview {
  before: number;
  after: Record<string, number>;
}

// A single instrument sample, recorded as the boat sails, so a decision can be
// made with the current readings and the trend since the last one.
export interface InstrumentReading {
  atNm: number; // distance covered when taken
  hours: number; // elapsed race hours
  windDir: number; // wind direction FROM (deg)
  windSpeedKn: number;
  speedKn: number; // boat speed
  position: number; // fleet standing
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
  readings: InstrumentReading[]; // recent instrument samples (capped)
  legStartNm: number; // distance covered at the last decision (this leg's start)
  // The start sequence's lasting effect on the first leg: a clean-/dirty-air
  // speed multiplier that fades linearly to 1 over `startFadeNm` of progress.
  startSpeedMul?: number; // 1 = neutral; >1 clean air, <1 buried/dirty air
  startFadeNm?: number; // distance over which the start advantage decays
  // Storyline state (storied races only — undefined leaves behaviour identical).
  // The signature decision is a guaranteed set-piece: this latch flips true once
  // it has fired, so it can never fire twice or be skipped. `signatureChoiceId`
  // records the choice the player made, so the debrief can pick its matching beat.
  signatureFired?: boolean;
  signatureChoiceId?: string; // id of the TacticalChoice taken at the signature decision
}

// ---- Race start sequence ----

// The player's three start calls.
export type StartEnd = 'committee' | 'mid' | 'pin'; // which end of the line
export type StartApproach = 'send' | 'timed' | 'hold'; // aggression at the gun
export type StartBeat = 'favoured' | 'clear' | 'speed'; // first move off the line
export interface StartPlan {
  end: StartEnd;
  approach: StartApproach;
  beat: StartBeat;
}

// The start line, derived from the course geometry, for the chart schematic.
export interface StartLineGeo {
  committee: GeoPoint; // starboard (right) end — the committee boat
  pin: GeoPoint; // port (left) end
  lineBearing: number; // committee → pin
  firstLegBearing: number; // toward the first mark
}

// The Navigator's pre-start read, hedged by their confidence (the chart shows it).
export interface StartRead {
  line: StartLineGeo;
  endBias: number; // signed [-1,1]: + favours committee (right), − favours pin (left)
  favouredEnd: StartEnd; // 'committee' | 'pin' | 'mid' (even) — the believed call
  sideRead: number; // signed [-1,1]: + the right of the course pays off the line
  ocsRisk: number; // 0–1: chance a full-send start is over early (tide-aware)
  reliable: number; // 0–1: how much the Navigator trusts this read
  windFromDeg: number;
  windSpeedKn: number;
  tideRateKn: number;
  tideSetDeg: number;
}

// What the start produces, applied to the opening leg.
export interface StartOutcome {
  speedMul: number; // first-leg clean/dirty air factor
  fadeNm: number; // distance it decays over
  timePenaltyH: number; // added to elapsed (a poor start / OCS costs time)
  bias: RoutingBias; // committed first-beat side → initial strategy bias
  ocs: boolean; // over early — restarted from the back
  rating: number; // 0–1 overall start quality
  gunPosition: number; // displayed place crossing the line
  summary: string; // human-readable debrief of the start
}

// An AI competitor sailing the same course & wind field as the player.
export interface Competitor {
  id: string;
  name: string;
  speedMul: number; // pace multiplier vs the fleet benchmark (higher = quicker boat)
  ratingTcc: number; // handicap rating (corrected = elapsed × TCC), correlated with pace
  targetHours: number; // benchmark finish time for this boat (course ÷ this sets its pace)
  paceScale?: number; // calibration: reference made-good speed × this hits targetHours (memoised on first step)
  bias?: number; // -1..1: which side of the course this boat favours
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
  position: number; // official finish on corrected (handicap) time
  onWaterPosition?: number; // line-honours placing (boats physically ahead at the line)
  fleetSize: number;
  elapsedHours: number; // time on the water
  correctedHours?: number; // elapsed × the boat's rating — the handicap result
  prizeMoney: number;
  summary: string;
  timestamp: number;
  // Debrief geometry (finishers only; downsampled so saves stay small).
  trail?: GeoPoint[]; // the track actually sailed
  optimalRoute?: GeoPoint[]; // the weather-optimal line for contrast
  optimalHours?: number; // ETA a clean run on the optimal line would have made
  // Storyline debrief (storied races only): which signature choice was made and
  // the matching debrief beat text, captured at finish for the results screen.
  signatureOutcome?: SignatureOutcome;
  storyDebrief?: string;
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
  tidalField?: TidalField; // tidal stream for the race in progress (absent → slack)
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
  StartSequence: undefined;
  RaceMap: undefined;
  Results: undefined;
  BoatBuilder: undefined;
  SailLocker: { boatId: string };
};
