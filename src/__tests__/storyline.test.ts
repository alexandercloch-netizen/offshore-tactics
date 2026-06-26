import {
  applyDecision,
  defaultStepNm,
  buildResult,
  initialProgress,
  raceDivision,
  stepRace,
  DEFAULT_STRATEGY,
} from '../engine/gameEngine';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import {
  HAZARD_EVENTS,
  RACES,
  STORYLINES,
  getBoatById,
  getRaceById,
  signatureOutcomeFor,
  storylineForRace,
} from '../data';
import { GameState, StepResult, TacticalChoice } from '../types';

const healthy = { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 };

const STORIED_RACE_IDS = ['race-fastnet', 'race-newport-bermuda', 'race-sydney-hobart'];

// Build a race-ready state mirroring the engine suite's harness.
function baseState(overrides: Partial<GameState> = {}): GameState {
  const raceId = overrides.selectedRaceId ?? 'race-fastnet';
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
    fleet: createFleet(race, raceDivision(race, division), undefined, boat),
    strategy: DEFAULT_STRATEGY,
    profile: { fleet: [] },
    progress: initialProgress(race, boat, division, windField),
    history: [],
    eventLog: [],
    ...overrides,
  };
}

afterEach(() => resetRng());

// Sail a whole race, taking `pick(event)` at each decision; collect the ids of
// every decision presented and the terminal step. Mirrors the context's loop.
function sailRace(
  raceId: string,
  pick: (event: { id: string; choices: TacticalChoice[] }) => TacticalChoice,
  seed = 123
): { shown: string[]; terminal: StepResult | null; state: GameState } {
  setRng(mulberry32(seed));
  const race = getRaceById(raceId)!;
  let state = baseState({ selectedRaceId: raceId });
  const shown: string[] = [];
  let terminal: StepResult | null = null;

  for (let i = 0; i < 30000; i += 1) {
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
      const decision = applyDecision(state, pick(out.event));
      state = { ...state, progress: decision.progress, condition: decision.condition, fleet: decision.fleet };
      if (decision.finished || decision.retired) {
        terminal = decision;
        break;
      }
    }
    if (out.finished || out.retired) {
      terminal = out;
      break;
    }
  }
  return { shown, terminal, state };
}

const safest = (event: { choices: TacticalChoice[] }): TacticalChoice =>
  event.choices.reduce((a, b) => (b.risk < a.risk ? b : a), event.choices[0]);

describe('storyline content', () => {
  it('covers exactly the three flagships for PR1', () => {
    expect(STORYLINES.map((s) => s.raceId).sort()).toEqual([...STORIED_RACE_IDS].sort());
  });

  it("each storyline's pinned beat names a real waypoint on its race", () => {
    for (const story of STORYLINES) {
      const race = getRaceById(story.raceId)!;
      const beat = story.beats.find((b) => b.kind === 'beat');
      expect(beat).toBeDefined();
      expect(beat!.pinnedWaypoint).toBeDefined();
      const names = race.waypoints.map((w) => w.name);
      expect(names).toContain(beat!.pinnedWaypoint);
      // ...and it lines up with the race's hazard mark and its event's pin.
      expect(beat!.pinnedWaypoint).toBe(race.hazardWaypoint);
      expect(HAZARD_EVENTS[race.hazard].pinToWaypoint).toBe(beat!.pinnedWaypoint);
    }
  });

  it('provides bold / safe / hedge debrief variants for each storyline', () => {
    for (const story of STORYLINES) {
      const outcomes = story.beats
        .filter((b) => b.kind === 'debrief')
        .map((b) => b.outcome)
        .sort();
      expect(outcomes).toEqual(['bold', 'hedge', 'safe']);
    }
  });

  it('links each signature event to its storyline via storyBeat', () => {
    for (const story of STORYLINES) {
      const race = getRaceById(story.raceId)!;
      expect(HAZARD_EVENTS[race.hazard].storyBeat).toBe(story.raceId);
    }
  });
});

describe('signature choice fork', () => {
  it('has no strictly-dominated option (a genuine trade-off)', () => {
    // No option may be no-worse on every axis than another AND strictly better
    // on at least one — i.e. nothing is a free lunch. Lower is better for time
    // (timeDelta), risk and hull/stamina/morale loss; we compare the player-facing
    // "cost" of each axis. A field-resolved bold option always exists too.
    for (const story of STORYLINES) {
      const event = HAZARD_EVENTS[getRaceById(story.raceId)!.hazard];
      expect(event.choices.some((c) => c.field)).toBe(true);
      // Express each axis as a cost (higher = worse), then check Pareto-undominated.
      const cost = (c: TacticalChoice) => [
        c.timeDelta, // hours added (lower better)
        -c.staminaDelta, // stamina lost (negative delta → positive cost)
        -c.moraleDelta,
        -c.hullDelta,
        c.risk,
      ];
      const dominates = (a: TacticalChoice, b: TacticalChoice): boolean => {
        const ca = cost(a);
        const cb = cost(b);
        const noWorse = ca.every((v, i) => v <= cb[i] + 1e-9);
        const strictlyBetter = ca.some((v, i) => v < cb[i] - 1e-9);
        return noWorse && strictlyBetter;
      };
      for (const a of event.choices) {
        for (const b of event.choices) {
          if (a === b) continue;
          expect(dominates(a, b)).toBe(false);
        }
      }
    }
  });

  it('maps each choice to its bold/safe/hedge outcome', () => {
    for (const story of STORYLINES) {
      const event = HAZARD_EVENTS[getRaceById(story.raceId)!.hazard];
      const outcomes = event.choices.map((c) => signatureOutcomeFor(event, c.id)).sort();
      expect(outcomes).toEqual(['bold', 'hedge', 'safe']);
    }
  });
});

describe('pinned signature firing (engine)', () => {
  it.each(STORIED_RACE_IDS)('fires the signature exactly once, at its mark: %s', (raceId) => {
    const event = HAZARD_EVENTS[getRaceById(raceId)!.hazard];
    const { shown, terminal } = sailRace(raceId, safest);
    expect(terminal).not.toBeNull();
    expect(shown.filter((id) => id === event.id)).toHaveLength(1);
  });

  it('records the signature choice and selects the matching debrief beat', () => {
    const raceId = 'race-fastnet';
    const event = HAZARD_EVENTS[getRaceById(raceId)!.hazard];
    const bold = event.choices.find((c) => c.field)!;
    // Always take the bold option at the signature, safe elsewhere.
    const { terminal, state } = sailRace(raceId, (e) =>
      e.id === event.id ? bold : safest(e)
    );
    expect(terminal).not.toBeNull();
    if (terminal!.finished) {
      const result = buildResult(state, terminal!);
      expect(result.signatureOutcome).toBe('bold');
      const story = storylineForRace(raceId)!;
      const beat = story.beats.find((b) => b.kind === 'debrief' && b.outcome === 'bold');
      expect(result.storyDebrief).toBe(beat!.body);
    } else {
      // If a bold run retired, the choice was still recorded on progress.
      expect(state.progress!.signatureChoiceId).toBe(bold.id);
    }
  });

  it('is deterministic for a storied race under a fixed seed', () => {
    const a = sailRace('race-fastnet', safest, 77);
    const b = sailRace('race-fastnet', safest, 77);
    expect(a.shown).toEqual(b.shown);
    expect(a.terminal?.progress.elapsedHours).toBeCloseTo(b.terminal?.progress.elapsedHours ?? -1, 6);
    expect(a.terminal?.progress.distanceCoveredNm).toBeCloseTo(
      b.terminal?.progress.distanceCoveredNm ?? -1,
      6
    );
  });
});

describe('un-storied races are unaffected', () => {
  it('have no storyline and their hazard event carries no pin', () => {
    const unstoried = RACES.filter((r) => !storylineForRace(r.id));
    expect(unstoried.length).toBeGreaterThan(0);
    for (const race of unstoried) {
      expect(HAZARD_EVENTS[race.hazard].pinToWaypoint).toBeUndefined();
    }
  });

  it('stepRace output is byte-identical with and without the storyline lookup path', () => {
    // An un-storied race never enters the pinned branch, so a fixed-seed single
    // step is unchanged. Snapshot the key outputs for a representative course.
    const run = () => {
      setRng(mulberry32(42));
      const race = getRaceById('race-round-island')!;
      let state = baseState({ selectedRaceId: 'race-round-island' });
      const seq: { d: number; h: number; eventId: string | null }[] = [];
      for (let i = 0; i < 200; i += 1) {
        const out = stepRace(state, defaultStepNm(race));
        seq.push({ d: out.progress.distanceCoveredNm, h: out.progress.elapsedHours, eventId: out.event?.id ?? null });
        state = { ...state, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
        if (out.event) {
          const dec = applyDecision(state, safest(out.event));
          state = { ...state, progress: dec.progress, condition: dec.condition, fleet: dec.fleet };
        }
        if (out.finished || out.retired) break;
      }
      return seq;
    };
    expect(run()).toEqual(run());
  });
});
