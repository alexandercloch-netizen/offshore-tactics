import {
  DEFAULT_STRATEGY,
  applyDecision,
  availableWardrobe,
  cleanRunHours,
  defaultStepNm,
  fleetBenchmarkHours,
  flownSpecialist,
  initialProgress,
  raceDivision,
  recommendedSail,
  resolveBoatById,
  resolveSailChange,
  sailReadout,
  stepRace,
} from '../engine/gameEngine';
import { bestWardrobeMul, effectivePolar, flownSailMul, raceWardrobe } from '../engine/sails';
import { getSailById, isWorkingSail, SAILS, WORKING_SAILS } from '../data/sails';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getBoatById, getRaceById } from '../data';
import { getClassOption } from '../data/polarLibrary';
import { FleetBoat, GameState, StepResult, TacticalChoice, WindField } from '../types';

afterEach(() => resetRng());

// Mirrors decisions.test.ts: a race-ready state with a seeded field and route.
function baseState(overrides: Partial<GameState> = {}): GameState {
  const raceId = overrides.selectedRaceId ?? 'race-round-island';
  const division = overrides.selectedDivision ?? 'corinthian';
  const race = getRaceById(raceId)!;
  const boat = getBoatById(overrides.selectedBoatId ?? 'boat-corsair')!;
  const windField = overrides.windField ?? createWindField(race);
  const start = race.waypoints[0];
  const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
  return {
    funds: 250000,
    selectedRaceId: raceId,
    selectedDivision: division,
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: ['crew-vega', 'crew-lindqvist', 'crew-hassan'],
    provisions: [{ provisionId: 'prov-water', quantity: 2 }],
    condition: { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 },
    weather,
    windField,
    fleet: [],
    strategy: DEFAULT_STRATEGY,
    profile: { fleet: [] },
    progress: initialProgress(race, boat, division, windField),
    history: [],
    eventLog: [],
    ...overrides,
  };
}

// A steady field at a chosen strength — no shifts, no features, nothing to draw.
function steadyField(refLat: number, refLon: number, speedKn: number, fromDeg = 200): WindField {
  return {
    baseDir: fromDeg,
    baseSpeed: speedKn,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 0,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat,
    refLon,
    feature: { lat: refLat, lon: refLon, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

const START = getRaceById('race-round-island')!.waypoints[0];
const codeZero = getSailById('code-zero')!;
const jibTop = getSailById('jib-top')!;

// Wrap the current rng in a draw counter (the stream-neutrality probe).
function countingRng(seed: number): { draws: () => number } {
  let n = 0;
  const base = mulberry32(seed);
  setRng(() => {
    n += 1;
    return base();
  });
  return { draws: () => n };
}

describe('flownSailMul — the wrong sail bites', () => {
  it('the working set is exactly 1.0, everywhere', () => {
    for (const s of WORKING_SAILS) {
      expect(flownSailMul(s, 45, 6)).toBe(1);
      expect(flownSailMul(s, 170, 38)).toBe(1);
    }
    expect(flownSailMul(undefined, 90, 12)).toBe(1);
  });

  it('a matched specialist earns its full boost inside the envelope', () => {
    // Code 0: 55–110° twa, 4–13 kn.
    expect(flownSailMul(codeZero, 80, 9)).toBeCloseTo(1 + codeZero.boost, 9);
  });

  it('a grossly mismatched specialist pulls BELOW base', () => {
    // Code 0 dead-run in 30 knots: coverage 0 → the full out-of-box penalty.
    const mul = flownSailMul(codeZero, 175, 30);
    expect(mul).toBeLessThan(1);
    expect(mul).toBeCloseTo(0.88, 9);
    // Near the envelope edge the taper stays gentle — roughly base, never a cliff.
    expect(flownSailMul(codeZero, 115, 12)).toBeGreaterThan(0.97);
  });

  it('bestWardrobeMul never drops below the working floor of 1', () => {
    expect(bestWardrobeMul([codeZero], 175, 35)).toBe(1);
    expect(bestWardrobeMul([...WORKING_SAILS, codeZero], 80, 9)).toBeCloseTo(1 + codeZero.boost, 9);
  });
});

describe('wardrobes', () => {
  it('every catalogue boat carries the working set plus its free class specialists', () => {
    const corsair = getBoatById('boat-corsair')!;
    const wardrobe = raceWardrobe(corsair);
    expect(wardrobe.slice(0, WORKING_SAILS.length).map((s) => s.id)).toEqual(
      WORKING_SAILS.map((s) => s.id)
    );
    expect(wardrobe.some((s) => s.id === 'code-zero')).toBe(true);
    // Free: no purchase state consulted, no economy touched.
    expect(corsair.boatType).toBeDefined();
  });

  it('a custom boat races its purchased sails, not a free class set', () => {
    const opt = getClassOption('tp52')!;
    const custom: FleetBoat = {
      id: 'c1',
      name: 'Custom',
      className: 'TP52',
      description: '',
      baseSpeed: opt.baseSpeed,
      upwind: opt.upwind,
      downwind: opt.downwind,
      stability: opt.stability,
      crewCapacity: 12,
      price: opt.price,
      custom: true,
      boatType: 'tp52',
      polar: opt.polar,
      speedAdjustment: { upwindPct: 100, downwindPct: 100, nightPct: 100 },
      sails: ['code-zero'],
    };
    const ids = raceWardrobe(custom).map((s) => s.id);
    expect(ids).toEqual([...WORKING_SAILS.map((s) => s.id), 'code-zero']);
  });
});

describe('stream neutrality — a zero-change race is byte-identical', () => {
  it('a no-op change (same sail / unknown / blown) draws NOTHING', () => {
    // Build the states first (setup legitimately draws), then start counting.
    const s = baseState();
    const blownState = baseState();
    blownState.progress = { ...blownState.progress!, unavailableSails: ['code-zero'] };
    const counter = countingRng(1);
    expect(resolveSailChange(s, 'working-jib')).toBeNull(); // already on working sails
    expect(resolveSailChange(s, 'no-such-sail')).toBeNull();
    expect(resolveSailChange(blownState, 'code-zero')).toBeNull();
    expect(counter.draws()).toBe(0);
  });

  it('a committed distinct change draws exactly two seeded rolls', () => {
    const s = baseState();
    const counter = countingRng(2);
    const out = resolveSailChange(s, 'code-zero');
    expect(out).not.toBeNull();
    expect(counter.draws()).toBe(2);
  });

  it('the default flown sail leaves stepRace speed untouched (working set = base polar)', () => {
    const race = getRaceById('race-round-island')!;
    const field = steadyField(START.lat, START.lon, 12);
    const s = baseState({ windField: field });
    s.progress = { ...s.progress!, nextDecisionAtNm: Number.POSITIVE_INFINITY };
    // No fleet, no decisions → stepRace draws nothing; identical states advance
    // identically whether or not the sail fields are present at all.
    const bare = stepRace(s, defaultStepNm(race));
    const withFields = stepRace(
      { ...s, progress: { ...s.progress!, sailChanges: 0, sailFracTotal: 0, sailFracRight: 0 } },
      defaultStepNm(race)
    );
    expect(withFields.progress.elapsedHours).toBe(bare.progress.elapsedHours);
    expect(withFields.progress.distanceCoveredNm).toBe(bare.progress.distanceCoveredNm);
  });
});

describe('matched vs mismatched sail — a measurable finish delta', () => {
  // Sail a fixed number of ticks under a sail policy and compare elapsed time.
  // 'best' re-flags the best canvas for the LIVE angle each tick (free — this
  // measures the speed spine, not the manoeuvre cost, which has its own tests).
  function elapsedAfter(ticks: number, policy: 'working' | 'best' | 'wrong'): number {
    const race = getRaceById('race-round-island')!;
    const field = steadyField(START.lat, START.lon, 9); // light air, Code 0 country
    let s = baseState({ windField: field });
    s.progress = { ...s.progress!, nextDecisionAtNm: Number.POSITIVE_INFINITY };
    const boat = getBoatById('boat-corsair')!;
    const specialists = raceWardrobe(boat).filter((x) => x.boost > 0);
    for (let i = 0; i < ticks; i += 1) {
      if (policy === 'wrong') {
        s.progress = { ...s.progress!, activeSailId: 'heavy-spinnaker' }; // a 17–32 kn sail in 9 kn
      } else if (policy === 'best') {
        const p = s.progress!;
        let best: string | undefined;
        let bestMul = 1;
        for (const sail of specialists) {
          const mul = flownSailMul(sail, p.heading - p.windDir, p.windSpeedKn);
          if (mul > bestMul) {
            bestMul = mul;
            best = sail.id;
          }
        }
        s.progress = { ...p, activeSailId: best };
      }
      const out: StepResult = stepRace(s, defaultStepNm(race));
      s = { ...s, progress: out.progress, condition: out.condition, weather: out.weather };
      if (out.finished || out.retired) break;
    }
    return s.progress!.elapsedHours;
  }

  it('the right specialist is faster than working sails; the wrong one is slower', () => {
    const working = elapsedAfter(40, 'working');
    const matched = elapsedAfter(40, 'best');
    const mismatched = elapsedAfter(40, 'wrong');
    expect(matched).toBeLessThan(working);
    expect(mismatched).toBeGreaterThan(working);
    // The gaps are measurable but survivable — places, not the race.
    expect(mismatched / working).toBeLessThan(1.2);
  });
});

describe('resolveSailChange — the manoeuvre', () => {
  it('a clean change costs its category time and swaps the flown sail', () => {
    setRng(() => 0.999); // no bungle (second draw unused but still consumed)
    const s = baseState();
    const out = resolveSailChange(s, 'code-zero')!;
    expect(out.progress.activeSailId).toBe('code-zero');
    expect(out.progress.sailChanges).toBe(1);
    expect(out.progress.sailChangesFumbled).toBe(0);
    expect(out.progress.elapsedHours - s.progress!.elapsedHours).toBeCloseTo(0.05, 6); // reacher
    expect(out.resolution!.bungled).toBe(false);
    expect(out.log).toContain('Peeled to the Code 0');
    // No distance sailed; the boat holds its track.
    expect(out.progress.distanceCoveredNm).toBe(s.progress!.distanceCoveredNm);
  });

  it('the seeded bungle branch is exact at a pinned roll, and a fumble still counts', () => {
    const s = baseState();
    setRng(() => 0); // force the bungle (and the blow-out roll, moot in light air)
    const out = resolveSailChange(s, 'code-zero')!;
    expect(out.resolution!.bungled).toBe(true);
    expect(out.progress.sailChanges).toBe(1);
    expect(out.progress.sailChangesFumbled).toBe(1);
    expect(out.progress.activeSailId).toBe('code-zero'); // fumbled, not destroyed
    expect(out.progress.elapsedHours - s.progress!.elapsedHours).toBeGreaterThan(0.05);
    expect(out.log).toContain('fumbled');
    // Replays identically at the same rolls.
    setRng(() => 0);
    const again = resolveSailChange(s, 'code-zero')!;
    expect(again.progress.elapsedHours).toBe(out.progress.elapsedHours);
  });

  it('a strong Trimmer shortens the fumble recovery', () => {
    setRng(mulberry32(12));
    const field = createWindField(getRaceById('race-round-island')!);
    const strong = baseState({ windField: field, selectedCrewIds: ['crew-vega', 'crew-hassan'] }); // Trimmer 88
    const weak = baseState({ windField: field, selectedCrewIds: ['crew-vega', 'crew-adeyemi'] }); // Trimmer 50
    setRng(() => 0); // force the fumble on both — only the recovery differs
    const a = resolveSailChange(strong, 'code-zero')!;
    setRng(() => 0);
    const b = resolveSailChange(weak, 'code-zero')!;
    const lostA = a.progress.elapsedHours - strong.progress!.elapsedHours;
    const lostB = b.progress.elapsedHours - weak.progress!.elapsedHours;
    expect(lostA).toBeLessThan(lostB);
    expect(lostA).toBeGreaterThan(0); // relief, not immunity
  });
});

describe('blown sails — heavy air punishes a fumbled hoist', () => {
  function heavyState(): GameState {
    const field = steadyField(START.lat, START.lon, 30);
    const s = baseState({ selectedBoatId: 'boat-tempest', windField: field });
    return s;
  }

  it('a bungled specialist hoist in heavy air can destroy the sail for the race', () => {
    const s = heavyState();
    expect(s.progress!.windSpeedKn).toBeGreaterThanOrEqual(25);
    setRng(() => 0); // bungle roll 0, blow-out roll 0 → blown
    const out = resolveSailChange(s, jibTop.id)!;
    expect(out.progress.unavailableSails).toEqual([jibTop.id]);
    expect(out.progress.activeSailId).toBeUndefined(); // back on working sails, never bare-headed
    expect(out.log).toContain('blew out');
    // The blown sail is out of the wardrobe: re-selecting it is a silent no-op.
    const after = { ...s, progress: out.progress };
    expect(resolveSailChange(after, jibTop.id)).toBeNull();
    expect(availableWardrobe(after).some((x) => x.id === jibTop.id)).toBe(false);
  });

  it('the blow-out is a separate seeded roll — a fumble alone does not destroy', () => {
    const s = heavyState();
    const rolls = [0, 0.9]; // bungle, but the sail survives
    let i = 0;
    setRng(() => rolls[Math.min(i++, rolls.length - 1)]);
    const out = resolveSailChange(s, jibTop.id)!;
    expect(out.resolution!.bungled).toBe(true);
    expect(out.progress.unavailableSails).toBeUndefined();
    expect(out.progress.activeSailId).toBe(jibTop.id);
  });

  it('working sails can never blow out', () => {
    const s = heavyState();
    s.progress = { ...s.progress!, activeSailId: jibTop.id };
    setRng(() => 0); // worst rolls
    const out = resolveSailChange(s, 'working-jib')!;
    expect(out.progress.activeSailId).toBeUndefined();
    expect(out.progress.unavailableSails).toBeUndefined();
    expect(isWorkingSail(out.progress.activeSailId)).toBe(true);
  });
});

describe('one activeSailId — events and the picker never diverge', () => {
  const kiteChoice: TacticalChoice = {
    id: 'k',
    label: 'Send up the kite',
    description: '',
    timeDelta: 0,
    staminaDelta: 0,
    moraleDelta: 0,
    hullDelta: 0,
    risk: 0,
    setsSail: 'light-spinnaker',
    sets: 'big-kite',
  };

  it('an event choice writes the same field the picker does', () => {
    setRng(() => 0.999);
    const viaEvent = applyDecision(baseState(), kiteChoice);
    setRng(() => 0.999);
    const viaPicker = resolveSailChange(baseState(), 'light-spinnaker')!;
    expect(viaEvent.progress.activeSailId).toBe('light-spinnaker');
    expect(viaPicker.progress.activeSailId).toBe('light-spinnaker');
    expect(viaEvent.progress.activeSailId).toBe(viaPicker.progress.activeSailId);
    // Both count as a committed change.
    expect(viaEvent.progress.sailChanges).toBe(1);
    expect(viaPicker.progress.sailChanges).toBe(1);
  });

  it('an event sail the boat does not carry is ignored', () => {
    setRng(() => 0.999);
    const out = applyDecision(baseState(), { ...kiteChoice, setsSail: 'not-a-sail' });
    expect(out.progress.activeSailId).toBeUndefined();
    expect(out.progress.sailChanges).toBeUndefined();
  });

  it('a manual change that contradicts a pending situation clears it', () => {
    setRng(() => 0.999);
    const afterKite = applyDecision(baseState(), kiteChoice);
    expect(afterKite.progress.pendingSituation?.key).toBe('big-kite');
    const s = { ...baseState(), progress: afterKite.progress };
    setRng(() => 0.999);
    // Dousing to working sails contradicts the big-kite story: cleared.
    const doused = resolveSailChange(s, 'working-jib')!;
    expect(doused.progress.pendingSituation).toBeUndefined();
    // A kite-family change keeps it alive.
    setRng(() => 0.999);
    const repeel = resolveSailChange(s, 'code-zero')!;
    expect(repeel.progress.pendingSituation?.key).toBe('big-kite');
  });
});

describe('sailReadout & recommendation', () => {
  it('reads the working set by default and the flown specialist after a change', () => {
    const s = baseState();
    const before = sailReadout(s)!;
    expect(before.isWorking).toBe(true);
    expect(before.coverage).toBe(1);
    expect(before.changes).toBe(0);
    setRng(() => 0.999);
    const out = resolveSailChange(s, 'code-zero')!;
    const after = sailReadout({ ...s, progress: out.progress })!;
    expect(after.isWorking).toBe(false);
    expect(after.name).toBe('Code 0');
    expect(after.changes).toBe(1);
    expect(flownSpecialist(out.progress)?.id).toBe('code-zero');
  });

  it('recommends only sails the boat still carries', () => {
    const s = baseState({ windField: steadyField(START.lat, START.lon, 9) });
    const rec = recommendedSail(s);
    if (rec) {
      expect(availableWardrobe(s).some((x) => x.id === rec.id)).toBe(true);
      expect(SAILS.some((x) => x.id === rec.id)).toBe(true);
    }
  });
});

describe('fleet fairness — the benchmark and perfect-play parity', () => {
  it('the benchmark still sails the RIGGED polar for a sailed custom boat (no silent base-boat drop)', () => {
    const race = getRaceById('race-round-island')!;
    setRng(mulberry32(21));
    const field = createWindField(race);
    const opt = getClassOption('tp52')!;
    const custom: FleetBoat = {
      id: 'c-bench',
      name: 'Bench',
      className: 'TP52',
      description: '',
      baseSpeed: opt.baseSpeed,
      upwind: opt.upwind,
      downwind: opt.downwind,
      stability: opt.stability,
      crewCapacity: 12,
      price: opt.price,
      custom: true,
      boatType: 'tp52',
      polar: opt.polar,
      speedAdjustment: { upwindPct: 100, downwindPct: 100, nightPct: 100 },
      sails: ['code-zero', 'light-spinnaker'],
    };
    const state = { profile: { fleet: [custom] }, ownedBoatIds: [] } as unknown as GameState;
    const rigged = resolveBoatById(state, 'c-bench') as FleetBoat;
    // resolveBoatById hands the benchmark the wardrobe-lifted polar…
    expect(rigged.polar).not.toBe(custom.polar);
    expect(rigged.polar).toEqual(effectivePolar(custom.polar, custom.sails));
    // …and fleetBenchmarkHours is exactly a clean run of that rigged boat — no
    // hidden budget, byte-identical to the pre-cockpit benchmark.
    expect(fleetBenchmarkHours(race, field, rigged)).toBe(cleanRunHours(race, rigged, field));
  });

  // One managed run: fly a sail policy over the whole course, committing real
  // changes through resolveSailChange (with pinned manoeuvre rolls), decisions
  // suppressed so the harness isolates the SAIL economy from the tactical one.
  // `steady` swaps in a non-evolving field: on the seasonal field a slower boat
  // arrives everywhere later and can sample a different (even better) breeze,
  // so only a steady field lets the sail speeds themselves be compared.
  function managedRun(policy: 'perfect' | 'mismanaged', steady = false): {
    bench: number;
    elapsed: number;
    changes: number;
    position: number;
    hull: number;
    retired: boolean;
  } {
    const race = getRaceById('race-round-island')!;
    const boat = getBoatById('boat-corsair')!;
    setRng(mulberry32(31));
    const field = steady ? steadyField(START.lat, START.lon, 12) : createWindField(race);
    const bench = fleetBenchmarkHours(race, field, boat);
    const fleet = createFleet(race, raceDivision(race, 'corinthian'), bench, boat);
    setRng(mulberry32(32));
    let s = baseState({ windField: field, fleet });
    s.progress = { ...s.progress!, nextDecisionAtNm: Number.POSITIVE_INFINITY };
    let changes = 0;
    let retired = false;
    for (let i = 0; i < 400; i += 1) {
      // Mismanagement is stubbornness, not a peel every tick: the wrong sail
      // held up all race, re-shuffled (and fumbled) only now and then.
      const want =
        policy === 'perfect'
          ? recommendedSail(s)?.id // the Navigator's at-the-mark read
          : i % 50 === 0
            ? Math.floor(i / 50) % 2 === 0
              ? 'storm-set' // storm canvas in a 12 kn seabreeze
              : 'light-genoa' // a 2–9 kn sail on the breezy legs
            : s.progress!.activeSailId;
      if (want !== s.progress!.activeSailId) {
        // Perfect hands never fumble the forced changes; mismanaged hands
        // always do. Pin ONLY the manoeuvre's two leading rolls — the fleet
        // advancing inside the change must keep drawing its own stream.
        const pinned = policy === 'perfect' ? 0.999 : 0;
        const tail = mulberry32(33 + i);
        let k = 0;
        setRng(() => (k++ < 2 ? pinned : tail()));
        const changed = resolveSailChange(s, want ?? 'working-jib');
        setRng(mulberry32(133 + i));
        if (changed) {
          changes += 1;
          s = { ...s, progress: changed.progress, condition: changed.condition, fleet: changed.fleet };
          if (changed.retired) {
            retired = true;
            break;
          }
        }
      }
      const out = stepRace(s, defaultStepNm(race));
      s = {
        ...s,
        progress: out.progress,
        condition: out.condition,
        weather: out.weather,
        fleet: out.fleet,
      };
      if (out.finished || out.retired) {
        retired = out.retired;
        break;
      }
    }
    return {
      bench,
      elapsed: s.progress!.elapsedHours,
      changes,
      position: s.progress!.position,
      hull: s.condition.hullIntegrity,
      retired,
    };
  }

  it('perfect play beats the (unchanged) benchmark — the wardrobe pays for its own changes', () => {
    const run = managedRun('perfect');
    // Parity, with the defined delta: the free wardrobe minus its real change
    // costs lands UNDER a clean zero-change benchmark run, and within a tight
    // band of it — the fleet's tuned difficulty is preserved, the sails are an
    // edge you sail for, never a tax and never a runaway.
    expect(run.changes).toBeGreaterThan(0);
    expect(run.elapsed).toBeLessThan(run.bench);
    expect(run.elapsed).toBeGreaterThanOrEqual(run.bench * 0.9);
    // Sails alone (no tactical gambles, no start advantage — both suppressed
    // here) put the boat in the podium fight: top quarter of a 30-boat fleet.
    // The podium itself is closed out by the decision/start edges the balance
    // target assumes a well-managed race also takes.
    expect(run.position).toBeLessThanOrEqual(8);
  });

  it('a mismanaged race loses places but does not retire', () => {
    const good = managedRun('perfect', true);
    const bad = managedRun('mismanaged', true);
    expect(bad.retired).toBe(false);
    expect(bad.hull).toBeGreaterThan(0);
    // Real damage on the scoreboard, not the hull: places lost, measurable time.
    expect(bad.position).toBeGreaterThan(good.position + 3);
    expect(bad.elapsed).toBeGreaterThan(good.elapsed * 1.05);
    // …but bounded: mismanagement costs the race, never strands the boat.
    expect(bad.elapsed).toBeLessThan(good.elapsed * 1.5);
  });
});
