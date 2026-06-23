import {
  DEFAULT_STRATEGY,
  applyDecision,
  buildResult,
  campaignCost,
  currentSpeed,
  defaultStepNm,
  fleetBenchmarkHours,
  initialProgress,
  isRaceUnlocked,
  raceDivision,
  laylines,
  polarTargetSpeed,
  speedMadeGood,
  stepRace,
  tacticalEdge,
  vmgPreview,
} from '../engine/gameEngine';
import { bearing } from '../engine/geo';
import { WindField } from '../types';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createFleet, finalPosition } from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import {
  BOATS,
  HAZARD_EVENTS,
  RACES,
  STIPEND_FLOOR,
  STIPEND_TRIGGER,
  applyStipend,
  getBoatById,
  getRaceById,
} from '../data';
import {
  BoatCondition,
  GameState,
  RaceResult,
  StepResult,
  TacticalChoice,
} from '../types';

const healthy: BoatCondition = {
  hullIntegrity: 100,
  crewStamina: 100,
  crewMorale: 100,
};

// Build a race-ready state with a seeded wind field and an initial route.
function baseState(overrides: Partial<GameState> = {}): GameState {
  const raceId = overrides.selectedRaceId ?? 'race-round-island';
  const division = overrides.selectedDivision ?? 'corinthian';
  const race = getRaceById(raceId)!;
  const boat = getBoatById(overrides.selectedBoatId ?? 'boat-mistral')!;
  const windField = overrides.windField ?? createWindField(race);
  const start = race.waypoints[0];
  const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
  return {
    funds: 250000,
    selectedRaceId: raceId,
    selectedDivision: division,
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: ['crew-vega', 'crew-lindqvist', 'crew-hassan'],
    provisions: [{ provisionId: 'prov-water', quantity: 2 }],
    condition: healthy,
    weather,
    windField,
    fleet: createFleet(race, raceDivision(race, division), fleetBenchmarkHours(race, windField, boat), boat),
    strategy: DEFAULT_STRATEGY,
    profile: { fleet: [] },
    progress: initialProgress(race, boat, division, windField),
    history: [],
    eventLog: [],
    ...overrides,
  };
}

afterEach(() => resetRng());

describe('campaignCost', () => {
  it('uses the selected division entry fee', () => {
    setRng(mulberry32(1));
    const race = getRaceById('race-round-island')!;
    const corinthian = campaignCost(baseState({ provisions: [], selectedCrewIds: [] }));
    const pro = campaignCost(
      baseState({ provisions: [], selectedCrewIds: [], selectedDivision: 'pro' })
    );
    expect(corinthian.entryFee).toBe(race.divisions.corinthian.entryFee);
    expect(pro.entryFee).toBe(race.divisions.pro.entryFee);
    expect(pro.total).toBeGreaterThan(corinthian.total);
  });

  it('charges boat charter only the first time, then it is owned', () => {
    setRng(mulberry32(1));
    const boat = getBoatById('boat-mistral')!;
    const firstTime = campaignCost(baseState({ ownedBoatIds: [] }));
    const owned = campaignCost(baseState({ ownedBoatIds: [boat.id] }));
    expect(firstTime.charter).toBe(boat.price);
    expect(owned.charter).toBe(0);
    expect(owned.total).toBe(firstTime.total - boat.price);
  });
});

describe('economy sustainability', () => {
  it('recoups operating costs on a finish but not the boat purchase', () => {
    setRng(mulberry32(1));
    const state = baseState({ ownedBoatIds: ['boat-mistral'] }); // boat already owned
    const cost = campaignCost(state);
    const operating = cost.entryFee + cost.wages + cost.provisions;
    const p = initialProgress(
      getRaceById(state.selectedRaceId!)!,
      getBoatById(state.selectedBoatId!)!,
      'corinthian',
      state.windField!
    );
    const finish: StepResult = {
      progress: { ...p, position: 6 },
      condition: healthy,
      weather: state.weather!,
      fleet: [],
      event: null,
      finished: true,
      retired: false,
    };
    const result = buildResult(state, finish);
    // A finish returns at least ~90% of the running costs (plus any prize).
    expect(result.prizeMoney).toBeGreaterThanOrEqual(Math.round(operating * 0.9));
  });

  it('pays nothing when you retire', () => {
    setRng(mulberry32(1));
    const state = baseState({ ownedBoatIds: ['boat-mistral'] });
    const p = initialProgress(
      getRaceById(state.selectedRaceId!)!,
      getBoatById(state.selectedBoatId!)!,
      'corinthian',
      state.windField!
    );
    const dnf: StepResult = {
      progress: { ...p, position: 30 },
      condition: healthy,
      weather: state.weather!,
      fleet: [],
      event: null,
      finished: false,
      retired: true,
    };
    expect(buildResult(state, dnf).prizeMoney).toBe(0);
  });
});

describe('applyStipend', () => {
  it('tops a dry chest up to the floor but leaves a healthy one alone', () => {
    expect(applyStipend(0)).toBe(STIPEND_FLOOR);
    expect(applyStipend(STIPEND_TRIGGER - 1)).toBe(STIPEND_FLOOR);
    expect(applyStipend(STIPEND_TRIGGER + 1)).toBe(STIPEND_TRIGGER + 1);
    expect(applyStipend(500000)).toBe(500000);
  });
});

describe('isRaceUnlocked', () => {
  const fastnet = getRaceById('race-fastnet')!;

  it('unlocks races with no prerequisite', () => {
    expect(isRaceUnlocked(getRaceById('race-round-island')!, [])).toBe(true);
  });

  it('locks a race until its prerequisite is finished', () => {
    expect(isRaceUnlocked(fastnet, [])).toBe(false);
    const done: RaceResult[] = [
      {
        raceId: fastnet.unlockAfter as string,
        raceName: 'x',
        boatId: 'b',
        finished: true,
        retired: false,
        position: 1,
        fleetSize: 10,
        elapsedHours: 10,
        prizeMoney: 0,
        summary: '',
        timestamp: 0,
      },
    ];
    expect(isRaceUnlocked(fastnet, done)).toBe(true);
  });
});

describe('initialProgress', () => {
  it('starts at the start mark with a planned route', () => {
    setRng(mulberry32(2));
    const race = getRaceById('race-fastnet')!;
    const boat = getBoatById('boat-mistral')!;
    const field = createWindField(race);
    const p = initialProgress(race, boat, 'corinthian', field);
    expect(p.distanceCoveredNm).toBe(0);
    expect(p.nextMarkIndex).toBe(1);
    expect(p.lat).toBeCloseTo(race.waypoints[0].lat, 5);
    expect(p.lon).toBeCloseTo(race.waypoints[0].lon, 5);
    expect(p.route.length).toBeGreaterThanOrEqual(2);
    expect(p.totalDistanceNm).toBeGreaterThan(0);
    expect(['Upwind', 'Reach', 'Downwind']).toContain(p.pointOfSail);
  });
});

describe('speed helpers', () => {
  it('reports a positive boat speed and a smaller speed made good', () => {
    setRng(mulberry32(3));
    const state = baseState();
    const speed = currentSpeed(state);
    const smg = speedMadeGood(state);
    expect(speed).toBeGreaterThan(0);
    expect(smg).toBeGreaterThan(0);
    expect(smg).toBeLessThanOrEqual(speed + 1e-6);
  });

  it('previews a higher VMG for a time-saving choice', () => {
    setRng(mulberry32(4));
    const event = {
      id: 'e',
      title: 't',
      prompt: 'p',
      kind: 'tactical' as const,
      choices: [
        { id: 'fast', label: 'f', description: '', timeDelta: -1, staminaDelta: 0, moraleDelta: 0, hullDelta: 0, risk: 0 },
        { id: 'slow', label: 's', description: '', timeDelta: 1, staminaDelta: 0, moraleDelta: 0, hullDelta: 0, risk: 0 },
      ],
    };
    const preview = vmgPreview(baseState(), event);
    expect(preview.after.fast).toBeGreaterThan(preview.after.slow);
  });
});

describe('effort dial', () => {
  it('sails faster on Push and slower on Conserve', () => {
    setRng(mulberry32(8));
    const cruise = currentSpeed(baseState({ strategy: { bias: 0, effort: 'cruise' } }));
    setRng(mulberry32(8));
    const push = currentSpeed(baseState({ strategy: { bias: 0, effort: 'push' } }));
    setRng(mulberry32(8));
    const conserve = currentSpeed(baseState({ strategy: { bias: 0, effort: 'conserve' } }));
    expect(push).toBeGreaterThan(cruise);
    expect(conserve).toBeLessThan(cruise);
  });

  it('wears the boat harder when pushing', () => {
    setRng(mulberry32(8));
    const pushOut = stepRace(baseState({ strategy: { bias: 0, effort: 'push' } }), 20);
    setRng(mulberry32(8));
    const conserveOut = stepRace(baseState({ strategy: { bias: 0, effort: 'conserve' } }), 20);
    expect(pushOut.condition.hullIntegrity).toBeLessThan(conserveOut.condition.hullIntegrity);
  });
});

describe('stepRace (weather-routed model)', () => {
  it('advances along the route and accumulates time', () => {
    setRng(mulberry32(5));
    const race = getRaceById('race-round-island')!;
    const state = baseState();
    const out = stepRace(state, defaultStepNm(race));
    expect(out.progress.distanceCoveredNm).toBeGreaterThan(0);
    expect(out.progress.elapsedHours).toBeGreaterThan(0);
    expect(out.progress.route.length).toBeGreaterThanOrEqual(1);
    expect(out.progress.trail.length).toBeGreaterThanOrEqual(1);
  });

  it('plays a full race to a terminal state', () => {
    setRng(mulberry32(123));
    const race = getRaceById('race-round-island')!;
    let state = baseState();
    let terminal: StepResult | null = null;

    for (let i = 0; i < 6000; i += 1) {
      const out = stepRace(state, defaultStepNm(race));
      state = {
        ...state,
        progress: out.progress,
        condition: out.condition,
        weather: out.weather,
        fleet: out.fleet,
      };
      if (out.event) {
        const decision = applyDecision(state, out.event.choices[0]);
        state = { ...state, progress: decision.progress, condition: decision.condition, fleet: decision.fleet };
        if (decision.retired) {
          terminal = decision;
          break;
        }
      }
      if (out.finished || out.retired) {
        terminal = out;
        break;
      }
    }

    expect(terminal).not.toBeNull();
    expect(terminal!.finished || terminal!.retired).toBe(true);
  });

  it('fires the signature hazard once, as the boat reaches its mark', () => {
    setRng(mulberry32(123));
    const race = getRaceById('race-round-island')!; // tidal_gate at The Needles
    let state = baseState();
    const shown: string[] = [];

    for (let i = 0; i < 6000; i += 1) {
      const out = stepRace(state, defaultStepNm(race));
      state = {
        ...state,
        progress: out.progress,
        condition: out.condition,
        weather: out.weather,
        fleet: out.fleet,
      };
      if (out.event) {
        shown.push(out.event.id);
        const safe = out.event.choices.reduce((a, b) => (b.risk < a.risk ? b : a));
        const decision = applyDecision(state, safe);
        state = { ...state, progress: decision.progress, condition: decision.condition, fleet: decision.fleet };
        if (decision.finished || decision.retired) break;
      }
      if (out.finished || out.retired) break;
    }

    const tidalGate = shown.filter((id) => id === 'evt-hz-tidal');
    expect(tidalGate).toHaveLength(1); // exactly once, and only because we reached The Needles
  });

  it('finishes a heavy-weather race when sailed sensibly (cruise + safe calls)', () => {
    // Difficulty guard: a normally-sailed race should be completable, not a
    // forced retirement. Sail Fastnet (a heavy celtic-weather course) on cruise
    // effort, always taking the lowest-risk option, and expect a finish.
    setRng(mulberry32(20));
    const race = getRaceById('race-fastnet')!;
    let state = baseState({
      selectedRaceId: 'race-fastnet',
      strategy: { bias: 0, effort: 'cruise' },
    });
    let terminal: StepResult | null = null;

    for (let i = 0; i < 20000; i += 1) {
      const out = stepRace(state, defaultStepNm(race));
      state = {
        ...state,
        progress: out.progress,
        condition: out.condition,
        weather: out.weather,
        fleet: out.fleet,
      };
      if (out.event) {
        const safe = out.event.choices.reduce((a, b) => (b.risk < a.risk ? b : a));
        const decision = applyDecision(state, safe);
        state = { ...state, progress: decision.progress, condition: decision.condition, fleet: decision.fleet };
        if (decision.retired || decision.finished) {
          terminal = decision;
          break;
        }
      }
      if (out.finished || out.retired) {
        terminal = out;
        break;
      }
    }

    expect(terminal).not.toBeNull();
    expect(terminal!.retired).toBe(false);
    expect(terminal!.finished).toBe(true);
  });
});

describe('applyDecision', () => {
  it('applies stat deltas and added time', () => {
    setRng(mulberry32(2));
    const choice: TacticalChoice = {
      id: 'c',
      label: 'l',
      description: '',
      timeDelta: 2,
      staminaDelta: -10,
      moraleDelta: 5,
      hullDelta: -5,
      risk: 0,
    };
    const state = baseState();
    const out = applyDecision(state, choice);
    expect(out.progress.elapsedHours).toBeGreaterThanOrEqual(2);
    expect(out.condition.crewStamina).toBeLessThan(state.condition.crewStamina);
    expect(out.retired).toBe(false);
  });

  it('retires the boat when a choice destroys the hull', () => {
    setRng(mulberry32(2));
    const fatal: TacticalChoice = {
      id: 'x',
      label: 'l',
      description: '',
      timeDelta: 0,
      staminaDelta: 0,
      moraleDelta: 0,
      hullDelta: -100,
      risk: 1,
    };
    const state = baseState({ condition: { hullIntegrity: 30, crewStamina: 80, crewMorale: 80 } });
    const out = applyDecision(state, fatal);
    expect(out.condition.hullIntegrity).toBe(0);
    expect(out.retired).toBe(true);
  });
});

describe('buildResult', () => {
  function terminalOutcome(position: number, finished: boolean, retired: boolean): StepResult {
    setRng(mulberry32(9));
    const p = initialProgress(getRaceById('race-round-island')!, getBoatById('boat-mistral')!, 'corinthian', createWindField(getRaceById('race-round-island')!));
    return {
      progress: { ...p, position },
      condition: healthy,
      weather: weatherFromWind({ fromDeg: 200, speedKn: 14 }),
      fleet: [],
      event: null,
      finished,
      retired,
    };
  }

  it('awards the full purse (plus operating recoup) for a division win', () => {
    const result = buildResult(baseState(), terminalOutcome(1, true, false));
    const division = raceDivision(getRaceById('race-round-island')!, 'corinthian');
    // Winnings include the full purse and the finisher recoup on top.
    expect(result.prizeMoney).toBeGreaterThan(division.prizeMoney);
    expect(result.finished).toBe(true);
  });

  it('pays nothing and records a retirement', () => {
    const result = buildResult(baseState(), terminalOutcome(20, false, true));
    expect(result.prizeMoney).toBe(0);
    expect(result.retired).toBe(true);
  });
});

describe('data integrity', () => {
  it('every race has ordered waypoints and a prevailing wind', () => {
    RACES.forEach((race) => {
      expect(race.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(race.waypoints[0].type).toBe('start');
      expect(race.waypoints[race.waypoints.length - 1].type).toBe('finish');
      expect(race.prevailingWind.speedKn).toBeGreaterThan(0);
      expect(race.prevailingWind.fromDeg).toBeGreaterThanOrEqual(0);
      expect(race.prevailingWind.fromDeg).toBeLessThan(360);
    });
  });

  it('every race anchors its signature hazard to a real waypoint with an event', () => {
    RACES.forEach((race) => {
      expect(race.waypoints.some((w) => w.name === race.hazardWaypoint)).toBe(true);
      // The hazard must have a matching decision (Record<HazardKey> guarantees
      // this at compile time; assert it too for a clear failure message).
      expect(HAZARD_EVENTS[race.hazard]).toBeDefined();
    });
  });

  it('every race meets the content standard (ids, ratings, divisions, unlocks)', () => {
    const ids = new Set<string>();
    RACES.forEach((race) => {
      expect(ids.has(race.id)).toBe(false); // unique ids
      ids.add(race.id);
      expect(race.distanceNm).toBeGreaterThan(0);
      expect(race.recordTimeHours).toBeGreaterThan(0);
      expect(race.corinthianRating).toBeGreaterThanOrEqual(1);
      expect(race.corinthianRating).toBeLessThanOrEqual(5);
      // Both divisions present and sane.
      (['corinthian', 'pro'] as const).forEach((key) => {
        const d = race.divisions[key];
        expect(d.entryFee).toBeGreaterThan(0);
        expect(d.prizeMoney).toBeGreaterThan(0);
        expect(d.fleetSize).toBeGreaterThanOrEqual(2);
        expect(d.paceTarget).toBeGreaterThan(1);
      });
      // Waypoint coordinates are well-formed.
      race.waypoints.forEach((w) => {
        expect(Math.abs(w.lat)).toBeLessThanOrEqual(90);
        expect(Math.abs(w.lon)).toBeLessThanOrEqual(180);
      });
    });
    // Any unlock prerequisite must reference an existing race.
    RACES.forEach((race) => {
      if (race.unlockAfter) expect(ids.has(race.unlockAfter)).toBe(true);
    });
  });

  it('the Race to Alaska is present and to standard', () => {
    const r2ak = getRaceById('race-r2ak');
    expect(r2ak).toBeDefined();
    expect(r2ak!.hazard).toBe('tidal_rapids');
    expect(r2ak!.waypoints.some((w) => w.name === 'Seymour Narrows')).toBe(true);
  });

  it('every catalogue boat is well-formed (crewable, priced, rated)', () => {
    expect(BOATS.length).toBeGreaterThan(0);
    BOATS.forEach((boat) => {
      expect(boat.crewCapacity).toBeGreaterThan(0); // or the crew screen blocks
      expect(boat.price).toBeGreaterThanOrEqual(0);
      expect(boat.baseSpeed).toBeGreaterThan(0);
      [boat.upwind, boat.downwind, boat.stability].forEach((r) => {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(100);
      });
    });
  });
});

// A wind field with a strong, steady veer — a genuine, exploitable shift.
function shiftingField(refLat: number, refLon: number): WindField {
  return {
    baseDir: 200,
    baseSpeed: 14,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 20,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat,
    refLon,
    feature: { lat: refLat, lon: refLon, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

// A dead-flat field: nothing to exploit, so a bold call is a false alarm.
function flatField(refLat: number, refLon: number): WindField {
  return { ...shiftingField(refLat, refLon), rotateDegPerH: 0 };
}

describe('tactical decisions resolved against the wind field', () => {
  afterEach(() => resetRng());

  const boldCall: TacticalChoice = {
    id: 'test-bold',
    label: 'Send it',
    description: '',
    timeDelta: -0.6,
    staminaDelta: 0,
    moraleDelta: 0,
    hullDelta: 0,
    risk: 0, // isolate the field resolution from the bungle roll
    field: true,
  };

  it('reads a genuine shift as a positive edge and a flat field as a false alarm', () => {
    const start = getRaceById('race-round-island')!.waypoints[0];
    const shifting = baseState({ windField: shiftingField(start.lat, start.lon) });
    const flat = baseState({ windField: flatField(start.lat, start.lon) });
    expect(tacticalEdge(shifting)).toBeGreaterThan(0.2);
    expect(tacticalEdge(flat)).toBeLessThan(0);
  });

  it('a bold call costs ~nothing when the field supports it, but bleeds time on a false alarm', () => {
    const start = getRaceById('race-round-island')!.waypoints[0];
    const shifting = baseState({ windField: shiftingField(start.lat, start.lon) });
    const flat = baseState({ windField: flatField(start.lat, start.lon) });

    setRng(mulberry32(1));
    const good = applyDecision(shifting, boldCall);
    setRng(mulberry32(1));
    const bad = applyDecision(flat, boldCall);

    const goodLost = good.progress.elapsedHours - shifting.progress!.elapsedHours;
    const badLost = bad.progress.elapsedHours - flat.progress!.elapsedHours;
    expect(goodLost).toBeLessThan(0.05); // reading it right is near-free
    expect(badLost).toBeGreaterThan(0.3); // a phantom corner costs real time
    expect(bad.condition.crewMorale).toBeLessThan(good.condition.crewMorale); // and stings the crew
  });

  it('leaves the conservative (non-field) option authored and field-independent', () => {
    const start = getRaceById('race-round-island')!.waypoints[0];
    const safe: TacticalChoice = { ...boldCall, id: 'test-safe', timeDelta: 0.3, field: false };
    setRng(mulberry32(2));
    const a = applyDecision(baseState({ windField: shiftingField(start.lat, start.lon) }), safe);
    setRng(mulberry32(2));
    const b = applyDecision(baseState({ windField: flatField(start.lat, start.lon) }), safe);
    expect(a.progress.elapsedHours).toBeCloseTo(b.progress.elapsedHours, 6);
  });
});

describe('fleet balance', () => {
  afterEach(() => resetRng());

  // Guards the regression where the AI fleet sailed an idealised line no human
  // could match, leaving the player structurally last. A cleanly-sailed decent
  // boat must be able to fight near the front.
  it('a cleanly-sailed decent boat contends, never stuck last', () => {
    const raceId = 'race-round-island';
    const race = getRaceById(raceId)!;
    const fleetSize = raceDivision(race, 'corinthian').fleetSize;
    const step = defaultStepNm(race);
    const positions: number[] = [];
    for (const seed of [3, 7, 21]) {
      setRng(mulberry32(seed));
      let s = baseState({ selectedRaceId: raceId, selectedBoatId: 'boat-tempest', selectedDivision: 'corinthian' });
      let out = stepRace(s, step);
      for (let i = 0; i < 3000; i += 1) {
        out = stepRace(s, step);
        s = { ...s, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
        if (out.finished || out.retired) break;
      }
      expect(out.finished).toBe(true);
      positions.push(finalPosition(s.fleet ?? [], out.progress.elapsedHours));
    }
    // Across seeds, a decent boat reaches the podium-contending top third — and is
    // never marooned at the back every time.
    expect(Math.min(...positions)).toBeLessThanOrEqual(Math.ceil(fleetSize / 3));
    expect(Math.min(...positions)).toBeLessThan(fleetSize);
  });
});

describe('post-race debrief geometry', () => {
  afterEach(() => resetRng());

  it('a finished result carries the sailed trail, the optimal line and its ETA', () => {
    setRng(mulberry32(5));
    const race = getRaceById('race-round-island')!;
    let s = baseState({ selectedRaceId: race.id });
    const step = Math.max(race.distanceNm * 0.04, 1);
    let outcome = stepRace(s, step);
    for (let i = 0; i < 2000; i += 1) {
      outcome = stepRace(s, step);
      s = { ...s, progress: outcome.progress, condition: outcome.condition, weather: outcome.weather, fleet: outcome.fleet };
      if (outcome.finished || outcome.retired) break;
    }
    expect(outcome.finished).toBe(true);

    const r = buildResult(s, outcome);
    expect(r.trail && r.trail.length).toBeGreaterThan(1);
    expect(r.trail!.length).toBeLessThanOrEqual(36); // downsampled for save size
    expect(r.optimalRoute && r.optimalRoute.length).toBeGreaterThan(1);
    expect(r.optimalHours).toBeGreaterThan(0);
  });
});

describe('tactical instruments', () => {
  it('polarTargetSpeed is a finite, positive polar speed', () => {
    const t = polarTargetSpeed(baseState());
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThan(0);
  });

  it('laylines appear for an upwind mark and not for a reach', () => {
    const race = getRaceById('race-round-island')!;
    const s = baseState({ selectedRaceId: race.id });
    const start = race.waypoints[0];
    const mark = race.waypoints[1];
    const brg = bearing(start.lat, start.lon, mark.lat, mark.lon);
    const flatDir = (dir: number): WindField => ({
      baseDir: dir,
      baseSpeed: 12,
      shiftAmpDeg: 0,
      shiftPeriodH: 6,
      shiftPhase: 0,
      rotateDegPerH: 0,
      gradientAxisDeg: 0,
      gradientPerNm: 0,
      refLat: start.lat,
      refLon: start.lon,
      feature: { lat: start.lat, lon: start.lon, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
    });
    // Wind from the mark's bearing → the mark is dead upwind → laylines exist.
    const upwind = laylines({ ...s, windField: flatDir(brg) });
    expect(upwind).not.toBeNull();
    expect(upwind!.ends).toHaveLength(2);
    // Wind across the course → a reach, the mark lays directly → no laylines.
    const reach = laylines({ ...s, windField: flatDir((brg + 90) % 360) });
    expect(reach).toBeNull();
  });
});
