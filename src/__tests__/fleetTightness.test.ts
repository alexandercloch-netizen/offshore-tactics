import { createWindField } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import {
  DEFAULT_STRATEGY,
  applyDecision,
  defaultStepNm,
  fleetBenchmarkHours,
  initialProgress,
  raceDivision,
  stepRace,
} from '../engine/gameEngine';
import { getRaceById, getBoatById } from '../data';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { BoatCondition, Competitor, GameState, TacticalChoice, WeatherScenario } from '../types';
import { DRIFTER_SCENARIO, GALE_SCENARIO } from './fixtures/weatherScenarios';

afterEach(() => resetRng());

const healthy: BoatCondition = { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 };

type Policy = 'sensible' | 'reckless';
// Sensible play takes the lowest-risk option each time; reckless always sends the
// boldest (highest-risk) call — the two ends of how a player engages.
function pick(choices: TacticalChoice[], policy: Policy): TacticalChoice {
  const byRisk = [...choices].sort((a, b) => a.risk - b.risk);
  return policy === 'sensible' ? byRisk[0] : byRisk[byRisk.length - 1];
}

interface SimResult {
  maxDrop: number; // worst places lost on a single decision
  finalPlace: number;
  fleetSize: number;
  decisions: number;
  finished: boolean;
  retired: boolean;
  elapsedHours: number;
  benchHours: number;
  fleet: Competitor[];
}

// The benchmark must be computed on the SAME wind field the race is sailed on
// (as the real game does at beginRace) — caching it across seeds would pace the
// fleet to a different wind than the player faces. Cache by race+seed+scenario
// so the two policies for one seed share the (expensive) headless run.
//
// Left on the bare club-average benchmark (no crew arg): this test deliberately
// pits a kitted, pushing player against the fleet's baseline anchor, and its
// tuned place/gap thresholds are calibrated to that. The faithful per-crew
// benchmark (crew threading in `fleetBenchmarkHours`) is exercised by
// `windScenario.test.ts`; wiring it in here re-paces these thresholds and is a
// coordinated re-tune for a later change.
const benchCache = new Map<string, number>();
function benchFor(raceId: string, seed: number, scenario?: WeatherScenario): number {
  const key = `${raceId}:${seed}:${scenario?.label ?? 'seasonal'}`;
  const cached = benchCache.get(key);
  if (cached !== undefined) return cached;
  setRng(mulberry32(seed));
  const race = getRaceById(raceId)!;
  const boat = getBoatById('boat-mistral')!;
  const b = fleetBenchmarkHours(race, createWindField(race, scenario), boat);
  benchCache.set(key, b);
  return b;
}

// A representative competitive loadout: a capable pro crew and pushing hard — how
// a player who has kitted out actually races. (Empty crew + cruise is the bare
// benchmark the fleet is centred to beat, so it isn't representative.)
const GOOD_CREW = ['crew-vega', 'crew-lindqvist', 'crew-okafor', 'crew-mercer', 'crew-tan'];

function simRace(
  raceId: string,
  division: 'corinthian' | 'pro',
  seed: number,
  policy: Policy,
  crewIds: string[] = GOOD_CREW,
  effort: 'conserve' | 'cruise' | 'push' = 'push',
  scenario?: WeatherScenario
): SimResult {
  const bench = benchFor(raceId, seed, scenario);
  setRng(mulberry32(seed));
  const race = getRaceById(raceId)!;
  const boat = getBoatById('boat-mistral')!;
  const windField = createWindField(race, scenario);
  const fleetSize = raceDivision(race, division).fleetSize;
  let state = {
    funds: 0,
    selectedRaceId: raceId,
    selectedDivision: division,
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: crewIds,
    provisions: [],
    strategy: { ...DEFAULT_STRATEGY, effort },
    profile: { fleet: [] },
    condition: healthy,
    windField,
    fleet: createFleet(race, raceDivision(race, division), bench, boat),
    progress: initialProgress(race, boat, division, windField),
    history: [],
    eventLog: [],
  } as unknown as GameState;

  // A touch coarser than gameplay — keeps the place/pace dynamics (decisions fire
  // on distance) while keeping the headless sim quick enough for CI.
  const step = Math.max(race.distanceNm * 0.015, 1);
  let maxDrop = 0;
  let decisions = 0;
  let finished = false;
  let retired = false;
  for (let i = 0; i < 8000; i += 1) {
    const out = stepRace(state, step);
    state = { ...state, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
    if (out.event) {
      const before = out.progress.position;
      const choice = pick(out.event.choices, policy);
      const res = applyDecision(state, choice);
      state = { ...state, progress: res.progress, condition: res.condition, fleet: res.fleet };
      decisions += 1;
      maxDrop = Math.max(maxDrop, res.progress.position - before);
    }
    if (out.finished || out.retired) {
      finished = out.finished;
      retired = out.retired;
      break;
    }
  }
  return {
    maxDrop,
    finalPlace: state.progress!.position,
    fleetSize,
    decisions,
    finished,
    retired,
    elapsedHours: state.progress!.elapsedHours,
    benchHours: bench,
    fleet: state.fleet ?? [],
  };
}

function average(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// The Pro fleet is the tightest pack — the worst case for place swings. We check a
// long lake race and an offshore race so the result isn't course-specific.
const RACES = ['race-chicago-mac', 'race-fastnet'];
const SEEDS = [11, 42];

// The contract this locks in (see the prompt that motivated it):
//  1. A kitted-out player sailing sensibly stays IN CONTENTION (top half).
//  2. Reckless play (always the boldest call) falls out of contention and lands
//     a clear margin behind sensible play — mistakes genuinely cost the race, so
//     it isn't a free-for-all. (With signed decision rewards a well-backed bold
//     call now GAINS time, so a sharp crew's gambles no longer land dead last
//     every course; the robust guard is the *gap* to sensible play, which holds.)
//  3. No SINGLE decision swings more than a few places — the old "flew past for no
//     reason" jump (one call could leapfrog ~half the fleet) is gone. This is the
//     anti-teleport guard, and it holds tightly even now that reads can pay off.
describe('fleet racing stays tight unless the player sails badly', () => {
  RACES.forEach((raceId) => {
    it(`${raceId}: sensible play contends, reckless drops, swings stay bounded`, () => {
      const sensible = SEEDS.map((s) => simRace(raceId, 'pro', s, 'sensible'));
      const reckless = SEEDS.map((s) => simRace(raceId, 'pro', s, 'reckless'));
      const fleetSize = sensible[0].fleetSize;
      expect(sensible[0].decisions).toBeGreaterThan(3); // the run actually exercised decisions

      const sensibleFinal = average(sensible.map((r) => r.finalPlace));
      const recklessFinal = average(reckless.map((r) => r.finalPlace));
      const worstSwing = Math.max(...[...sensible, ...reckless].map((r) => r.maxDrop));

      // 1. Sensible, kitted-out play stays in the top half of the fleet.
      expect(sensibleFinal).toBeLessThanOrEqual(fleetSize * 0.5);
      // 2. Reckless play drops out of the top of the fleet AND lands a clear
      //    margin behind sensible play. The margin is the robust "mistakes cost"
      //    guard; the absolute floor carries headroom because a sharp crew's
      //    well-backed bold calls now pay off (the signed-reward economy).
      expect(recklessFinal).toBeGreaterThan(sensibleFinal + fleetSize * 0.2);
      expect(recklessFinal).toBeGreaterThanOrEqual(fleetSize * 0.45);
      // 3. No single decision leapfrogs more than ~a quarter of the fleet.
      expect(worstSwing).toBeLessThanOrEqual(fleetSize * 0.3);
    });
  });
});

// Scenario extremes through the PR1 seam: whether the passage is a sustained
// gale or a glassy drifter, the fleet is re-benchmarked through the SAME field
// the player sails (as beginRace/reseedWeather do), so its pacing anchors must
// hold — quick through the blow, patient through the calm, never a runaway and
// never a parked fleet. Honest attrition is deliberately NOT capped (a gale
// wears crew and hull, and a worn boat is slow — that's the game); what may not
// break is the pacing: every AI boat lands near its benchmark-derived target
// and the pack stays together on the course.
describe('fleet pacing holds through scenario extremes', () => {
  const CASES = [
    { name: 'gale (sustained 34+ kn)', scenario: GALE_SCENARIO },
    { name: 'drifter (under 6 kn)', scenario: DRIFTER_SCENARIO },
  ] as const;

  CASES.forEach(({ name, scenario }) => {
    SEEDS.forEach((seed) => {
      it(`race-fastnet ${name} seed ${seed}: the pacing anchors hold`, () => {
        const r = simRace('race-fastnet', 'pro', seed, 'sensible', GOOD_CREW, 'push', scenario);

        // The race ran end to end through the scenario field and exercised the
        // decision loop on the way — no stall, no runaway loop.
        expect(r.finished || r.retired).toBe(true);
        expect(r.decisions).toBeGreaterThan(0);

        // THE anchor: every AI boat that crossed did so near its
        // benchmark-derived target — the fleet is paced to the same weather in
        // a blow and in a calm alike, so difficulty self-calibrates.
        for (const c of r.fleet) {
          if (c.finishedHours !== null) {
            expect(c.finishedHours).toBeGreaterThan(c.targetHours * 0.8);
            expect(c.finishedHours).toBeLessThan(c.targetHours * 1.3);
          }
        }
        // The fleet survives the weather as a fleet — attrition is honest, not
        // a wipe-out.
        const retiredCount = r.fleet.filter((c) => c.retired).length;
        expect(retiredCount).toBeLessThan(r.fleetSize * 0.2);

        if (r.finished) {
          // The player's lived finish stays in the benchmark's orbit: never
          // faster than half the clean-run anchor (no teleporting), and even a
          // gale-battered boat lands within ~3x of it (wear bites, honestly).
          expect(r.elapsedHours).toBeGreaterThan(r.benchHours * 0.5);
          expect(r.elapsedHours).toBeLessThan(r.benchHours * 3.2);
          // And the pack is on the course with the player, not parked at the
          // start or long gone over the horizon: when the player crosses, the
          // still-racing boats are well down the track.
          const racing = r.fleet.filter((c) => !c.retired && c.finishedHours === null);
          if (racing.length > 0) {
            const race = getRaceById('race-fastnet')!;
            const wellAlong = racing.filter((c) => c.distanceNm > race.distanceNm * 0.5).length;
            expect(wellAlong / Math.max(racing.length, 1)).toBeGreaterThan(0.6);
          }
        }

        // Competitive check where the weather allows a fair fight: in the
        // drifter a sharp, pushing crew beats a fleet paced to a cruise anchor
        // (in the gale attrition may cost the player the pack — allowed).
        if (name.startsWith('drifter') && r.finished) {
          expect(r.finalPlace).toBeLessThanOrEqual(Math.ceil(r.fleetSize * 0.5));
        }
      });
    });
  });
});
