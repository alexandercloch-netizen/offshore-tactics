import {
  EDGE_SEND,
  applyDecision,
  defaultStepNm,
  effectiveTacticalEdge,
  fleetBenchmarkHours,
  initialCondition,
  initialProgress,
  raceDivision,
  ratingTccFor,
  stepRace,
} from '../engine/gameEngine';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createTidalField } from '../engine/current';
import { correctedPosition, createFleet } from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getBoatById, getCrewById, getRaceById } from '../data';
import { RACES } from '../data/races';
import {
  Competitor,
  DivisionKey,
  EffortMode,
  GameEvent,
  GameState,
  SailMode,
  StepResult,
  TacticalChoice,
} from '../types';

// ---------------------------------------------------------------------------
// THE DIFFICULTY INVARIANT — the keystone of the self-calibrating difficulty
// framework. It encodes, in ONE cross-race contract, what "fair" means for
// every current AND future race: sail par and you finish mid-fleet; sail well
// and you reach the top third; sail recklessly and you fall to the back — and
// no single seed's luck can swing the result across the whole fleet.
//
// The matrix is ~2 HOURS of headless sim, so it is GATED behind
// RUN_INVARIANT=1 and SKIPPED by the normal `npm test` / CI gate. It is RED
// today by design: it is the target the later engine-calibration work turns
// green (never re-bless the thresholds to hide a red cell — fix the engine).
//
// An ALWAYS-ON harness test below runs ONE tiny cell so CI proves the harness
// compiles and runs without paying the 2h cost or asserting the (currently
// failing) contract.
//
// Modelled on the seeded headless loop in `goldenRace.test.ts:59-181` (the real
// `stepRace` + `applyDecision` tick model, fleet paced by `fleetBenchmarkHours`)
// and the play-policy idea in `fleetTightness.test.ts`.
// ---------------------------------------------------------------------------

afterEach(() => resetRng());

// A coarser-than-gameplay step keeps the headless matrix tractable. Finish time
// integrates over distance, so a coarser step is UNBIASED — just a rougher
// quadrature of the same race (the fleet is paced through its own clean run at a
// coarser step too, so both sides sample the same weather). 1.5× the live step.
const STEP_SCALE = 1.5;

// A fixed, full 4-role Pro crew and standard provisions (mirrors goldenRace) —
// the boat + crew are held constant so a cell varies ONLY the in-race levers
// (effort + decisions + sail calls) the policy exercises.
const PRO_CREW = ['crew-vega', 'crew-lindqvist', 'crew-hassan', 'crew-mensah'];
const PROVISIONS = [
  { provisionId: 'prov-galley', quantity: 6 },
  { provisionId: 'prov-water', quantity: 6 },
  { provisionId: 'prov-spares', quantity: 1 },
  { provisionId: 'prov-safety', quantity: 1 },
];

// --- Play policies: a pure (state, event) => choice + an effort mode. -------
// The three ends of how a player engages a race.
interface Policy {
  name: 'par' | 'good' | 'reckless';
  effort: EffortMode;
  pick(state: GameState, event: GameEvent): TacticalChoice;
  // The sail auto-helm mode. The REAL `autoSailTarget` + `resolveSailChange`
  // path runs INSIDE `stepRace` when this is set, so the harness manages the
  // wardrobe exactly as the shipped game does — no bespoke hoist-every-tick.
  sailMode: SailMode;
}

const lowestRisk = (choices: TacticalChoice[]): TacticalChoice =>
  [...choices].sort((a, b) => a.risk - b.risk)[0];
const highestRisk = (choices: TacticalChoice[]): TacticalChoice => {
  const s = [...choices].sort((a, b) => a.risk - b.risk);
  return s[s.length - 1];
};

// Par: cruise, always the lowest-risk call. The Balanced auto-helm manages the
// wardrobe (the shipped player default) — the baseline "just complete the race"
// engagement, decisions aside.
const PAR: Policy = {
  name: 'par',
  effort: 'cruise',
  pick: (_state, event) => lowestRisk(event.choices),
  sailMode: 'balanced',
};

// Good: push, send the boldest FIELD call only when the read backs it
// (`effectiveTacticalEdge >= EDGE_SEND`), else play safe — with the same
// Balanced auto-helm flying the wardrobe. Skilful, disciplined racing.
const GOOD: Policy = {
  name: 'good',
  effort: 'push',
  pick: (state, event) => {
    if (effectiveTacticalEdge(state) >= EDGE_SEND) {
      const field = event.choices.filter((c) => c.field);
      if (field.length) return highestRisk(field);
    }
    return lowestRisk(event.choices);
  },
  sailMode: 'balanced',
};

// Reckless: push, always the boldest call whatever the read says. Same Balanced
// auto-helm as Good (it manages its wardrobe like a real racer would), so the
// ONLY difference from Good is the indiscriminate bold decision — isolating
// "sends everything regardless of the edge" as the thing that costs the race.
const RECKLESS: Policy = {
  name: 'reckless',
  effort: 'push',
  pick: (_state, event) => highestRisk(event.choices),
  sailMode: 'balanced',
};

// The always-on harness smoke test sails MANUAL — draw-neutral and cheap, and it
// proves the tick loop runs without paying for the auto-helm's changes.
const PAR_MANUAL: Policy = {
  name: 'par',
  effort: 'cruise',
  pick: (_state, event) => lowestRisk(event.choices),
  sailMode: 'manual',
};

// --- One matrix cell: a single seeded headless race → corrected percentile. --
// Returns the player's CORRECTED (handicap) finishing percentile, lower = better
// (1/fleet = won, ~1.0 = last). corrected time is boat-neutral, so this measures
// how well the crew SAILED, not what they chartered.
function runCell(
  raceId: string,
  boatId: string,
  division: DivisionKey,
  policy: Policy,
  seed: number
): number {
  setRng(mulberry32(seed));

  const race = getRaceById(raceId)!;
  const boat = getBoatById(boatId)!;
  const crew = PRO_CREW.map((id) => getCrewById(id)!);

  // Mirror GameContext.beginRace: field → tide → weather → fleet (paced off the
  // player's own boat + crew via the faithful benchmark) → initial progress.
  const windField = createWindField(race);
  const tidalField = createTidalField(race);
  const start = race.waypoints[0];
  const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
  const fleet = createFleet(
    race,
    raceDivision(race, division),
    fleetBenchmarkHours(race, windField, boat, PRO_CREW, PROVISIONS),
    boat
  );

  let state: GameState = {
    funds: 250000,
    selectedRaceId: race.id,
    selectedDivision: division,
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: PRO_CREW,
    provisions: PROVISIONS,
    strategy: { bias: 0, effort: policy.effort, sailMode: policy.sailMode },
    profile: { fleet: [] },
    condition: initialCondition(crew, PROVISIONS, race),
    weather,
    windField,
    tidalField,
    fleet,
    progress: initialProgress(race, boat, division, windField),
    history: [],
    eventLog: [],
  };

  const apply = (outcome: StepResult): void => {
    state = {
      ...state,
      progress: outcome.progress,
      condition: outcome.condition,
      weather: outcome.weather,
      fleet: outcome.fleet,
    };
  };

  const stepNm = defaultStepNm(race) * STEP_SCALE;
  for (let i = 0; i < 6000; i += 1) {
    const outcome = stepRace(state, stepNm);
    apply(outcome);
    if (outcome.finished || outcome.retired) break;

    if (outcome.event) {
      const res = applyDecision(state, policy.pick(state, outcome.event));
      apply(res);
      if (res.retired) break;
    }
    // The wardrobe manages itself: `stepRace` runs the REAL auto-helm
    // (`autoSailTarget` + `resolveSailChange`) each tick from `strategy.sailMode`
    // above — no bespoke hoist here.
    // TODO(framework): the custom-boat benchmark asymmetry (a custom hull rates
    // off its effective, sail-lifted polar while a catalogue boat rates off its
    // base) is separate, deferred calibration work — not the dial's thresholds.
  }

  const p = state.progress!;
  const fleetSize = raceDivision(race, division).fleetSize;
  const pos = correctedPosition(
    (state.fleet ?? []) as Competitor[],
    race.distanceNm,
    p.elapsedHours,
    ratingTccFor(boat)
  );
  return pos / fleetSize;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const span = (xs: number[]): number => Math.max(...xs) - Math.min(...xs);

// --- The global dials: named, race-agnostic thresholds (never per race). -----
const PAR_BAND = [0.35, 0.65]; // par → mid-fleet (asserted in CORINTHIAN — it has headroom)
const GOOD_MAX = 0.34; // good → top third (asserted in PRO)
const RECKLESS_MIN = 0.66; // reckless → back third (PRO)
const RECKLESS_MARGIN = 0.12; // reckless worse than good by ≥ this fraction of fleet
const LUCK_BAND = 0.45; // (max−min) percentile across seeds for a FIXED policy

const BOATS = ['boat-sprite', 'boat-tempest'];
const SEEDS = [7, 19, 42, 101, 202];

// ---------------------------------------------------------------------------
// The gated heavy matrix — every race × 2 boats × 3 policies × 5 seeds, asserted
// on the MEDIAN percentile across seeds. Division split by PANEL DESIGN: PAR is
// asserted in the Corinthian club fleet (which carries headroom, so an honest
// par sail genuinely lands mid-fleet), while the GOOD/RECKLESS ladder is asserted
// in the tight Pro fleet (where skilled play is the price of the podium and
// reckless play is punished). Every breach is collected with a descriptive
// message so one run enumerates every broken cell.
// ---------------------------------------------------------------------------
const RUN = process.env.RUN_INVARIANT === '1';
(RUN ? describe : describe.skip)('difficulty invariant (full matrix — RUN_INVARIANT=1)', () => {
  it('every race stays fair for par, good and reckless play', () => {
    const failures: string[] = [];
    const r3 = (n: number): number => Number(n.toFixed(3));

    for (const race of RACES) {
      for (const boatId of BOATS) {
        const tag = `${race.id}/${boatId}`;

        const parSeeds = SEEDS.map((s) => runCell(race.id, boatId, 'corinthian', PAR, s));
        const goodSeeds = SEEDS.map((s) => runCell(race.id, boatId, 'pro', GOOD, s));
        const recklessSeeds = SEEDS.map((s) => runCell(race.id, boatId, 'pro', RECKLESS, s));

        const par = median(parSeeds);
        const good = median(goodSeeds);
        const reckless = median(recklessSeeds);

        // Par lands mid-fleet in the club division.
        if (par < PAR_BAND[0] || par > PAR_BAND[1]) {
          failures.push(
            `${tag}: par median ${r3(par)} outside PAR_BAND [${PAR_BAND[0]}, ${PAR_BAND[1]}] — ${
              par < PAR_BAND[0] ? 'too easy' : 'too hard'
            } for par play`
          );
        }
        // Good reaches the top third of the pro fleet.
        if (good > GOOD_MAX) {
          failures.push(`${tag}: good median ${r3(good)} > GOOD_MAX ${GOOD_MAX} — too hard for good play`);
        }
        // Reckless falls to the back third of the pro fleet.
        if (reckless < RECKLESS_MIN) {
          failures.push(
            `${tag}: reckless median ${r3(reckless)} < RECKLESS_MIN ${RECKLESS_MIN} — reckless play not punished`
          );
        }
        // Reckless is a clear margin behind good — mistakes genuinely cost.
        if (reckless < good + RECKLESS_MARGIN) {
          failures.push(
            `${tag}: reckless median ${r3(reckless)} < good ${r3(good)} + RECKLESS_MARGIN ${RECKLESS_MARGIN} — reckless not clearly worse than good`
          );
        }
        // The monotone ladder holds: good < par < reckless.
        if (!(good < par && par < reckless)) {
          failures.push(
            `${tag}: ladder broken — expected good ${r3(good)} < par ${r3(par)} < reckless ${r3(reckless)}`
          );
        }
        // No policy's outcome is at the mercy of the seed's luck.
        for (const [label, seeds] of [
          ['par', parSeeds],
          ['good', goodSeeds],
          ['reckless', recklessSeeds],
        ] as const) {
          const s = span(seeds);
          if (s > LUCK_BAND) {
            failures.push(
              `${tag}: ${label} seed span ${r3(s)} > LUCK_BAND ${LUCK_BAND} — outcome too luck-dependent`
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Always-on harness smoke test — ONE tiny cell (short inshore race, one boat,
// par, one seed). Proves the harness compiles and the tick loop runs in normal
// CI WITHOUT the 2h matrix cost and WITHOUT asserting the (currently red)
// contract: it only checks the returned percentile is a finite number in [0, 1].
// ---------------------------------------------------------------------------
describe('difficulty invariant harness', () => {
  it('runs one cell and returns a finite percentile in [0, 1]', () => {
    const pct = runCell('race-round-island', 'boat-sprite', 'corinthian', PAR_MANUAL, 7);
    expect(Number.isFinite(pct)).toBe(true);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(1);
  });
});
