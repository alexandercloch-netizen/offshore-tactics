import { applyReseed, ReseedPayload } from '../store/reseed';
import { GameState, RaceProgress, WeatherCondition, WindField } from '../types';

// RESEED_WEATHER's atomicity guarantee: swapping the pre-start conditions
// REPLACES `progress`, never nulls it (even transiently) — a null flash would
// race the Briefing's mount effect into a second beginRace and a double charge.

const windField = (baseDir: number): WindField => ({
  baseDir,
  baseSpeed: 14,
  shiftAmpDeg: 10,
  shiftPeriodH: 6,
  shiftPhase: 0,
  rotateDegPerH: 0.5,
  gradientAxisDeg: 0,
  gradientPerNm: 0.02,
  refLat: 50,
  refLon: -3,
  feature: { lat: 50, lon: -3, radiusNm: 40, deltaKn: 4, driftDir: 0, driftKn: 3 },
});

const progress = (overrides: Partial<RaceProgress> = {}): RaceProgress => ({
  distanceCoveredNm: 0,
  totalDistanceNm: 100,
  elapsedHours: 0,
  position: 5,
  pointOfSail: 'Upwind',
  lat: 50,
  lon: -3,
  heading: 200,
  nextMarkIndex: 1,
  route: [{ lat: 50, lon: -3 }],
  trail: [{ lat: 50, lon: -3 }],
  routeWindDir: 225,
  routePlannedAtNm: 0,
  routeBias: 0,
  windDir: 225,
  windSpeedKn: 14,
  nextDecisionAtNm: 10,
  decisionsTaken: 0,
  shownEventIds: [],
  readings: [],
  legStartNm: 0,
  ...overrides,
});

const weather: WeatherCondition = {
  id: 'w',
  label: 'Fresh breeze',
  windStrength: 'Fresh',
  windSpeedKts: 18,
  windDirection: 250,
  description: '',
  speedModifier: 1,
  riskModifier: 0,
};

const state = (overrides: Partial<GameState> = {}): GameState => ({
  funds: 1000,
  selectedDivision: 'corinthian',
  ownedBoatIds: [],
  selectedCrewIds: [],
  provisions: [],
  strategy: { bias: 0, effort: 'cruise' },
  profile: { fleet: [] },
  condition: { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 },
  history: [],
  eventLog: [],
  ...overrides,
});

const payload: ReseedPayload = {
  progress: progress({ windDir: 300 }),
  weather,
  windField: windField(300),
  fleet: [],
  scenario: {
    kind: 'live',
    model: 'ecmwf_ifs025',
    issuedAt: '2026-07-04T06:00:00.000Z',
    label: "Today's forecast",
  },
};

describe('applyReseed', () => {
  it('replaces the race world atomically, never nulling progress', () => {
    const before = state({ progress: progress(), windField: windField(220) });
    const after = applyReseed(before, payload);
    expect(after.progress).toBe(payload.progress); // replaced in ONE move
    expect(after.progress).not.toBeUndefined();
    expect(after.windField).toBe(payload.windField);
    expect(after.weather).toBe(payload.weather);
    expect(after.fleet).toBe(payload.fleet);
    expect(after.scenario).toEqual(payload.scenario);
    expect(before.progress).toBeDefined(); // no mutation of the old state
  });

  it('clears the stamp when reseeding back to seasonal', () => {
    const live = applyReseed(state({ progress: progress() }), payload);
    const seasonal = applyReseed(live, { ...payload, scenario: undefined });
    expect(seasonal.progress).toBeDefined();
    expect(seasonal.scenario).toBeUndefined();
  });

  it('never conjures a race: no progress, no reseed', () => {
    const before = state();
    expect(applyReseed(before, payload)).toBe(before);
  });

  it('locks the conditions once the gun has gone', () => {
    const before = state({ progress: progress({ distanceCoveredNm: 12 }) });
    expect(applyReseed(before, payload)).toBe(before);
  });

  it('locks the conditions once the start outcome is baked in', () => {
    // APPLY_START stamps startSpeedMul; a reseed after that would silently
    // erase the start the player just sailed.
    const before = state({ progress: progress({ startSpeedMul: 1.04, startFadeNm: 5 }) });
    expect(applyReseed(before, payload)).toBe(before);
  });
});
