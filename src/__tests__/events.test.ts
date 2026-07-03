import {
  pickEventForRace,
  HAZARD_EVENTS,
  MOB_EVENTS,
  GENERIC_EVENTS,
  WEATHER_EVENTS,
  MORALE_EVENTS,
} from '../data/events';
import { GameEvent, PointOfSail, TacticalChoice } from '../types';
import { mulberry32, resetRng, setRng } from '../engine/rng';

afterEach(() => resetRng());

const HAZARD_IDS = new Set(Object.values(HAZARD_EVENTS).map((e) => e.id));

// Every authored decision, across every pool, for the invariants below.
const ALL_EVENTS: GameEvent[] = [
  ...GENERIC_EVENTS,
  ...MORALE_EVENTS,
  ...WEATHER_EVENTS,
  ...MOB_EVENTS,
  ...Object.values(HAZARD_EVENTS),
];

// Drive a whole race's worth of everyday decisions through the picker, threading
// the shown-ids list the way the engine does.
function runRace(count: number): string[] {
  const shown: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const evt = pickEventForRace(shown);
    shown.push(evt.id);
  }
  return shown;
}

describe('pickEventForRace', () => {
  it('keeps decisions varied across a race (no heavy repetition)', () => {
    [7, 21, 99].forEach((seed) => {
      setRng(mulberry32(seed));
      const shown = runRace(10);
      expect(new Set(shown).size).toBeGreaterThanOrEqual(9);
    });
  });

  it('never presents the same decision twice in a row', () => {
    [7, 21, 99].forEach((seed) => {
      setRng(mulberry32(seed));
      const shown = runRace(10);
      for (let i = 1; i < shown.length; i += 1) {
        expect(shown[i]).not.toBe(shown[i - 1]);
      }
    });
  });

  it('never returns a signature hazard — those fire at their mark, in the engine', () => {
    setRng(mulberry32(5));
    runRace(30).forEach((id) => expect(HAZARD_IDS.has(id)).toBe(false));
  });

  it('shows the man-overboard drama at most once per race', () => {
    setRng(mulberry32(11));
    const shown = runRace(14);
    expect(shown.filter((id) => id === MOB_EVENTS[0].id).length).toBeLessThanOrEqual(1);
  });

  it('only ever draws from the everyday + man-overboard pools', () => {
    setRng(mulberry32(4));
    const allowed = new Set(
      [...WEATHER_EVENTS, ...MORALE_EVENTS, ...GENERIC_EVENTS, ...MOB_EVENTS].map((e) => e.id)
    );
    runRace(20).forEach((id) => expect(allowed.has(id)).toBe(true));
  });

  it('is deterministic for a fixed seed and point of sail', () => {
    const run = () => {
      setRng(mulberry32(31));
      const shown: string[] = [];
      for (let i = 0; i < 12; i += 1) {
        shown.push(pickEventForRace(shown, 'Downwind').id);
      }
      return shown;
    };
    expect(run()).toEqual(run());
  });
});

// The point-of-sail gate: an event authored for one point of sail can never be
// drawn on a contradictory leg (the "DOWNWIND header on an Upwind gauge" bug).
describe('pickEventForRace — point-of-sail gate', () => {
  // Which events are pinned to a specific leg (the rest are situation-agnostic).
  const upwindOnly = [...GENERIC_EVENTS, ...WEATHER_EVENTS, ...MORALE_EVENTS]
    .filter((e) => e.pointOfSail === 'Upwind')
    .map((e) => e.id);
  const downwindOnly = [...GENERIC_EVENTS, ...WEATHER_EVENTS, ...MORALE_EVENTS]
    .filter((e) => e.pointOfSail === 'Downwind')
    .map((e) => e.id);

  const drawMany = (pos: PointOfSail): string[] => {
    setRng(mulberry32(3));
    const shown: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      shown.push(pickEventForRace(shown, pos).id);
    }
    return shown;
  };

  it('never draws an upwind-only event on a downwind leg', () => {
    const shown = drawMany('Downwind');
    upwindOnly.forEach((id) => expect(shown).not.toContain(id));
    // Sanity: the gate has something to exclude.
    expect(upwindOnly.length).toBeGreaterThan(0);
  });

  it('never draws a downwind-only event on an upwind leg', () => {
    const shown = drawMany('Upwind');
    downwindOnly.forEach((id) => expect(shown).not.toContain(id));
    expect(downwindOnly.length).toBeGreaterThan(0);
  });

  it('never draws a leg-specific event on a reach', () => {
    const shown = drawMany('Reach');
    [...upwindOnly, ...downwindOnly].forEach((id) => expect(shown).not.toContain(id));
  });

  it('matching-leg events are still eligible (upwind draws the wind-shift)', () => {
    const shown = drawMany('Upwind');
    upwindOnly.forEach((id) => expect(shown).toContain(id));
  });
});

// No decision may offer a Pareto-dominated option: every choice must be the best
// on at least one axis, so there's a real trade-off and never an obvious "free"
// pick. Cost vector (all "lower is better"): [time, -stamina, -morale, -hull, risk].
describe('event choices are non-dominated (a real trade-off)', () => {
  const cost = (c: TacticalChoice): number[] => [
    c.timeDelta,
    -c.staminaDelta,
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

  it('has no dominated choice in any event', () => {
    for (const event of ALL_EVENTS) {
      for (const a of event.choices) {
        for (const b of event.choices) {
          if (a === b) continue;
          expect({ event: event.id, a: a.id, b: b.id, dominated: dominates(a, b) }).toEqual({
            event: event.id,
            a: a.id,
            b: b.id,
            dominated: false,
          });
        }
      }
    }
  });
});
