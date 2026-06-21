import {
  applyDecision,
  buildResult,
  campaignCost,
  currentSpeed,
  defaultStepNm,
  initialProgress,
  isRaceUnlocked,
  raceDivision,
  speedMadeGood,
  stepRace,
  vmgPreview,
} from '../engine/gameEngine';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { BOATS, RACES, getBoatById, getRaceById } from '../data';
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
    funds: 50000,
    selectedRaceId: raceId,
    selectedDivision: division,
    selectedBoatId: boat.id,
    selectedCrewIds: ['crew-vega', 'crew-lindqvist', 'crew-hassan'],
    provisions: [{ provisionId: 'prov-water', quantity: 2 }],
    condition: healthy,
    weather,
    windField,
    fleet: createFleet(race, raceDivision(race, division)),
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

  it('awards the full purse for a division win', () => {
    const result = buildResult(baseState(), terminalOutcome(1, true, false));
    const division = raceDivision(getRaceById('race-round-island')!, 'corinthian');
    expect(result.prizeMoney).toBe(division.prizeMoney);
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

  it('boats exist for testing fixtures', () => {
    expect(BOATS.length).toBeGreaterThan(0);
  });
});
