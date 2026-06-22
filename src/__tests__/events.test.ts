import {
  pickEventForRace,
  HAZARD_EVENTS,
  MOB_EVENTS,
  GENERIC_EVENTS,
  WEATHER_EVENTS,
  MORALE_EVENTS,
} from '../data/events';
import { mulberry32, resetRng, setRng } from '../engine/rng';

afterEach(() => resetRng());

const HAZARD_IDS = new Set(Object.values(HAZARD_EVENTS).map((e) => e.id));

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
});
