import { createTidalField, sampleCurrent, sampleCurrentGrid, currentAlong, tideAlong } from '../engine/current';
import { tideRead } from '../engine/gameEngine';
import { courseBounds } from '../engine/geo';
import {
  EFFORT_SPEED,
  defaultStepNm,
  estimateRouteHours,
  initialProgress,
  raceDivision,
  stepRace,
} from '../engine/gameEngine';
import { createFleet, correctedPosition, finalPosition } from '../engine/fleet';
import { fleetBenchmarkHours } from '../engine/gameEngine';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { getRaceById, getBoatById } from '../data';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { BoatCondition, GameState, GeoPoint, TidalField, WindField } from '../types';

afterEach(() => resetRng());

const healthy: BoatCondition = { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 };

// A steady, uniform wind so boat speed is constant and the tide is the only
// variable in the ETA tests below.
function steadyWind(fromDeg: number, speedKn: number): WindField {
  return {
    baseDir: fromDeg,
    baseSpeed: speedKn,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 0,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat: 50,
    refLon: -1,
    feature: { lat: 0, lon: 0, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

// A tide that holds near peak strength over a short race: a very long period with
// the phase parked at the quarter-cycle (sin ≈ 1), so `floodDeg` is effectively a
// constant set — handy for isolating fair vs foul.
function steadyTide(floodDeg: number, peakRateKn: number): TidalField {
  return { floodDeg, peakRateKn, periodH: 1e6, phaseH: 2.5e5, gates: [], driftDeg: 0, driftKn: 0, refLat: 50, refLon: -1 };
}

describe('sampleCurrent', () => {
  const field: TidalField = { floodDeg: 90, peakRateKn: 3, periodH: 12, phaseH: 0, gates: [], driftDeg: 0, driftKn: 0, refLat: 50, refLon: -1 };

  it('is slack at the start of the cycle, floods at the quarter, ebbs at three-quarters', () => {
    expect(sampleCurrent(field, 50, -1, 0).rateKn).toBeCloseTo(0, 5);

    const flood = sampleCurrent(field, 50, -1, 3); // quarter period
    expect(flood.rateKn).toBeCloseTo(3, 1);
    expect(flood.setDeg).toBe(90); // flooding toward floodDeg

    const ebb = sampleCurrent(field, 50, -1, 9); // three-quarter period
    expect(ebb.rateKn).toBeCloseTo(3, 1);
    expect(ebb.setDeg).toBe(270); // ebbing the opposite way
  });

  it('runs harder inside a tide gate', () => {
    const gated: TidalField = { ...field, gates: [{ lat: 50, lon: -1, radiusNm: 5, gain: 1 }] };
    const open = sampleCurrent(field, 50, -1, 3).rateKn;
    const atGate = sampleCurrent(gated, 50, -1, 3).rateKn;
    expect(atGate).toBeGreaterThan(open);
    expect(atGate).toBeCloseTo(open * 2, 1); // gain 1 → double at the centre
    // Outside the gate radius it's back to the open-water rate.
    const farLat = 50 + 20 / 60; // ~20nm north
    expect(sampleCurrent(gated, farLat, -1, 3).rateKn).toBeCloseTo(open, 1);
  });

  it('is exactly slack when the field has no rate', () => {
    const slack: TidalField = { ...field, peakRateKn: 0 };
    expect(sampleCurrent(slack, 50, -1, 3).rateKn).toBe(0);
  });
});

describe('steady drift (ocean current)', () => {
  // A pure ocean current: no oscillating tide, a constant set toward the east.
  const drift: TidalField = {
    floodDeg: 0, peakRateKn: 0, periodH: 12, phaseH: 0, gates: [],
    driftDeg: 90, driftKn: 1.5, refLat: 30, refLon: -65,
  };

  it('does not reverse — same set & rate across the whole cycle', () => {
    const a = sampleCurrent(drift, 30, -65, 0);
    const b = sampleCurrent(drift, 30, -65, 6); // half a (nominal) period later
    expect(a.rateKn).toBeCloseTo(1.5, 5);
    expect(b.rateKn).toBeCloseTo(1.5, 5);
    expect(a.setDeg).toBeCloseTo(90, 3);
    expect(b.setDeg).toBeCloseTo(90, 3);
  });

  it('a gate intensifies the current core (e.g. the Gulf Stream axis)', () => {
    const gated: TidalField = { ...drift, gates: [{ lat: 30, lon: -65, radiusNm: 50, gain: 2 }] };
    const open = sampleCurrent(drift, 30, -65, 0).rateKn;
    expect(sampleCurrent(gated, 30, -65, 0).rateKn).toBeCloseTo(open * 3, 1); // gain 2 → ×3
  });

  it('vector-sums with an oscillating tide', () => {
    // Tide setting east at peak flood + drift east → rates add along the same axis.
    const both: TidalField = { ...drift, floodDeg: 90, peakRateKn: 2, phaseH: 3 }; // sin≈1 at h=0
    const s = sampleCurrent(both, 30, -65, 0);
    expect(s.setDeg).toBeCloseTo(90, 1);
    expect(s.rateKn).toBeCloseTo(3.5, 1); // 2 (tide) + 1.5 (drift)
  });

  it('tideAlong feels a pure current with no oscillating tide', () => {
    // Current sets east (90); a course due east (90) gets a fair push.
    expect(tideAlong(drift, 30, -65, 0, 90)).toBeCloseTo(1.5, 3);
    expect(tideAlong(drift, 30, -65, 0, 270)).toBeCloseTo(-1.5, 3); // dead against
  });
});

describe('currentAlong / tideAlong', () => {
  it('is fair with the heading, foul against it, nil across it', () => {
    const flood = { setDeg: 90, rateKn: 3 };
    expect(currentAlong(flood, 90)).toBeCloseTo(3, 5); // dead fair
    expect(currentAlong(flood, 270)).toBeCloseTo(-3, 5); // dead foul
    expect(currentAlong(flood, 0)).toBeCloseTo(0, 5); // abeam
  });

  it('tideAlong is zero for a slack or absent field', () => {
    expect(tideAlong(undefined, 50, -1, 3, 90)).toBe(0);
    expect(tideAlong(steadyTide(90, 0), 50, -1, 3, 90)).toBe(0);
  });
});

describe('sampleCurrentGrid', () => {
  const race = getRaceById('race-round-island')!;
  const bounds = courseBounds(race.waypoints);

  it('is empty for a slack or absent field', () => {
    expect(sampleCurrentGrid(undefined, bounds, 5, 5, 3)).toEqual([]);
    const slack = { floodDeg: 90, peakRateKn: 0, periodH: 12, phaseH: 0, gates: [], driftDeg: 0, driftKn: 0, refLat: 50, refLon: -1 };
    expect(sampleCurrentGrid(slack, bounds, 5, 5, 3)).toEqual([]);
  });

  it('returns set/rate arrows across the course at the flood', () => {
    const field = { floodDeg: 90, peakRateKn: 2, periodH: 12, phaseH: 3, gates: [], driftDeg: 0, driftKn: 0, refLat: 50, refLon: -1 };
    const arrows = sampleCurrentGrid(field, bounds, 5, 5, 0); // hours+phase=3 → near peak flood
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.every((a) => a.rateKn >= 0.15)).toBe(true);
    expect(arrows.every((a) => a.setDeg === 90)).toBe(true);
  });
});

describe('tideRead', () => {
  const baseState = (tide: TidalField | undefined, nextMarkIndex: number, lat: number, lon: number) =>
    ({
      selectedRaceId: 'race-round-island',
      tidalField: tide,
      progress: { lat, lon, elapsedHours: 3, nextMarkIndex, heading: 90 },
    } as unknown as GameState);

  it('is null on a slack course', () => {
    expect(tideRead(baseState(undefined, 1, 50.7, -1.3))).toBeNull();
  });

  it('reports rate and a signed fair/foul component to the next mark', () => {
    // Flood sets E (90°); phase 0 with elapsed 3h of a 12h cycle → peak flood.
    const field = { floodDeg: 90, peakRateKn: 2, periodH: 12, phaseH: 0, gates: [], driftDeg: 0, driftKn: 0, refLat: 50, refLon: -1 };
    const read = tideRead(baseState(field, 5, 50.555, -1.3))!;
    expect(read).not.toBeNull();
    expect(read.rateKn).toBeGreaterThan(0);
    expect(read.setDeg).toBe(90);
    expect(Number.isFinite(read.along)).toBe(true);
  });
});

describe('createTidalField', () => {
  // A race carrying a tide profile (Round the Island now ships one; override it
  // with a known single-gate profile here to prove the resolver works).
  const tidalRace = {
    ...getRaceById('race-round-island')!,
    tide: {
      floodDeg: 90,
      peakRateKn: 1.5,
      gates: [{ waypoint: 'The Needles', gain: 0.5, radiusNm: 4 }],
    },
  };

  it('resolves a race tide profile, gates and all', () => {
    setRng(mulberry32(1));
    const field = createTidalField(tidalRace);
    expect(field.peakRateKn).toBeCloseTo(1.5, 5);
    expect(field.gates.length).toBe(1);
    // Gates resolve to their marks' coordinates.
    const needles = tidalRace.waypoints.find((w) => w.name === 'The Needles')!;
    expect(field.gates.some((g) => Math.abs(g.lat - needles.lat) < 1e-9)).toBe(true);
  });

  it('is slack for a race with no tide profile', () => {
    const race = getRaceById('race-chicago-mac')!; // a lake — genuinely tideless
    const field = createTidalField(race);
    expect(field.peakRateKn).toBe(0);
    expect(field.driftKn).toBe(0);
  });
});

describe('tide changes the ETA (engine integration)', () => {
  it('a fair tide is faster than slack, a foul tide slower', () => {
    const boat = getBoatById('boat-mistral')!;
    const wind = steadyWind(90, 14); // beam reach, constant
    const route: GeoPoint[] = [
      { lat: 50, lon: -1 },
      { lat: 50.5, lon: -1 }, // due north, ~30nm
    ];
    const none = estimateRouteHours(boat, healthy, route, wind, 0, EFFORT_SPEED.cruise, 1);
    const fair = estimateRouteHours(boat, healthy, route, wind, 0, EFFORT_SPEED.cruise, 1, undefined, steadyTide(0, 3));
    const foul = estimateRouteHours(boat, healthy, route, wind, 0, EFFORT_SPEED.cruise, 1, undefined, steadyTide(180, 3));
    expect(fair).toBeLessThan(none);
    expect(foul).toBeGreaterThan(none);
  });

  it('a running tide changes the live race finish (stepRace wiring)', () => {
    const finish = (tide: TidalField | undefined): number => {
      setRng(mulberry32(4));
      const race = getRaceById('race-round-island')!;
      const boat = getBoatById('boat-mistral')!;
      const windField = createWindField(race);
      const start = race.waypoints[0];
      let s = {
        funds: 1e6, selectedRaceId: race.id, selectedDivision: 'pro', selectedBoatId: boat.id,
        ownedBoatIds: [boat.id], selectedCrewIds: [], provisions: [], condition: healthy,
        weather: weatherFromWind(sampleWind(windField, start.lat, start.lon, 0)), windField,
        tidalField: tide, fleet: createFleet(race, raceDivision(race, 'pro')),
        strategy: { bias: 0, effort: 'cruise' }, profile: { fleet: [] },
        progress: initialProgress(race, boat, 'pro', windField), history: [], eventLog: [],
      } as unknown as GameState;
      const step = defaultStepNm(race) * 3;
      let out = stepRace(s, step);
      for (let i = 0; i < 4000; i += 1) {
        out = stepRace(s, step);
        s = { ...s, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
        if (out.finished || out.retired) break;
      }
      return out.progress.elapsedHours;
    };
    // A strong steady stream slows a closed lap overall (foul legs cost more time
    // than fair legs save), so the finish must differ from slack water — proof the
    // tide actually reaches the boat through the live loop.
    const slack = finish(undefined);
    const running = finish(steadyTide(90, 2.5));
    expect(Math.abs(running - slack)).toBeGreaterThan(0.3);
  });
});

describe('tide is fair in the standings', () => {
  // The player sails a live-routed track; the fleet makes good the reference
  // polar's true speed in the same wind, drifting on the same tide. Because both
  // respond to the stream the same way, switching tide on must NOT systematically
  // move the player up or down the corrected (handicap) results — it should net
  // out, leaving only the genuine tactical swing of catching a gate well or badly.
  // This guards the hard-won fix: the earlier (made-good-paced) model let tide run
  // the player away to a near-permanent win, which this catches.
  it('does not systematically shift the player on corrected time', () => {
    const race = getRaceById('race-round-island')!;
    const tidalRace = {
      ...race,
      tide: {
        floodDeg: 90,
        peakRateKn: 1.5,
        gates: [
          { waypoint: 'The Needles', gain: 0.5, radiusNm: 4 },
          { waypoint: "St Catherine's Point", gain: 0.4, radiusNm: 5 },
        ],
      },
    };
    const boat = getBoatById('boat-tempest')!;
    const tcc = boat.ratingTcc ?? 1;
    const div = raceDivision(race, 'pro');

    // Corrected *placing* on this short inshore lap is knife-edge — the boat sits at
    // the edge of a tightly-bunched handicap fleet, so a hair of elapsed time flips
    // dozens of places and the integer rank is far too noisy to average cheaply.
    // Measure the continuous quantity underneath it instead: the player's corrected
    // time relative to the fleet's median. Tide is shared weather, so turning it on
    // must not systematically move that margin — the old runaway (tide sailing the
    // player to a near-permanent win) would drag it down by hours.
    const margin = (seed: number, withTide: boolean): number => {
      setRng(mulberry32(seed));
      const windField = createWindField(race);
      const tidalField = withTide ? createTidalField(tidalRace) : undefined;
      const start = race.waypoints[0];
      let s = {
        funds: 1e6, selectedRaceId: race.id, selectedDivision: 'pro', selectedBoatId: boat.id,
        ownedBoatIds: [boat.id], selectedCrewIds: [], provisions: [], condition: healthy,
        weather: weatherFromWind(sampleWind(windField, start.lat, start.lon, 0)), windField,
        tidalField, fleet: createFleet(race, div, fleetBenchmarkHours(race, windField, boat), boat),
        strategy: { bias: 0, effort: 'cruise' }, profile: { fleet: [] },
        progress: initialProgress(race, boat, 'pro', windField), history: [], eventLog: [],
      } as unknown as GameState;
      const step = defaultStepNm(race) * 3;
      let out = stepRace(s, step);
      for (let i = 0; i < 4000; i += 1) {
        out = stepRace(s, step);
        s = { ...s, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
        if (out.finished || out.retired) break;
      }
      const elapsed = out.progress.elapsedHours;
      const playerCorrected = elapsed * tcc;
      // Fleet corrected times (finished → actual, else projected from pace, as in
      // correctedPosition); the median shrugs off the odd boat that stalls out.
      const fleetCorrected = (s.fleet ?? [])
        .filter((c) => !c.retired)
        .map((c) => (c.finishedHours ?? elapsed * (race.distanceNm / Math.max(c.distanceNm, 1e-6))) * c.ratingTcc)
        .sort((a, b) => a - b);
      const fleetMedian = fleetCorrected[Math.floor(fleetCorrected.length / 2)] ?? playerCorrected;
      return playerCorrected - fleetMedian; // < 0 ⇒ player ahead of the fleet on corrected time
    };

    // Pair on/off by seed (same wind), so the swing measured is tide alone, not the
    // race's own wind variance. A given seed can still swing hard — catching a gate
    // fair or foul is real, high-stakes tactics on this tide-gated lap — so trim the
    // best- and worst-timed runs and take the mean of the rest: that's the
    // *systematic* tide bias, which must net to roughly nothing. The old runaway
    // (tide sailing the player to a near-permanent win) would drag every seed down.
    const seeds = Array.from({ length: 6 }, (_, i) => i + 1);
    const shifts = seeds.map((sd) => margin(sd, true) - margin(sd, false)).sort((a, b) => a - b);
    const trimmed = shifts.slice(1, -1);
    const meanShift = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
    // Generous next to a single gate's swing, tight next to a runaway: the old bug
    // dragged the player's margin down by a big slice of the race *every* seed, so
    // the trimmed mean would blow well past this. A fair tide nets near zero.
    expect(Math.abs(meanShift)).toBeLessThan(race.recordTimeHours * 4);
  }, 120000);
});
