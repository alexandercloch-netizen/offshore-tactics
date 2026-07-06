// The cockpit's entire motion vocabulary, as data. Every animated surface in
// the racing screen draws its durations from here (core RN `Animated` only —
// no Reanimated, no LayoutAnimation, no web CSS), so reduced motion can gate
// the lot in one place: `durations(reduced)` collapses everything to a short
// cross-fade and instant snaps.

export interface MotionDurations {
  enter: number; // dock/panel arriving
  exit: number; // dock/panel leaving
  mob: number; // the MOB dock's urgent entry
  counterPop: number; // the ⇄N badge acknowledging a change
  ribbonIn: number; // debrief ribbon arriving
  ribbonOut: number; // debrief ribbon leaving
}

export const MOTION: MotionDurations = {
  enter: 220,
  exit: 160,
  mob: 140,
  counterPop: 200,
  ribbonIn: 180,
  ribbonOut: 200,
};

// How long the debrief ribbon holds before its independent auto-continue fires.
// Deliberately a wall-clock number for a `setTimeout` — NEVER a tick-driven
// timer: the sim is held while the ribbon shows, so a tick timer would softlock
// the race (and the e2e).
export const RIBBON_AUTO_CONTINUE_MS = 6000;

// The reduced-motion fallback: one short cross-fade everywhere, snaps for the
// rest.
export const REDUCED_FADE = 120;

export function durations(reducedMotion: boolean): MotionDurations {
  if (!reducedMotion) return MOTION;
  return {
    enter: REDUCED_FADE,
    exit: REDUCED_FADE,
    mob: REDUCED_FADE,
    counterPop: 0,
    ribbonIn: REDUCED_FADE,
    ribbonOut: REDUCED_FADE,
  };
}

// The MOB lead alarm pulses under 3Hz (a slow, insistent breath, not a strobe);
// reduced motion holds it solid.
export const MOB_PULSE_MS = 700;
