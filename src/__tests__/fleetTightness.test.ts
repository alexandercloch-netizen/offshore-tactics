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
import { BoatCondition, GameState, TacticalChoice } from '../types';

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
}

// The benchmark must be computed on the SAME wind field the race is sailed on
// (as the real game does at beginRace) — caching it across seeds would pace the
// fleet to a different wind than the player faces. Cache by race+seed so the two
// policies for one seed share the (expensive) headless run.
const benchCache = new Map<string, number>();
function benchFor(raceId: string, seed: number): number {
  const key = `${raceId}:${seed}`;
  const cached = benchCache.get(key);
  if (cached !== undefined) return cached;
  setRng(mulberry32(seed));
  const race = getRaceById(raceId)!;
  const boat = getBoatById('boat-mistral')!;
  const b = fleetBenchmarkHours(race, createWindField(race), boat);
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
  effort: 'conserve' | 'cruise' | 'push' = 'push'
): SimResult {
  const bench = benchFor(raceId, seed);
  setRng(mulberry32(seed));
  const race = getRaceById(raceId)!;
  const boat = getBoatById('boat-mistral')!;
  const windField = createWindField(race);
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
    if (out.finished || out.retired) break;
  }
  return { maxDrop, finalPlace: state.progress!.position, fleetSize, decisions };
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
//  2. Reckless play (always the boldest call) FALLS OUT of contention — mistakes
//     genuinely cost the race, so it isn't a free-for-all.
//  3. No SINGLE decision swings more than a few places — the old "flew past for no
//     reason" jump (one call could leapfrog ~half the fleet) is gone.
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
      // 2. Reckless play falls to the back third, clearly worse than sensible.
      expect(recklessFinal).toBeGreaterThanOrEqual(fleetSize * 0.6);
      expect(recklessFinal).toBeGreaterThan(sensibleFinal + fleetSize * 0.2);
      // 3. No single decision leapfrogs more than ~a quarter of the fleet.
      expect(worstSwing).toBeLessThanOrEqual(fleetSize * 0.3);
    });
  });
});
