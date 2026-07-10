import { CareerRecord, RaceResult } from '../types';
import { getRaceById } from '../data';
import { HONOURS, Honour, MARQUEE_RACE_IDS } from '../data/honours';

// The honours evaluator + the sailor's rank ladder. PURE and deterministic: it
// reads the already-persisted lifetime record (+ the capped history) and the
// declarative catalogue, draws no RNG and reads no clock (the earn timestamp is
// injected), so it lives OFF the engine's simulation path. gameEngine.ts must
// never import this file — asserted by honours.test.ts, mirroring the career
// source-barrier — or an honour computed mid-race could perturb a golden pin.

export interface HonourAward {
  id: string;
  earned: boolean;
  have: number;
  need: number;
  earnedAt?: number; // epoch ms it was first earned (latched from prior awards)
}

export interface HonourEvaluation {
  awards: HonourAward[]; // one per catalogue honour, in catalogue order
  earned: HonourAward[]; // the earned subset
  justEarned: string[]; // ids earned this evaluation that weren't earned before
}

// Evaluate every catalogue honour against the record. `priorAwards` carries the
// last evaluation so earned honours LATCH (once earned, they stay earned, and
// their `earnedAt` is preserved). `now` stamps a freshly-earned honour — passed
// in, never Date.now(), so the function is deterministic and testable.
export function evaluateHonours(
  career: CareerRecord,
  history: RaceResult[],
  priorAwards?: HonourAward[],
  now?: number
): HonourEvaluation {
  const prior = new Map<string, HonourAward>();
  for (const a of priorAwards ?? []) prior.set(a.id, a);

  const awards: HonourAward[] = HONOURS.map((h: Honour) => {
    const { have, need } = h.progress(career, history ?? []);
    const priorAward = prior.get(h.id);
    const priorEarned = priorAward?.earned === true;
    // Latch: once earned it stays earned, even if a streak-style metric later
    // dips below its target.
    const earned = have >= need || priorEarned;
    const earnedAt = priorAward?.earnedAt ?? (earned && !priorEarned ? now : undefined);
    return { id: h.id, earned, have, need, earnedAt };
  });

  const earned = awards.filter((a) => a.earned);
  const justEarned = awards
    .filter((a) => a.earned && prior.get(a.id)?.earned !== true)
    .map((a) => a.id);

  return { awards, earned, justEarned };
}

export interface SailorRank {
  title: string;
  next?: string; // the next rung's title, if any
}

// The RYA-Yachtmaster ladder. Every threshold is transparent and BOAT-NEUTRAL —
// crew, miles, corrected finishes and pace vs the optimal line, never money or
// line-honours (a quick hull must not buy rank). A strict progression: you climb
// a rung only once its own bar is cleared, and the bars are monotone by
// construction (a win also books a podium; higher mileage subsumes lower), so
// the ladder never skips.
const RANK_LADDER: { title: string; met: (c: CareerRecord) => boolean }[] = [
  { title: 'Dock-hand', met: () => true },
  // First time across a finish line.
  { title: 'Competent Crew', met: (c) => c.racesFinished >= 1 },
  // A corrected-time podium and 500 nm logged.
  { title: 'Day Skipper', met: (c) => c.podiums >= 1 && c.nmLogged >= 500 },
  // A corrected-time win and 2,500 nm logged.
  { title: 'Coastal Skipper', met: (c) => c.wins >= 1 && c.nmLogged >= 2500 },
  // Three wins across at least two different courses, sailing to 90% of the
  // optimal line at least once.
  {
    title: 'Yachtmaster Offshore',
    met: (c) =>
      c.wins >= 3 &&
      new Set(c.wonRaceIds ?? []).size >= 2 &&
      (c.bestPaceVsOptimalPct ?? 0) >= 90,
  },
  // An ocean-class win, 10,000 nm logged, and at least one blue-riband honour.
  {
    title: 'Yachtmaster Ocean',
    met: (c) =>
      hasOceanWin(c) && c.nmLogged >= 10000 && hasBlueRibandHonour(c),
  },
  // The Grand Slam: every marquee course won on corrected time.
  {
    title: 'Master Mariner',
    met: (c) => MARQUEE_RACE_IDS.every((id) => (c.wonRaceIds ?? []).includes(id)),
  },
];

function hasOceanWin(c: CareerRecord): boolean {
  return (c.wonRaceIds ?? []).some((id) => getRaceById(id)?.difficulty === 'Ocean');
}

// Whether any blue-riband honour is earned. Blue-riband honours read the record
// only (no history), so an empty history is safe here.
function hasBlueRibandHonour(c: CareerRecord): boolean {
  return HONOURS.filter((h) => h.tier === 'blueRiband').some((h) => {
    const { have, need } = h.progress(c, []);
    return have >= need;
  });
}

export function sailorRank(career: CareerRecord): SailorRank {
  let idx = 0;
  // Climb while the next rung's own bar is cleared.
  while (idx + 1 < RANK_LADDER.length && RANK_LADDER[idx + 1].met(career)) {
    idx += 1;
  }
  return {
    title: RANK_LADDER[idx].title,
    next: idx + 1 < RANK_LADDER.length ? RANK_LADDER[idx + 1].title : undefined,
  };
}
