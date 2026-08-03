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
  | 'island_lee'
  | 'bass_strait'
  | 'doldrums'
  | 'tidal_rapids'
  | 'eac_coastal'
  | 'strait_fog'
  | 'monsoon_squall'
  | 'ocean_high'
  | 'lake_squall'
  | 'cape_wind';

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
  // Scenario-driven synoptic base (real model output). When present it replaces
  // the static baseDir/baseSpeed evolution — and the synthetic front/rotation,
  // whose job the real time-series does — while the seeded puffs/holes, texture
  // and diurnal swing stay on top for the mesoscale detail a model can't carry.
  scenarioBase?: WeatherScenarioPoint[];
}

// ---- Weather scenarios ----

// One sampled location of a weather scenario: an hourly point time-series of
// the synoptic wind (and optionally gusts/pressure) over the passage. `hours`
// are race-relative (0 = the gun); the arrays run in lockstep.
export interface WeatherScenarioPoint {
  lat: number;
  lon: number;
  hours: number[];
  fromDeg: number[];
  speedKn: number[];
  gustKn?: number[];
  pressureHpa?: number[];
}

// A weather scenario: real model output (today's live forecast, or a historic
// edition) fed to `createWindField` as the synoptic base in place of the
// seasonal baseline. Seasonal remains the ABSENCE of a scenario — the default,
// offline path is untouched, and the only mode ranked on the global board.
export interface WeatherScenario {
  kind: 'live' | 'historic';
  raceId: string;
  label: string; // e.g. "Today's forecast"
  blurb?: string;
  model: string; // pinned forecast model id (e.g. 'ecmwf_ifs025')
  issuedAt: string; // ISO timestamp the scenario was fetched/issued
  year?: number; // historic editions only
  points: WeatherScenarioPoint[];
  fieldVersion: number; // bump when the scenario→field mapping changes
}

// Compact provenance stamp for a scenario run — enough to label the run
// honestly (results, logbook, the leaderboard gate) without the full series.
export interface WeatherScenarioStamp {
  kind: 'live' | 'historic';
  model: string;
  issuedAt: string;
  label: string;
  year?: number;
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
  // Set when this race is a member day of a regatta/series (see data/series.ts).
  // Member races are ordinary races to the ENGINE (sailed by the normal
  // lifecycle, one at a time); the series layer lives entirely in data + the
  // pure reducer. Members are hidden from the open race list — the series hub
  // is their front door.
  seriesId?: string;
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
  // The class whose specialist-sail wardrobe this boat carries for free during
  // a race (see `raceWardrobe`). Catalogue boats declare it; custom builds
  // carry their own `boatType` + purchased sails instead.
  boatType?: BoatType;
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

// The player's home port — one real harbour per sailing region, each with a
// local fleet of races (an accessible home-waters classic plus the region's
// crown jewel). Optional and back-compatible: old profiles simply have none,
// and a default is derived from the onboarding region.
export type PortId =
  | 'cowes'
  | 'valletta'
  | 'antigua'
  | 'newportRI'
  | 'sanPedro'
  | 'portTownsend'
  | 'chicago'
  | 'sydney';

export interface PlayerProfile {
  region: SailingRegion;
  goal: SailingGoal;
  experience: ExperienceLevel;
  role?: SailorRole; // optional; not asked in the quick quiz
  boatType?: BoatType; // the class they sail, if any
  currency?: Currency; // preferred money symbol; auto-detected, overridable
  homePort?: PortId; // home harbour; defaulted from the region, optional
  displayName?: string; // a guest's chosen sailing name (signed-in players use their account name)
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

// The tactical board call: hold this tack, or let the router choose.
export type BoardCall = 'auto' | 'port' | 'starboard';
export type EffortMode = 'conserve' | 'cruise' | 'push';
// The sail auto-helm dial: `manual` leaves every change to the picker (the
// engine default, so a manual race is byte-identical to the pre-auto game); the
// three auto modes fly the Navigator's recommended sail themselves, trading a
// keener call (aggressive) for fewer, steadier changes (conservative).
export type SailMode = 'manual' | 'conservative' | 'balanced' | 'aggressive';

export interface PlayerStrategy {
  bias: RoutingBias;
  effort: EffortMode;
  // The sail auto-helm. Optional & back-compatible: absent reads as `manual`
  // (old saves and the engine's DEFAULT_STRATEGY), so the golden stream is
  // untouched. Players begin a race on `balanced` (seeded in BEGIN_RACE).
  sailMode?: SailMode;
  // The board the crew is committed to. 'auto' (or absent) lets the router pick
  // the tack, exactly as before; 'port'/'starboard' is the player holding a tack
  // until they call the next one. Only bites on a beat — off the wind there is
  // no board to hold — so the control is self-limiting.
  board?: BoardCall;
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
  // Which hands execute this call: a sail-handling choice tagged with a role
  // (Bowman for foredeck work, Trimmer for holding the boat under press) lets
  // that specialist steady the bungle odds — role skill matters, not just the
  // crew average. Untagged choices are whole-boat calls.
  crewSkill?: CrewRole;
  // A situation this choice leaves the boat in (e.g. 'reefed'), opening a
  // follow-on decision later in the passage. Transient; expires with distance.
  sets?: string;
  // The sail this choice leaves flying: a sail id, or 'working' to douse back
  // to the standard working set. Writes the SAME `progress.activeSailId` the
  // manual picker does — one flown sail, whichever hand hoisted it. Ignored if
  // the boat doesn't carry the sail. No RNG is drawn for it.
  setsSail?: string;
}

export type EventKind = 'tactical' | 'weather' | 'mob' | 'hazard';

// A coarse breeze band derived from the live wind, used to fit an everyday
// decision to the moment — a broach call belongs in a breeze, not a drifter.
export type ConditionBand = 'light' | 'moderate' | 'fresh' | 'heavy';

// Where in the passage a decision belongs (fraction of the course sailed).
export type RacePhase = 'early' | 'mid' | 'late';

export interface GameEvent {
  id: string;
  title: string;
  prompt: string;
  kind: EventKind;
  pointOfSail?: PointOfSail;
  hazard?: HazardKey; // present on hazard-specific events
  // ---- Context tags (all optional, back-compatible) ----
  // The everyday picker *prefers* events whose tags fit the moment — the local
  // breeze band, the region's waters, the phase of the passage — then falls back
  // to the flat pool so a draw is always possible. An untagged event is
  // situation-agnostic and always eligible; tags only ever add fit, never gate a
  // draw out of existence.
  conditions?: ConditionBand[]; // breeze bands this decision suits
  regions?: string[]; // race ids or coarse region keys it fits (local knowledge)
  phase?: RacePhase; // early / mid / late in the passage
  // Storyline wiring (optional, back-compatible). A storied race's signature
  // event is pinned to a course mark: it fires deterministically as the boat
  // reaches `pinToWaypoint`, exactly once, and links the narrative `storyBeat`
  // shown in the modal. Un-storied events leave both undefined and behave as
  // before (drawn on the everyday cadence near their hazard mark).
  pinToWaypoint?: string; // waypoint name where this signature decision fires
  storyBeat?: string; // id of the Storyline beat this decision belongs to
  // Decision memory: a follow-on event is only eligible while its triggering
  // situation (a choice's `sets` key) is live on progress — the reef you tucked
  // is the reef you're later asked to shake out. Absent → an ordinary draw.
  followsFrom?: string;
  choices: TacticalChoice[];
}

// ---- Regattas / series ----

// A multi-day regatta: an ordered set of member day-races scored as one event
// (low-point: day rank = points, retirement/absence = entrants + 1, one discard
// once every day is sailed). The engine never reads this — each member day is an
// ordinary Race; the series is data + reducer + display.
export interface Series {
  id: string;
  name: string;
  location: string;
  description: string;
  memberRaceIds: string[]; // in sailing order (day 1 first)
  entryFee: number; // charged ONCE at series entry (Campaign mode; free mode no-ops)
  prizeMoney: number; // the overall winner's purse, paid on completion
  season: string;
}

// Persistent progress through a series — deliberately tiny: standings are
// derived from the stored member RaceResults, never duplicated here.
export interface SeriesProgress {
  seriesId: string;
  sailedRaceIds: string[];
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
  // For the BOLD debrief beat only: the honest variant read when the gamble did
  // NOT come off (the field failed it, or the call was bungled). Optional — a
  // storyline without one falls back to `body`, exactly as before.
  bustBody?: string;
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
// VMG and the projected VMG for each choice. A field-resolved (bold) choice's
// projection is honest about what the Navigator can actually know: a confidence
// band around the believed edge rather than a single false-precision number —
// computed from the SAME resolution maths `applyDecision` uses, so the cockpit
// can never promise a gain the resolution won't deliver.
export interface VmgBand {
  lo: number;
  hi: number;
}
export interface VmgPreview {
  before: number;
  after: Record<string, number>; // field choices carry the band's midpoint here
  band?: Record<string, VmgBand>; // field choices only: the Navigator's projected range
  confidence?: number; // 0–1 — the Navigator's trust in the field read (band width)
  downside?: Record<string, string>; // per choice: the legible "if it goes wrong" line
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
  // Rolling mean wind direction at the boat, for the shift instrument: the
  // player needs to know whether THIS wind is a lift or a header relative to
  // what the leg has been averaging, which is the whole game upwind.
  windMeanDir?: number;
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
  // Whether the signature choice actually CAME OFF: a field-resolved bold call
  // that misread the wind, or any bungled call, records false — so the debrief
  // can tell the truth instead of congratulating a failed gamble. Undefined on
  // legacy saves / pre-signature (treated as paid off).
  signaturePaidOff?: boolean;
  // Where the active decision was triggered. A field-resolved call's edge decays
  // as the boat sails on past this point — the shift you spotted doesn't wait —
  // so a late commit is worth less than an immediate one. While set it also
  // marks the docked opportunity as live (no fresh event is drawn over it).
  // Cleared on resolution, on a "hold course" dismissal, and when the edge
  // decays out entirely (expiry — see expireDecision/EDGE_SPENT).
  decisionTriggerNm?: number;
  // Decision memory: a transient situation a choice left the boat in (a tucked
  // reef, a big kite up, a strapped hand). While live it makes matching
  // follow-on events eligible; it expires with distance sailed.
  pendingSituation?: PendingSituation;
  // ---- The flown sail (all optional, back-compatible: absent = the standard
  // working set, exactly the pre-wardrobe boat). One field, written by BOTH the
  // manual picker and authored event choices, so the two can never diverge.
  activeSailId?: string; // specialist sail currently flying; undefined = working sails
  // Peak true wind speed the boat has seen this race (running max of the local
  // sample). Pure bookkeeping — a draw-free Math.max updated each tick — so it
  // never touches the RNG stream or a golden pin.
  peakWindKn?: number;
  // Elapsed clock at each mark rounding, in order — the debrief's per-leg split
  // ("you lost it on the second beat"). Display-only; the engine never reads it.
  markSplits?: { markIndex: number; atHours: number }[];
  sailChanges?: number; // committed distinct changes this race (the ⇄N counter)
  sailChangesAuto?: number; // how many of those the auto-helm made (engine-inert)
  sailChangesFumbled?: number; // how many of those the crew bungled
  unavailableSails?: string[]; // sails blown out this race (a bad change in heavy air)
  // The auto-helm's dwell clock: distance covered at the last committed sail
  // change (manual OR auto). Written ONLY by the sail-commit path and read ONLY
  // by `autoSailTarget`'s anti-flap gate — never by movement — so it never
  // touches the RNG stream or a golden pin.
  lastSailChangeNm?: number;
  // Right-sail bookkeeping, accumulated by geometric progress like wear (each
  // sums toward ~1 over a full race), so the debrief can say what fraction of
  // the race was sailed under the best canvas aboard.
  sailFracTotal?: number;
  sailFracRight?: number;
}

// A transient situation opened by a tactical choice, carried on progress so a
// follow-on decision can pick the story up later in the passage.
export interface PendingSituation {
  key: string; // matches a choice's `sets` / an event's `followsFrom`
  expiresAtNm: number; // distance covered beyond which the moment has passed
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

// One mark-to-mark leg of a finished race, for the debrief's "where did it go"
// split: what the leg took, and the share of the optimal line's time its
// geometry deserved.
export interface LegSplit {
  fromMark: string;
  toMark: string;
  distanceNm: number;
  hours: number;
  parHours?: number;
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
  legSplits?: LegSplit[]; // per-leg time vs the optimal line's par (debrief only)
  peakWindKn?: number; // peak true wind (kn) the boat saw this race — drives the gale-finish tally
  // Storyline debrief (storied races only): which signature choice was made and
  // the matching debrief beat text, captured at finish for the results screen.
  signatureOutcome?: SignatureOutcome;
  storyDebrief?: string;
  // ---- Finish drama ("The Duel") — additive, read-only facts about THIS race,
  // derived from the finishing fleet's corrected times. Optional/back-compatible:
  // old saves and the live race path are unaffected. Presentation only.
  nearestCorrectedGapSeconds?: number; // corrected-time gap to the nearest boat (drives the photo-finish hold)
  nearestRivalName?: string; // the boat just ahead/astern of the player on corrected time
  nearestRivalAhead?: boolean; // true if that boat beat the player on corrected time (player chased it)
  correctedWinnerName?: string; // who won overall on corrected time / handicap (may be the player)
  // Weather-scenario provenance: present only when the race sailed real model
  // output ("Today's forecast" / a historic edition). Scenario runs stay in the
  // local logbook — they never post to the global leaderboard.
  scenario?: WeatherScenarioStamp;
  // ---- Sail-handling debrief (quality, not just frequency). Optional and
  // back-compatible: absent on old saves and on races sailed before wardrobes.
  // Series member days only: the full corrected-time finish order (AI boat
  // names; the player slots in at `position`). Captured at the line so series
  // standings can be scored from stored results alone — display/scoring data,
  // absent everywhere else.
  correctedOrder?: string[];
  sailChanges?: number;
  sailChangesAuto?: number; // how many changes the auto-helm made (for "N changes, M auto")
  sailChangesFumbled?: number;
  rightSailPct?: number; // % of the race sailed under the best canvas aboard
  blownSails?: string[]; // names of sails lost to a bungled heavy-air change
}

// A player's forward-accruing lifetime record. `state.history` is hard-capped at
// 50 races, so cumulative career stats CANNOT be derived from it — a veteran's
// early races fall off the end. This record is folded once per finish in the
// FINISH_RACE reducer (outside the engine RNG path) and never truncates, so it
// is the single durable source of lifetime totals (the foundation for Honours).
export interface CareerRecord {
  racesSailed: number;
  racesFinished: number;
  wins: number; // corrected-time firsts
  podiums: number; // corrected top 3
  nmLogged: number; // course miles of finished races
  handicapSwingWins: number; // won on corrected while beaten on the water
  photoFinishWins: number; // corrected win with nearest gap < PHOTO_FINISH_SECONDS
  cleanSailRaces: number; // finished with sailChanges>0 and 0 fumbled
  galeFinishes: number; // finished a race whose peakWindKn >= GALE_KN
  boldStoryWins: number; // signatureOutcome==='bold' && position===1
  scenarioRuns: number; // finished a race with a weather scenario stamp
  regionsSailed: string[]; // distinct region keys, deduped
  bestCorrectedGapSeconds?: number; // smallest recorded (closest duel)
  bestPaceVsOptimalPct?: number; // largest recorded optimalHours/elapsedHours*100
  updatedAt: number; // epoch ms of the last fold (from the result's timestamp)
  // ---- Distinct-race SETS (all optional/back-compat: an old PR-1 record lacks
  // them; `hydrateCareer` recovers an honest floor from the capped history).
  // Honours need "won THIS course", "sailed THIS hazard" — sets the plain
  // counters above can't express — so we accrue deduped raceId lists too.
  wonRaceIds?: string[]; // distinct raceIds won on corrected time (a clean, non-retired 1st)
  podiumRaceIds?: string[]; // distinct raceIds with a corrected podium (position<=3)
  finishedRaceIds?: string[]; // distinct raceIds finished (drives "sailed this course / hazard")
  corinthianOffshoreWins?: number; // wins in the Corinthian division of an Offshore/Ocean race
  historicEditions?: string[]; // distinct historic-edition keys finished ('<raceId>:<year>')
  seriesWins?: string[]; // distinct series ids won overall (the regatta layer's one career mark)
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
  scenario?: WeatherScenarioStamp; // weather scenario the race in progress sails (absent → seasonal)
  strategy: PlayerStrategy;
  profile: Profile; // the player's fleet of custom boats (local-first)
  condition: BoatCondition;
  weather?: WeatherCondition;
  lastResult?: RaceResult;
  history: RaceResult[];
  career?: CareerRecord; // forward-accruing lifetime record (optional — back-compat with old saves)
  eventLog: string[];
  tutorialSeen?: boolean; // whether the player has seen the race how-to-play
  scoringSeen?: boolean; // whether the corrected-time (handicap) primer has been shown (display-only, like tutorialSeen)
  // The regatta layer: which series is being campaigned and which member days
  // are sailed. Folded ONLY in the pure reducer (the career pattern); standings
  // derive from stored results, so this stays minimal and resumable.
  seriesProgress?: SeriesProgress;
  // Free Sailing: the budget layer switched off — no fees, prices, wages or
  // prizes; every boat and sailor is available and funds are frozen. A PREFERENCE
  // (two-way, newest save wins in reconcile — unlike the one-way "seen" flags).
  // Neutralised entirely inside the gameReducer money cases; the engine never
  // reads it, so the race sim and the goldens are untouched either way.
  freeSailing?: boolean;
  seenHonourIds?: string[]; // honours whose earn-moment has been shown (display-only, like tutorialSeen)
  savedAt?: number; // epoch ms the save was last written; drives cloud sync reconciliation
}

// How a tactical decision actually resolved — the causal truth behind the
// debrief line, using the same bold/safe/hedge vocabulary as the storyline
// debrief. `paidOff` is only meaningful for a bold (field-resolved) call.
export interface DecisionResolution {
  outcome: SignatureOutcome; // bold (field-resolved) | safe | hedge
  paidOff?: boolean; // bold only: the real wind backed the call
  bungled: boolean; // the crew fumbled the manoeuvre (the risk roll bit)
  lostHours: number; // realised on-water time cost of the call
  summary: string; // one causally-true debrief line for the race log
}

// Outcome returned by the engine after a simulation step.
export interface StepResult {
  progress: RaceProgress;
  condition: BoatCondition;
  weather: WeatherCondition;
  fleet: Competitor[];
  event: GameEvent | null; // a decision docking into the cockpit's live lane, if any
  log?: string;
  finished: boolean;
  retired: boolean;
  resolution?: DecisionResolution; // present when this step resolved a decision
  // The auto-helm peeled a sail this tick (`sailMode` other than manual): the
  // committed change's resolution, so the cockpit can flash the debrief ribbon.
  // Absent on a manual race — the golden never sees it.
  autoSailChange?: DecisionResolution;
  // A docked opportunity's moment passed this step (its edge decayed out):
  // retracted draw-free — no deltas, no decision spent — the cards should leave
  // the lane. Never set on a step that also resolves or fires an event.
  eventExpired?: boolean;
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
  TrophyCase: undefined;
  SeriesHub: { seriesId: string };
  BoatBuilder: undefined;
  SailLocker: { boatId: string };
  NoticeBoard: { fromRoute?: string } | undefined; // the feedback "message to the Race Committee"
};
