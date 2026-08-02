import {
  DEFAULT_STRATEGY,
  applyDecision,
  autoSailTarget,
  defaultStepNm,
  flownSpecialist,
  initialCondition,
  initialProgress,
  stepRace,
} from '../engine/gameEngine';
import { hazardEventForRace } from '../data/events';
import { bearing } from '../engine/geo';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createTidalField } from '../engine/current';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getBoatById, getCrewById, getRaceById } from '../data';
import { getClassOption } from '../data/polarLibrary';
import {
  DivisionKey,
  FleetBoat,
  GameState,
  SailMode,
  StepResult,
  WindField,
} from '../types';

afterEach(() => resetRng());

// ---------------------------------------------------------------------------
// The sail AUTO-HELM. `autoSailTarget` is pure & draw-free; `stepRace` runs it
// each tick and commits through the UNCHANGED `resolveSailChange` (2 draws).
// The load-bearing property: manual/undefined is a first-line short-circuit, so
// a manual race never touches the stream — this file (NOT goldenRace) owns the
// auto-ON pins.
// ---------------------------------------------------------------------------

// Wrap the current rng in a draw counter (the stream-neutrality probe).
function countingRng(seed: number): { draws: () => number } {
  let n = 0;
  const base = mulberry32(seed);
  setRng(() => {
    n += 1;
    return base();
  });
  return { draws: () => n };
}

// A race-ready state (mirrors goldenRace/sailChange), field & fleet injectable.
function raceState(opts: {
  raceId?: string;
  boatId?: string;
  division?: DivisionKey;
  crewIds?: string[];
  windField?: WindField;
  sailMode?: SailMode;
  withFleet?: boolean;
} = {}): GameState {
  const raceId = opts.raceId ?? 'race-round-island';
  const division = opts.division ?? 'corinthian';
  const race = getRaceById(raceId)!;
  const boat = getBoatById(opts.boatId ?? 'boat-corsair')!;
  const crewIds = opts.crewIds ?? ['crew-vega', 'crew-lindqvist', 'crew-hassan', 'crew-mensah'];
  const crew = crewIds.map((id) => getCrewById(id)!).filter(Boolean);
  const provisions = [
    { provisionId: 'prov-galley', quantity: 6 },
    { provisionId: 'prov-water', quantity: 6 },
    { provisionId: 'prov-spares', quantity: 1 },
    { provisionId: 'prov-safety', quantity: 1 },
  ];
  const windField = opts.windField ?? createWindField(race);
  const start = race.waypoints[0];
  const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
  return {
    funds: 250000,
    selectedRaceId: race.id,
    selectedDivision: division,
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: crewIds,
    provisions,
    strategy: opts.sailMode ? { ...DEFAULT_STRATEGY, sailMode: opts.sailMode } : DEFAULT_STRATEGY,
    profile: { fleet: [] },
    condition: initialCondition(crew, provisions, race),
    weather,
    windField,
    tidalField: createTidalField(race),
    fleet: [],
    progress: initialProgress(race, boat, division, windField),
    history: [],
    eventLog: [],
  };
}

// A steady field at a chosen strength/direction — no shifts, nothing to draw.
function steadyField(refLat: number, refLon: number, speedKn: number, fromDeg: number): WindField {
  return {
    baseDir: fromDeg,
    baseSpeed: speedKn,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 0,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat,
    refLon,
    feature: { lat: refLat, lon: refLon, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

// A custom boat carrying exactly ONE specialist, so `recommendedSail` is
// unambiguous — used to pin the hysteresis threshold behaviour.
function oneSpecialistBoat(sailId: string): FleetBoat {
  const opt = getClassOption('cruiserRacerIRC')!;
  return {
    id: `c-${sailId}`,
    name: 'Bench Boat',
    className: 'IRC',
    description: '',
    baseSpeed: opt.baseSpeed,
    upwind: opt.upwind,
    downwind: opt.downwind,
    stability: opt.stability,
    crewCapacity: 10,
    price: opt.price,
    custom: true,
    boatType: 'cruiserRacerIRC',
    polar: opt.polar,
    speedAdjustment: { upwindPct: 100, downwindPct: 100, nightPct: 100 },
    sails: [sailId],
  };
}

// Build a state on a custom one-specialist boat with the flown angle pinned to a
// chosen TWA in a steady field — so both the at-the-mark recommendation and the
// live hysteresis measure the same, controllable point.
function pinnedAngleState(sailId: string, twaTarget: number, twsKn: number, mode: SailMode): GameState {
  const race = getRaceById('race-round-island')!;
  const boat = oneSpecialistBoat(sailId);
  const w0 = race.waypoints[0];
  const w1 = race.waypoints[1];
  const brg = bearing(w0.lat, w0.lon, w1.lat, w1.lon);
  const field = steadyField(w0.lat, w0.lon, twsKn, (brg - twaTarget + 360) % 360);
  // A mid-skill crew with no bowman, so the Bowman relief on the threshold stays
  // small and the marginal band lands as designed.
  const crewIds = ['crew-santos', 'crew-park'];
  const crew = crewIds.map((id) => getCrewById(id)!);
  const provisions = [{ provisionId: 'prov-water', quantity: 2 }];
  const progress = initialProgress(race, boat, 'corinthian', field);
  return {
    funds: 250000,
    selectedRaceId: race.id,
    selectedDivision: 'corinthian',
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: crewIds,
    provisions,
    strategy: { ...DEFAULT_STRATEGY, sailMode: mode },
    profile: { fleet: [boat] },
    condition: initialCondition(crew, provisions, race),
    weather: weatherFromWind(sampleWind(field, w0.lat, w0.lon, 0)),
    windField: field,
    tidalField: createTidalField(race),
    fleet: [],
    // Pin the heading straight at the mark so the live TWA equals the target.
    progress: { ...progress, heading: brg },
    history: [],
    eventLog: [],
  };
}

// Run a headless race, auto-resolving decisions to choices[0] (as goldenRace
// does), and return the outcome tallies. The auto-helm runs inside stepRace.
function runAutoRace(state: GameState, seed: number): { changes: number; elapsedH: number; draws: number } {
  const counter = countingRng(seed);
  const race = getRaceById(state.selectedRaceId)!;
  const stepNm = defaultStepNm(race);
  let s = state;
  const apply = (o: StepResult): void => {
    s = { ...s, progress: o.progress, condition: o.condition, weather: o.weather, fleet: o.fleet };
  };
  for (let i = 0; i < 6000; i += 1) {
    const o = stepRace(s, stepNm);
    apply(o);
    if (o.finished || o.retired) break;
    if (o.event) {
      const decided = applyDecision(s, o.event.choices[0]);
      apply(decided);
      if (decided.retired) break;
    }
  }
  const p = s.progress!;
  return { changes: p.sailChanges ?? 0, elapsedH: Number(p.elapsedHours.toFixed(6)), draws: counter.draws() };
}

describe('autoSailTarget — pure and draw-free', () => {
  it('never draws, across modes and states', () => {
    const modes: SailMode[] = ['manual', 'conservative', 'balanced', 'aggressive'];
    // Build the states first (setup legitimately draws), THEN count.
    const states = modes.map((m) => raceState({ sailMode: m }));
    // A mid-race state too (advance a manual state a few ticks, off the stream).
    const mid = raceState({ sailMode: 'balanced' });
    setRng(mulberry32(9));
    let ms = mid;
    for (let i = 0; i < 5; i += 1) {
      const o = stepRace(ms, defaultStepNm(getRaceById(ms.selectedRaceId)!));
      ms = { ...ms, progress: o.progress, condition: o.condition, weather: o.weather, fleet: o.fleet };
    }
    const counter = countingRng(1);
    for (const st of [...states, ms]) {
      for (const m of modes) {
        autoSailTarget({ ...st, strategy: { ...st.strategy, sailMode: m } });
      }
    }
    expect(counter.draws()).toBe(0);
  });

  it('returns null on manual / undefined before touching anything', () => {
    const s = raceState({ sailMode: 'balanced' });
    expect(autoSailTarget({ ...s, strategy: { bias: 0, effort: 'cruise' } })).toBeNull();
    expect(autoSailTarget({ ...s, strategy: { ...s.strategy, sailMode: 'manual' } })).toBeNull();
  });
});

describe('manual / off is byte-identical to the pre-auto path', () => {
  it('a micro-loop draws and elapses identically for undefined vs manual sailMode', () => {
    const field = createWindField(getRaceById('race-round-island')!);
    const base = raceState({ windField: field });
    const off = { ...base, strategy: { bias: 0 as const, effort: 'cruise' as const } };
    const manual: GameState = { ...base, strategy: { bias: 0, effort: 'cruise', sailMode: 'manual' } };

    const run = (s0: GameState): { draws: number; elapsedH: number; changes: number } => {
      const counter = countingRng(303);
      let s = s0;
      const race = getRaceById(s.selectedRaceId)!;
      for (let i = 0; i < 20; i += 1) {
        const o = stepRace(s, defaultStepNm(race));
        s = { ...s, progress: o.progress, condition: o.condition, weather: o.weather, fleet: o.fleet };
        if (o.finished || o.retired) break;
      }
      return {
        draws: counter.draws(),
        elapsedH: s.progress!.elapsedHours,
        changes: s.progress!.sailChanges ?? 0,
      };
    };

    const a = run(off);
    const b = run(manual);
    expect(b).toEqual(a);
    expect(a.changes).toBe(0); // off never peels a sail
  });
});

describe('a committed auto change draws exactly two', () => {
  it('fires inside stepRace and consumes only resolveSailChange’s two rolls', () => {
    const s0 = pinnedAngleState('code-zero', 80, 9, 'balanced');
    // Confirm the helm wants the change (draw-free).
    expect(autoSailTarget(s0)).toBe('code-zero');
    // Silence every other draw source this tick: no fleet, no everyday draw, the
    // signature latched and the hazard already "shown".
    const hazardId = hazardEventForRace(getRaceById('race-round-island')!).id;
    const s: GameState = {
      ...s0,
      fleet: [],
      progress: {
        ...s0.progress!,
        nextDecisionAtNm: Number.POSITIVE_INFINITY,
        signatureFired: true,
        shownEventIds: [hazardId],
      },
    };
    const counter = countingRng(5);
    const o = stepRace(s, defaultStepNm(getRaceById('race-round-island')!));
    expect(counter.draws()).toBe(2);
    expect(o.progress.sailChanges).toBe(1);
    expect(o.progress.sailChangesAuto).toBe(1);
    expect(o.autoSailChange).toBeDefined();
    expect(o.progress.lastSailChangeNm).toBeDefined();
  });
});

describe('the hysteresis threshold widens with conservatism', () => {
  it('a marginal improvement fires balanced/aggressive but conservative holds', () => {
    // At TWA 82 in 9 kn, the light genoa (boost .06) clears the working set by
    // ~0.041 — inside balanced’s 0.03 gate but below conservative’s 0.06.
    expect(autoSailTarget(pinnedAngleState('light-genoa', 82, 9, 'conservative'))).toBeNull();
    expect(autoSailTarget(pinnedAngleState('light-genoa', 82, 9, 'balanced'))).toBe('light-genoa');
    expect(autoSailTarget(pinnedAngleState('light-genoa', 82, 9, 'aggressive'))).toBe('light-genoa');
  });
});

describe('protective douse — a losing sail escapes the anti-flap dwell', () => {
  // The signature auto-helm crater: a specialist hoisted then left up as the wind
  // moves outside its envelope bites BELOW base (flownSailMul < 1), and the dwell
  // gate used to trap it there for the whole window — doubling a lived race. A
  // strike back to the working set is PROTECTIVE and must bypass the dwell.
  //
  // Setup: fly the code-zero at TWA 175° in 30 kn (a dead run in a blow → coverage
  // 0 → mul ≈ 0.88, well below base) and pin `lastSailChangeNm` right on the boat
  // so the dwell window is wide open.
  function stuckLosingSail(mode: SailMode): GameState {
    const st = pinnedAngleState('code-zero', 175, 30, mode);
    return {
      ...st,
      progress: {
        ...st.progress!,
        activeSailId: 'code-zero',
        lastSailChangeNm: st.progress!.distanceCoveredNm, // just changed → dwell blocks
      },
    };
  }

  it('douses to the working set immediately despite the dwell', () => {
    // Balanced would normally sit out the dwell — but a below-base sail is a safety
    // strike, so the helm calls the working set now.
    expect(autoSailTarget(stuckLosingSail('balanced'))).toBe('working-jib');
    // Even conservative (the slowest to act) protects the boat.
    expect(autoSailTarget(stuckLosingSail('conservative'))).toBe('working-jib');
  });

  it('still serves the dwell for a NON-protective swap', () => {
    // Same fresh-change dwell, but the flown sail is the indestructible working set
    // (never below base), so there is nothing to protect against — the dwell holds
    // and the helm makes no call this tick.
    const st = pinnedAngleState('code-zero', 80, 9, 'balanced'); // code-zero in its envelope
    const held = {
      ...st,
      progress: { ...st.progress!, activeSailId: 'working-jib', lastSailChangeNm: st.progress!.distanceCoveredNm },
    };
    expect(autoSailTarget(held)).toBeNull();
  });
});

describe('aggressiveness ordering — keener modes change more often', () => {
  it('aggressive ≥ balanced ≥ conservative sail changes on a shifty field', () => {
    // One field, reused across the three runs so only the dial differs.
    setRng(mulberry32(77));
    const field = createWindField(getRaceById('race-fastnet')!);
    const mk = (mode: SailMode): GameState =>
      raceState({ raceId: 'race-fastnet', boatId: 'boat-mistral', division: 'pro', windField: field, sailMode: mode });

    const conservative = runAutoRace(mk('conservative'), 202);
    const balanced = runAutoRace(mk('balanced'), 202);
    const aggressive = runAutoRace(mk('aggressive'), 202);

    expect(aggressive.changes).toBeGreaterThanOrEqual(balanced.changes);
    expect(balanced.changes).toBeGreaterThanOrEqual(conservative.changes);
    // The dial genuinely bites: the keen end makes strictly more calls than the
    // steady end over a long, shifty passage.
    expect(aggressive.changes).toBeGreaterThan(conservative.changes);
  });
});

describe('a bungled hoist in a blow can still blow a sail out', () => {
  it('aggressive + a weak crew in a steady gale loses a specialist to the sea', () => {
    const race = getRaceById('race-round-island')!;
    const w0 = race.waypoints[0];
    const field = steadyField(w0.lat, w0.lon, 30, race.prevailingWind.fromDeg);
    // A green two-hand crew (no relief) drives the bungle odds up.
    const weak = ['crew-li', 'crew-adeyemi'];
    let blewOut = false;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s0 = raceState({
        boatId: 'boat-tempest',
        crewIds: weak,
        windField: field,
        sailMode: 'aggressive',
      });
      setRng(mulberry32(seed));
      let s = s0;
      for (let i = 0; i < 6000; i += 1) {
        const o = stepRace(s, defaultStepNm(race));
        s = { ...s, progress: o.progress, condition: o.condition, weather: o.weather, fleet: o.fleet };
        if (o.finished || o.retired) break;
        if (o.event) {
          const d = applyDecision(s, o.event.choices[0]);
          s = { ...s, progress: d.progress, condition: d.condition, weather: d.weather, fleet: d.fleet };
          if (d.retired) break;
        }
      }
      const blown = s.progress!.unavailableSails ?? [];
      if (blown.length > 0) {
        blewOut = true;
        // The flown sail is never a blown-out one — it fell back to the working
        // set (or another sail).
        const flying = flownSpecialist(s.progress!);
        expect(flying === undefined || !blown.includes(flying.id)).toBe(true);
      }
    }
    expect(blewOut).toBe(true);
  });
});

describe('replay determinism — a seeded auto race is exactly reproducible', () => {
  it('pins {changes, elapsedH, rngDraws} for a Balanced auto race', () => {
    setRng(mulberry32(101));
    const field = createWindField(getRaceById('race-round-island')!);
    const s = raceState({ windField: field, sailMode: 'balanced' });
    const a = runAutoRace(s, 101);
    // Same seed & inputs → identical replay.
    setRng(mulberry32(101));
    const field2 = createWindField(getRaceById('race-round-island')!);
    const s2 = raceState({ windField: field2, sailMode: 'balanced' });
    const b = runAutoRace(s2, 101);
    expect(b).toEqual(a);
    // The pins (this file owns the auto-ON contract, NOT goldenRace).
    expect(a).toEqual(AUTO_BALANCED_PINS);
  });
});

// Captured from the engine — byte-exact for the Balanced auto race above.
// elapsedH re-blessed with the routing-physics fix (the no-go rescue re-times a
// tick on this course); changes and draws held exactly — the auto-helm's
// decision stream is untouched.
const AUTO_BALANCED_PINS = { changes: 6, elapsedH: 11.31466, draws: 49 };
