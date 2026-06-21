import {
  applyDecision,
  buildResult,
  campaignCost,
  computeVmg,
  currentPointOfSail,
  defaultStepNm,
  effectiveSpeed,
  initialProgress,
  isRaceUnlocked,
  raceDivision,
  stepRace,
  vmgPreview,
} from '../engine/gameEngine';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { BOATS, RACES, WEATHER, getBoatById, getRaceById } from '../data';
import {
  BoatCondition,
  GameState,
  RaceResult,
  StepResult,
  TacticalChoice,
} from '../types';

const moderate = WEATHER.find((w) => w.id === 'wx-moderate')!;
const healthy: BoatCondition = {
  hullIntegrity: 100,
  crewStamina: 100,
  crewMorale: 100,
};

function baseState(overrides: Partial<GameState> = {}): GameState {
  const raceId = overrides.selectedRaceId ?? 'race-round-island';
  const division = overrides.selectedDivision ?? 'corinthian';
  const weather = overrides.weather ?? moderate;
  const race = getRaceById(raceId)!;
  return {
    funds: 50000,
    selectedRaceId: raceId,
    selectedDivision: division,
    selectedBoatId: 'boat-mistral',
    selectedCrewIds: ['crew-vega', 'crew-lindqvist', 'crew-hassan'],
    provisions: [{ provisionId: 'prov-water', quantity: 2 }],
    condition: healthy,
    weather,
    progress: initialProgress(race, division, weather),
    history: [],
    eventLog: [],
    ...overrides,
  };
}

afterEach(() => resetRng());

describe('campaignCost', () => {
  it('uses the selected division entry fee', () => {
    const race = getRaceById('race-round-island')!;
    const corinthian = campaignCost(baseState({ provisions: [], selectedCrewIds: [] }));
    const pro = campaignCost(
      baseState({ provisions: [], selectedCrewIds: [], selectedDivision: 'pro' })
    );
    expect(corinthian.entryFee).toBe(race.divisions.corinthian.entryFee);
    expect(pro.entryFee).toBe(race.divisions.pro.entryFee);
    expect(pro.total).toBeGreaterThan(corinthian.total);
  });

  it('includes charter, wages and provisions', () => {
    const cost = campaignCost(baseState());
    expect(cost.charter).toBe(getBoatById('boat-mistral')!.price);
    expect(cost.wages).toBeGreaterThan(0);
    expect(cost.provisions).toBeGreaterThan(0);
    expect(cost.total).toBe(
      cost.entryFee + cost.charter + cost.wages + cost.provisions
    );
  });
});

describe('isRaceUnlocked', () => {
  const fastnet = getRaceById('race-fastnet')!;

  it('unlocks races with no prerequisite', () => {
    const round = getRaceById('race-round-island')!;
    expect(isRaceUnlocked(round, [])).toBe(true);
  });

  it('locks a race until its prerequisite is finished', () => {
    expect(isRaceUnlocked(fastnet, [])).toBe(false);
    const finishedPrereq: RaceResult[] = [
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
    expect(isRaceUnlocked(fastnet, finishedPrereq)).toBe(true);
  });

  it('does not count a retirement as finishing', () => {
    const retired: RaceResult[] = [
      {
        raceId: fastnet.unlockAfter as string,
        raceName: 'x',
        boatId: 'b',
        finished: false,
        retired: true,
        position: 10,
        fleetSize: 10,
        elapsedHours: 10,
        prizeMoney: 0,
        summary: '',
        timestamp: 0,
      },
    ];
    expect(isRaceUnlocked(fastnet, retired)).toBe(false);
  });
});

describe('effectiveSpeed', () => {
  const boat = getBoatById('boat-mistral')!;

  it('rewards better crew condition', () => {
    const tired: BoatCondition = { hullIntegrity: 100, crewStamina: 20, crewMorale: 20 };
    const fast = effectiveSpeed(boat, moderate, healthy, 'Reach');
    const slow = effectiveSpeed(boat, moderate, tired, 'Reach');
    expect(fast).toBeGreaterThan(slow);
  });

  it('never drops below a floor', () => {
    const wrecked: BoatCondition = { hullIntegrity: 0, crewStamina: 0, crewMorale: 0 };
    const calm = WEATHER.find((w) => w.id === 'wx-calm')!;
    expect(effectiveSpeed(boat, calm, wrecked, 'Upwind')).toBeGreaterThanOrEqual(0.5);
  });
});

describe('VMG', () => {
  it('reflects point-of-sail efficiency', () => {
    expect(computeVmg(10, 'Reach')).toBeGreaterThan(computeVmg(10, 'Upwind'));
  });

  it('previews a higher VMG for a time-saving choice', () => {
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

describe('initialProgress', () => {
  it('starts at zero distance with a point of sail and a scheduled decision', () => {
    setRng(mulberry32(1));
    const race = getRaceById('race-fastnet')!;
    const p = initialProgress(race, 'corinthian', moderate);
    expect(p.distanceCoveredNm).toBe(0);
    expect(p.totalDistanceNm).toBe(race.distanceNm);
    expect(p.decisionsTaken).toBe(0);
    expect(p.nextDecisionAtNm).toBeGreaterThan(0);
    expect(['Upwind', 'Reach', 'Downwind']).toContain(p.pointOfSail);
  });
});

describe('currentPointOfSail', () => {
  it('derives a valid point of sail from the course bearing', () => {
    const race = getRaceById('race-sydney-hobart')!;
    const pos = currentPointOfSail(race, moderate, race.distanceNm * 0.3);
    expect(['Upwind', 'Reach', 'Downwind']).toContain(pos);
  });
});

describe('stepRace (continuous distance model)', () => {
  it('advances distance and accumulates elapsed time', () => {
    setRng(mulberry32(5));
    const race = getRaceById('race-round-island')!;
    const state = baseState();
    const out = stepRace(state, defaultStepNm(race));
    expect(out.progress.distanceCoveredNm).toBeGreaterThan(0);
    expect(out.progress.elapsedHours).toBeGreaterThan(0);
    expect(out.progress.distanceCoveredNm).toBeLessThanOrEqual(race.distanceNm);
  });

  it('plays a full race to a terminal state (finish or retire)', () => {
    setRng(mulberry32(123));
    const race = getRaceById('race-round-island')!;
    let state = baseState();
    let terminal: StepResult | null = null;

    for (let i = 0; i < 5000; i += 1) {
      const out = stepRace(state, defaultStepNm(race));
      state = {
        ...state,
        progress: out.progress,
        condition: out.condition,
        weather: out.weather,
      };
      if (out.event) {
        const decision = applyDecision(state, out.event.choices[0]);
        state = { ...state, progress: decision.progress, condition: decision.condition };
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
    if (terminal!.finished) {
      expect(state.progress!.distanceCoveredNm).toBeCloseTo(race.distanceNm, 0);
    }
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
    return {
      progress: {
        distanceCoveredNm: 50,
        totalDistanceNm: 50,
        elapsedHours: 5,
        position,
        pointOfSail: 'Reach',
        nextDecisionAtNm: 999,
        decisionsTaken: 3,
      },
      condition: healthy,
      weather: moderate,
      event: null,
      finished,
      retired,
    };
  }

  it('awards the full purse for a division win', () => {
    const state = baseState();
    const result = buildResult(state, terminalOutcome(1, true, false));
    const division = raceDivision(getRaceById('race-round-island')!, 'corinthian');
    expect(result.prizeMoney).toBe(division.prizeMoney);
    expect(result.finished).toBe(true);
    expect(result.division).toBe('corinthian');
  });

  it('pays nothing and records a retirement', () => {
    const state = baseState();
    const result = buildResult(state, terminalOutcome(20, false, true));
    expect(result.prizeMoney).toBe(0);
    expect(result.retired).toBe(true);
  });
});

describe('data integrity', () => {
  it('every race has ordered waypoints starting and finishing correctly', () => {
    RACES.forEach((race) => {
      expect(race.waypoints.length).toBeGreaterThanOrEqual(2);
      expect(race.waypoints[0].type).toBe('start');
      expect(race.waypoints[race.waypoints.length - 1].type).toBe('finish');
      race.waypoints.forEach((wp) => {
        expect(wp.lat).toBeGreaterThanOrEqual(-90);
        expect(wp.lat).toBeLessThanOrEqual(90);
        expect(wp.lon).toBeGreaterThanOrEqual(-180);
        expect(wp.lon).toBeLessThanOrEqual(180);
      });
    });
  });

  it('every race defines both divisions and a valid unlock reference', () => {
    const ids = new Set(RACES.map((r) => r.id));
    RACES.forEach((race) => {
      expect(race.divisions.corinthian).toBeDefined();
      expect(race.divisions.pro).toBeDefined();
      if (race.unlockAfter) {
        expect(ids.has(race.unlockAfter)).toBe(true);
      }
    });
  });

  it('boats exist for testing fixtures', () => {
    expect(BOATS.length).toBeGreaterThan(0);
  });
});
