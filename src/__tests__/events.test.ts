import {
  pickEventForRace,
  conditionBand,
  racePhase,
  EventContext,
  RACE_REGION,
  HAZARD_EVENTS,
  MOB_EVENTS,
  GENERIC_EVENTS,
  WEATHER_EVENTS,
  MORALE_EVENTS,
  FOLLOWON_EVENTS,
} from '../data/events';
import { GameEvent, PointOfSail, TacticalChoice } from '../types';
import { mulberry32, resetRng, rnd, rndPick, setRng } from '../engine/rng';

afterEach(() => resetRng());

const HAZARD_IDS = new Set(Object.values(HAZARD_EVENTS).map((e) => e.id));

// Every authored decision, across every pool (incl. the follow-on chains), for
// the invariants below.
const ALL_EVENTS: GameEvent[] = [
  ...GENERIC_EVENTS,
  ...MORALE_EVENTS,
  ...WEATHER_EVENTS,
  ...FOLLOWON_EVENTS,
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

// The context tags fit an everyday decision to the moment — the breeze band, the
// region's waters, the phase of the passage — but only ever as a *preference*:
// the picker falls back to the flat/untagged pool so a draw is always possible,
// and however narrow the preferred set, it still ends in a single seeded pick.
describe('pickEventForRace — context tagging', () => {
  const EVERYDAY_IDS = [...WEATHER_EVENTS, ...MORALE_EVENTS, ...GENERIC_EVENTS].map((e) => e.id);

  it('conditionBand maps wind speed to the four bands', () => {
    expect(conditionBand(4)).toBe('light');
    expect(conditionBand(12)).toBe('moderate');
    expect(conditionBand(20)).toBe('fresh');
    expect(conditionBand(30)).toBe('heavy');
  });

  it('racePhase maps course fraction to early/mid/late', () => {
    expect(racePhase(10, 100)).toBe('early');
    expect(racePhase(50, 100)).toBe('mid');
    expect(racePhase(90, 100)).toBe('late');
    expect(racePhase(0, 0)).toBe('early'); // guard: no divide-by-zero
  });

  it('is deterministic for a fixed seed, point of sail and context', () => {
    const ctx = { raceId: 'race-round-island', band: 'fresh' as const, phase: 'mid' as const };
    const run = () => {
      setRng(mulberry32(42));
      const shown: string[] = [];
      for (let i = 0; i < 12; i += 1) {
        shown.push(pickEventForRace(shown, 'Upwind', ctx).id);
      }
      return shown;
    };
    expect(run()).toEqual(run());
  });

  it('prefers a breeze-fitting event over a mismatched one (light air skips the reef call)', () => {
    // Leave only the fresh/heavy-only reef call and the flat phasing call unseen.
    const shown = EVERYDAY_IDS.filter((id) => id !== 'evt-reef' && id !== 'evt-phasing');
    setRng(mulberry32(1));
    // In light air the reef call doesn't fit, so the flat call is the sole
    // preferred candidate — drawn deterministically, whatever the seed.
    expect(pickEventForRace(shown, 'Upwind', { band: 'light' }).id).toBe('evt-phasing');
  });

  it('prefers a region-fitting event in its waters (a Med race skips the UK headland call)', () => {
    const shown = EVERYDAY_IDS.filter((id) => id !== 'evt-headland' && id !== 'evt-phasing');
    setRng(mulberry32(2));
    // evt-headland is tagged for uk/pnw/lakes; in the Med it isn't preferred.
    expect(pickEventForRace(shown, 'Upwind', { raceId: 'race-middle-sea' }).id).toBe('evt-phasing');
  });

  it('prefers a phase-fitting event (an early leg skips the late-passage night watch)', () => {
    const shown = EVERYDAY_IDS.filter((id) => id !== 'evt-nightwatch' && id !== 'evt-rally');
    setRng(mulberry32(3));
    expect(pickEventForRace(shown, undefined, { phase: 'early' }).id).toBe('evt-rally');
  });

  it('falls back to a valid draw when nothing fits the context', () => {
    // Only the fresh/heavy reef call is unseen; in light air nothing fits, yet the
    // fallback still returns a real everyday event rather than failing to draw.
    const shown = EVERYDAY_IDS.filter((id) => id !== 'evt-reef');
    const allowed = new Set(EVERYDAY_IDS);
    setRng(mulberry32(4));
    const drawn = pickEventForRace(shown, 'Upwind', { band: 'light' });
    expect(allowed.has(drawn.id)).toBe(true);
    expect(drawn.id).toBe('evt-reef'); // the sole fresh candidate — a draw is always possible
  });
});

// Decision memory: a follow-on event is only ever eligible while its triggering
// situation is pending, in which case it jumps the queue; with nothing pending
// the picker must behave byte-for-byte as it always has.
describe('pickEventForRace — follow-on chains', () => {
  const FOLLOW_IDS = new Set(FOLLOWON_EVENTS.map((e) => e.id));

  it('every follow-on chains from a situation some choice actually sets', () => {
    const setKeys = new Set(
      ALL_EVENTS.flatMap((e) => e.choices.map((c) => c.sets)).filter(
        (k): k is string => typeof k === 'string'
      )
    );
    expect(FOLLOWON_EVENTS.length).toBeGreaterThanOrEqual(4);
    FOLLOWON_EVENTS.forEach((e) => {
      expect(typeof e.followsFrom).toBe('string');
      expect(setKeys.has(e.followsFrom as string)).toBe(true);
    });
    // And every set situation has at least one follow-on to pay it off.
    setKeys.forEach((key) => {
      expect(FOLLOWON_EVENTS.some((e) => e.followsFrom === key)).toBe(true);
    });
  });

  it('never draws a follow-on without its situation pending', () => {
    [7, 21, 99, 4].forEach((seed) => {
      setRng(mulberry32(seed));
      const shown: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        const evt = pickEventForRace(shown, undefined, {
          raceId: 'race-round-island',
          band: 'moderate',
          phase: 'mid',
        });
        expect(FOLLOW_IDS.has(evt.id)).toBe(false);
        shown.push(evt.id);
      }
    });
  });

  it('prefers the matching follow-on while its situation is live, under any seed', () => {
    // The man-overboard drama is marked seen so its rare preemption (unchanged,
    // tested elsewhere) can't mask the chain tier.
    [1, 7, 21, 99].forEach((seed) => {
      setRng(mulberry32(seed));
      const evt = pickEventForRace([MOB_EVENTS[0].id], undefined, { pending: 'reefed' });
      expect(evt.id).toBe('evt-fo-shakeout');
    });
  });

  it('respects the point-of-sail gate even for a live chain', () => {
    setRng(() => 0.5);
    // The overdue kite drop is Downwind-only: upwind it must not fire.
    const evt = pickEventForRace([], 'Upwind', { pending: 'big-kite' });
    expect(evt.id).not.toBe('evt-fo-kitedrop');
    setRng(() => 0.5);
    const down = pickEventForRace([], 'Downwind', { pending: 'big-kite' });
    expect(down.id).toBe('evt-fo-kitedrop');
  });

  // The frozen pre-chain picker, reimplemented verbatim, as the byte-identical
  // baseline: with no pending situation the live picker must reproduce its
  // draws exactly — same rng consumption, same candidates, same event — across
  // seeds, points of sail and contexts.
  function referencePick(shown: string[], pointOfSail?: PointOfSail, context: EventContext = {}): GameEvent {
    const seen = new Set(shown);
    const roll = rnd();
    if (!seen.has(MOB_EVENTS[0].id) && roll < 0.08) return MOB_EVENTS[0];
    const everyday = [...WEATHER_EVENTS, ...MORALE_EVENTS, ...GENERIC_EVENTS].filter(
      (e) => !pointOfSail || !e.pointOfSail || e.pointOfSail === pointOfSail
    );
    const fits = (e: GameEvent): boolean => {
      if (e.conditions && context.band && !e.conditions.includes(context.band)) return false;
      if (e.phase && context.phase && e.phase !== context.phase) return false;
      if (e.regions && context.raceId) {
        const region = RACE_REGION[context.raceId];
        if (!e.regions.some((r) => r === context.raceId || r === region)) return false;
      }
      return true;
    };
    const flat = (e: GameEvent): boolean => !e.conditions && !e.regions && !e.phase;
    const fresh = everyday.filter((e) => !seen.has(e.id));
    const fittingFresh = fresh.filter(fits);
    const flatFresh = fresh.filter(flat);
    const candidates =
      fittingFresh.length > 0
        ? fittingFresh
        : flatFresh.length > 0
          ? flatFresh
          : fresh.length > 0
            ? fresh
            : everyday;
    return rndPick(candidates);
  }

  it('with no pending situation the draw is byte-identical to the pre-chain picker', () => {
    const contexts: (EventContext | undefined)[] = [
      undefined,
      {},
      { raceId: 'race-fastnet', band: 'fresh', phase: 'mid' },
      { raceId: 'race-middle-sea', band: 'light', phase: 'early' },
    ];
    const sails: (PointOfSail | undefined)[] = [undefined, 'Upwind', 'Downwind', 'Reach'];
    [7, 21, 42, 99].forEach((seed) => {
      contexts.forEach((ctx) => {
        sails.forEach((pos) => {
          setRng(mulberry32(seed));
          const live: string[] = [];
          for (let i = 0; i < 15; i += 1) live.push(pickEventForRace(live, pos, ctx ?? {}).id);
          setRng(mulberry32(seed));
          const ref: string[] = [];
          for (let i = 0; i < 15; i += 1) ref.push(referencePick(ref, pos, ctx ?? {}).id);
          expect(live).toEqual(ref);
        });
      });
    });
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
