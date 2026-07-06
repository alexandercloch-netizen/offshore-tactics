import {
  DEFAULT_STRATEGY,
  applyDecision,
  defaultStepNm,
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
import { DivisionKey, GameState, StepResult, WindField } from '../types';

// ---------------------------------------------------------------------------
// The golden races: three seeded, headless playthroughs of the REAL race loop
// (the same `stepRace(state, defaultStepNm(race))` the live tick calls, with
// every decision auto-resolved to `choices[0]`), pinned to exact outcomes AND
// to the exact number of RNG draws consumed. These pins are the determinism
// contract for the cockpit work: any engine change that moves a number here has
// changed the shipped game's stream or physics — fix the change, never re-bless
// the pins.
// ---------------------------------------------------------------------------

afterEach(() => resetRng());

interface GoldenSummary {
  ticks: number;
  decisions: number;
  rngDraws: number;
  finished: boolean;
  retired: boolean;
  elapsedH: number;
  distanceNm: number;
  position: number;
  correctedPos: number;
  hull: number;
  stamina: number;
  eventIds: string[];
  fleetTop3: string[];
}

const round6 = (n: number): number => Number(n.toFixed(6));

interface GoldenConfig {
  raceId: string;
  boatId: string;
  division: DivisionKey;
  seed: number;
  // Optional field override (the gale config sails a synthetic blow); default
  // is the shipped seasonal field, seeded by the same stream.
  field?: (race: NonNullable<ReturnType<typeof getRaceById>>) => WindField;
}

function runGolden(cfg: GoldenConfig): GoldenSummary {
  let rngDraws = 0;
  const base = mulberry32(cfg.seed);
  setRng(() => {
    rngDraws += 1;
    return base();
  });

  const race = getRaceById(cfg.raceId)!;
  const boat = getBoatById(cfg.boatId)!;
  const crewIds = ['crew-vega', 'crew-lindqvist', 'crew-hassan', 'crew-mensah'];
  const crew = crewIds.map((id) => getCrewById(id)!);
  const provisions = [
    { provisionId: 'prov-galley', quantity: 6 },
    { provisionId: 'prov-water', quantity: 6 },
    { provisionId: 'prov-spares', quantity: 1 },
    { provisionId: 'prov-safety', quantity: 1 },
  ];

  // Mirror GameContext.beginRace exactly: field → tide → weather → fleet
  // (benchmarked off the player's boat) → initial progress.
  const windField = cfg.field ? cfg.field(race) : createWindField(race);
  const tidalField = createTidalField(race);
  const start = race.waypoints[0];
  const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
  const fleet = createFleet(
    race,
    raceDivision(race, cfg.division),
    fleetBenchmarkHours(race, windField, boat),
    boat
  );

  let state: GameState = {
    funds: 250000,
    selectedRaceId: race.id,
    selectedDivision: cfg.division,
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: crewIds,
    provisions,
    strategy: DEFAULT_STRATEGY,
    profile: { fleet: [] },
    condition: initialCondition(crew, provisions, race),
    weather,
    windField,
    tidalField,
    fleet,
    progress: initialProgress(race, boat, cfg.division, windField),
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

  let ticks = 0;
  let decisions = 0;
  let finished = false;
  let retired = false;
  const eventIds: string[] = [];
  const stepNm = defaultStepNm(race);
  for (let i = 0; i < 6000; i += 1) {
    const outcome = stepRace(state, stepNm);
    ticks += 1;
    apply(outcome);
    if (outcome.finished || outcome.retired) {
      finished = outcome.finished;
      retired = outcome.retired;
      break;
    }
    if (outcome.event) {
      // The live loop holds the sim and resolves via `decide` on the updated
      // state — auto-take the first choice, exactly as the e2e does.
      decisions += 1;
      eventIds.push(outcome.event.id);
      const res = applyDecision(state, outcome.event.choices[0]);
      apply(res);
      if (res.retired) {
        retired = true;
        break;
      }
    }
  }

  const p = state.progress!;
  const fleetTop3 = [...(state.fleet ?? [])]
    .sort((a, b) => b.distanceNm - a.distanceNm)
    .slice(0, 3)
    .map((c) => c.name);
  return {
    ticks,
    decisions,
    rngDraws,
    finished,
    retired,
    elapsedH: round6(p.elapsedHours),
    distanceNm: round6(p.distanceCoveredNm),
    position: p.position,
    correctedPos: correctedPosition(
      state.fleet ?? [],
      race.distanceNm,
      p.elapsedHours,
      ratingTccFor(boat)
    ),
    hull: round6(state.condition.hullIntegrity),
    stamina: round6(state.condition.crewStamina),
    eventIds,
    fleetTop3,
  };
}

// A synthetic, fully deterministic gale over the course: a hard sou'wester with
// a slow veer and a pressure gradient — no seeded features, so every draw in
// this config comes from the race loop itself.
function galeField(race: NonNullable<ReturnType<typeof getRaceById>>): WindField {
  const mid = race.waypoints[Math.floor(race.waypoints.length / 2)];
  return {
    baseDir: race.prevailingWind.fromDeg,
    baseSpeed: 34,
    shiftAmpDeg: 8,
    shiftPeriodH: 5,
    shiftPhase: 1.2,
    rotateDegPerH: 1.5,
    gradientAxisDeg: 90,
    gradientPerNm: 0.015,
    refLat: mid.lat,
    refLon: mid.lon,
    feature: { lat: mid.lat, lon: mid.lon, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

describe('golden races — the determinism contract', () => {
  it('short inshore: Round the Island, Sea Sprite, Corinthian (seed 101)', () => {
    expect(runGolden({ raceId: 'race-round-island', boatId: 'boat-sprite', division: 'corinthian', seed: 101 })).toEqual(
      GOLDEN_INSHORE
    );
  });

  it('offshore with current: Fastnet, Tempest, Pro (seed 202)', () => {
    expect(runGolden({ raceId: 'race-fastnet', boatId: 'boat-tempest', division: 'pro', seed: 202 })).toEqual(
      GOLDEN_OFFSHORE
    );
  });

  it('gale: Sydney–Hobart in a synthetic blow, Meridian, Corinthian (seed 303)', () => {
    expect(
      runGolden({
        raceId: 'race-sydney-hobart',
        boatId: 'boat-meridian',
        division: 'corinthian',
        seed: 303,
        field: galeField,
      })
    ).toEqual(GOLDEN_GALE);
  });
});

// ---------------------------------------------------------------------------
// The pins. Captured from the untouched engine — byte-exact, including the RNG
// draw count (stream neutrality is the real invariant, not output tolerance).
// ---------------------------------------------------------------------------

const GOLDEN_INSHORE: GoldenSummary = {
  ticks: 112,
  decisions: 10,
  rngDraws: 9290,
  finished: true,
  retired: false,
  elapsedH: 37.847401,
  distanceNm: 60.228444,
  position: 30,
  correctedPos: 30,
  hull: 70.329051,
  stamina: 0.218898,
  eventIds: [
    'evt-seabreeze',
    'evt-injury',
    'evt-hz-tidal',
    'evt-fo-hand',
    'evt-kelpline',
    'evt-tss',
    'evt-squall',
    'evt-spinnaker',
    'evt-front',
    'evt-rally',
  ],
  fleetTop3: ['Rán', 'Comanche', 'Leopard'],
};

const GOLDEN_OFFSHORE: GoldenSummary = {
  ticks: 99,
  decisions: 9,
  rngDraws: 10902,
  finished: true,
  retired: false,
  elapsedH: 138.063644,
  distanceNm: 688.221188,
  position: 35,
  correctedPos: 35,
  hull: 66.830787,
  stamina: 25.083871,
  eventIds: [
    'evt-headland',
    'evt-fatigue',
    'evt-fo-watch',
    'evt-hz-celtic',
    'evt-squall',
    'evt-kelp',
    'evt-tss',
    'evt-morale-meal',
    'evt-nightwatch',
  ],
  fleetTop3: ['Rán', 'Comanche', 'Leopard'],
};

const GOLDEN_GALE: GoldenSummary = {
  ticks: 100,
  decisions: 8,
  rngDraws: 4663,
  finished: true,
  retired: false,
  elapsedH: 77.603082,
  distanceNm: 627.070448,
  position: 16,
  correctedPos: 16,
  hull: 69.261013,
  stamina: 10.996943,
  eventIds: [
    'evt-kelp',
    'evt-injury',
    'evt-mob',
    'evt-fo-hand',
    'evt-hz-bass',
    'evt-front',
    'evt-nightwatch',
    'evt-fo-watch',
  ],
  fleetTop3: ['Rán', 'Comanche', 'Leopard'],
};
