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

// Drive a whole race's worth of decisions through the picker, threading the
// shown-ids list the way the engine does.
function runRace(hazard: Parameters<typeof pickEventForRace>[0], count: number): string[] {
  const shown: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const evt = pickEventForRace(hazard, shown);
    shown.push(evt.id);
  }
  return shown;
}

describe('pickEventForRace', () => {
  it('keeps decisions varied across a race (no heavy repetition)', () => {
    // The old picker hammered the single hazard event ~40% of the time; the new
    // one threads the shown list, so a typical race is almost entirely distinct.
    [7, 21, 99].forEach((seed) => {
      setRng(mulberry32(seed));
      const shown = runRace('celtic_weather', 10);
      expect(new Set(shown).size).toBeGreaterThanOrEqual(9);
    });
  });

  it('never presents the same decision twice in a row', () => {
    [7, 21, 99].forEach((seed) => {
      setRng(mulberry32(seed));
      const shown = runRace('celtic_weather', 10);
      for (let i = 1; i < shown.length; i += 1) {
        expect(shown[i]).not.toBe(shown[i - 1]);
      }
    });
  });

  it('shows the signature hazard at most once per race', () => {
    setRng(mulberry32(3));
    const shown = runRace('bass_strait', 14);
    const hazardId = HAZARD_EVENTS.bass_strait.id;
    expect(shown.filter((id) => id === hazardId).length).toBeLessThanOrEqual(1);
  });

  it('shows the man-overboard drama at most once per race', () => {
    setRng(mulberry32(11));
    const shown = runRace('gulf_stream', 14);
    expect(shown.filter((id) => id === MOB_EVENTS[0].id).length).toBeLessThanOrEqual(1);
  });

  it('eventually presents the signature hazard over a long race', () => {
    setRng(mulberry32(2));
    const shown = runRace('tidal_gate', 14);
    expect(shown).toContain(HAZARD_EVENTS.tidal_gate.id);
  });

  it('falls back to everyday events with no hazard', () => {
    setRng(mulberry32(4));
    const evt = pickEventForRace(undefined, []);
    expect(evt).toBeDefined();
    expect(evt.choices.length).toBeGreaterThanOrEqual(2);
  });
});
