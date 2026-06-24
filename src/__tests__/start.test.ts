import { startLineGeo, startRead, resolveStart } from '../engine/start';
import { haversineNm } from '../engine/geo';
import { initialProgress, seedStartGrid } from '../engine/gameEngine';
import { createFleet } from '../engine/fleet';
import { createWindField } from '../engine/wind';
import { getRaceById, getBoatById } from '../data';
import { mulberry32, setRng, resetRng } from '../engine/rng';
import { StartPlan, TidalField, WindField } from '../types';

afterEach(() => resetRng());

const race = getRaceById('race-round-island')!;

// A steady, uniform wind from `fromDeg` so the start read is deterministic.
function steady(fromDeg: number, speedKn = 12): WindField {
  return {
    baseDir: fromDeg,
    baseSpeed: speedKn,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 0,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat: 50.7,
    refLon: -1.3,
    feature: { lat: 0, lon: 0, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

// A near-constant tide setting toward `floodDeg` (very long period parked at peak).
function steadyTide(floodDeg: number, peakRateKn: number): TidalField {
  return { floodDeg, peakRateKn, periodH: 1e6, phaseH: 2.5e5, gates: [], refLat: 50.7, refLon: -1.3 };
}

const plan = (p: Partial<StartPlan>): StartPlan => ({ end: 'mid', approach: 'timed', beat: 'clear', ...p });

describe('startLineGeo', () => {
  it('puts the committee and pin on opposite sides of the start, square to the wind', () => {
    const line = startLineGeo(race);
    expect(haversineNm(line.committee.lat, line.committee.lon, line.pin.lat, line.pin.lon)).toBeGreaterThan(0.5);
    const start = race.waypoints[0];
    // Both ends sit close to the start mark.
    expect(haversineNm(start.lat, start.lon, line.committee.lat, line.committee.lon)).toBeLessThan(1);
  });
});

describe('startRead', () => {
  const prevailing = race.prevailingWind.fromDeg; // 225

  it('favours the committee (right) end on a veer, the pin on a back', () => {
    const veer = startRead(race, steady(prevailing + 10), undefined, 1);
    expect(veer.endBias).toBeGreaterThan(0);
    expect(veer.favouredEnd).toBe('committee');

    const back = startRead(race, steady(prevailing - 10), undefined, 1);
    expect(back.endBias).toBeLessThan(0);
    expect(back.favouredEnd).toBe('pin');
  });

  it('reads a square line as roughly even', () => {
    const square = startRead(race, steady(prevailing), undefined, 1);
    expect(Math.abs(square.endBias)).toBeLessThan(0.2);
  });

  it('a tide setting over the line raises the OCS risk for a full send', () => {
    const wind = steady(prevailing);
    const noTide = startRead(race, wind, undefined, 0.6).ocsRisk;
    // Flood set toward where the wind comes from = over the line (upwind).
    const overLine = startRead(race, wind, steadyTide(prevailing, 1.5), 0.6).ocsRisk;
    expect(overLine).toBeGreaterThan(noTide);
  });

  it('a sharper Navigator trims the OCS risk', () => {
    const wind = steady(prevailing);
    const green = startRead(race, wind, steadyTide(prevailing, 1.5), 0.2).ocsRisk;
    const sharp = startRead(race, wind, steadyTide(prevailing, 1.5), 0.95).ocsRisk;
    expect(sharp).toBeLessThan(green);
  });
});

describe('resolveStart', () => {
  const size = 60;
  const prevailing = race.prevailingWind.fromDeg;

  it('rewards the favoured end over the wrong end', () => {
    const veer = steady(prevailing + 10); // committee favoured
    const right = resolveStart(race, veer, undefined, plan({ end: 'committee' }), 0.8, 0.99, size);
    const wrong = resolveStart(race, veer, undefined, plan({ end: 'pin' }), 0.8, 0.99, size);
    expect(right.rating).toBeGreaterThan(wrong.rating);
    expect(right.gunPosition).toBeLessThan(wrong.gunPosition);
  });

  it('a full send pays when timed, but is OCS when it is not', () => {
    const wind = steady(prevailing);
    const timed = resolveStart(race, wind, undefined, plan({ approach: 'send' }), 0.7, 0.99, size); // roll high → safe
    expect(timed.ocs).toBe(false);
    expect(timed.rating).toBeGreaterThan(0.5);

    const over = resolveStart(race, wind, undefined, plan({ approach: 'send' }), 0.7, 0.0, size); // roll 0 → OCS
    expect(over.ocs).toBe(true);
    expect(over.timePenaltyH).toBeGreaterThan(0);
    expect(over.gunPosition).toBeGreaterThan(size * 0.5);
  });

  it('the favoured-beat call commits a routing bias; clear air does not', () => {
    const wind = steady(prevailing);
    const fav = resolveStart(race, wind, undefined, plan({ beat: 'favoured' }), 0.8, 0.99, size);
    expect([-1, 0, 1]).toContain(fav.bias);
    const clear = resolveStart(race, wind, undefined, plan({ beat: 'clear' }), 0.8, 0.99, size);
    expect(clear.bias).toBe(0);
  });

  it('centres a neutral start (mid / timed / clear) near 0.5 — no free boost', () => {
    const o = resolveStart(race, steady(prevailing), undefined, plan({}), 0.7, 0.5, size);
    expect(o.rating).toBeGreaterThan(0.4);
    expect(o.rating).toBeLessThan(0.6);
    expect(o.speedMul).toBeGreaterThan(0.97);
    expect(o.speedMul).toBeLessThan(1.03);
  });

  it('keeps every outcome within sane bounds', () => {
    const wind = steady(prevailing + 6);
    for (const end of ['committee', 'mid', 'pin'] as const) {
      for (const approach of ['send', 'timed', 'hold'] as const) {
        for (const beat of ['favoured', 'clear', 'speed'] as const) {
          for (const roll of [0, 0.5, 1]) {
            const o = resolveStart(race, wind, steadyTide(90, 1), { end, approach, beat }, 0.6, roll, size);
            expect(o.speedMul).toBeGreaterThanOrEqual(0.8);
            expect(o.speedMul).toBeLessThanOrEqual(1.12);
            expect(o.gunPosition).toBeGreaterThanOrEqual(1);
            expect(o.gunPosition).toBeLessThanOrEqual(size);
            expect(o.rating).toBeGreaterThanOrEqual(0);
            expect(o.rating).toBeLessThanOrEqual(1);
            expect([-1, 0, 1]).toContain(o.bias);
            expect(o.fadeNm).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('seedStartGrid (real gun position)', () => {
  const setup = () => {
    setRng(mulberry32(1));
    const windField = createWindField(race);
    const fleet = createFleet(race, race.divisions.pro);
    const progress = initialProgress(race, getBoatById('boat-sprite')!, 'pro', windField);
    return { fleet, progress };
  };

  it('places a great start ahead of a poor one and spreads the fleet off the line', () => {
    const { fleet, progress } = setup();
    const good = seedStartGrid(progress, fleet, race, 0.95);
    const bad = seedStartGrid(progress, fleet, race, 0.05);
    expect(good.progress.position).toBeLessThan(bad.progress.position);
    expect(good.progress.distanceCoveredNm).toBeGreaterThan(bad.progress.distanceCoveredNm);
    expect(good.fleet.some((c) => c.distanceNm > 0)).toBe(true); // not all stacked on the line
  });

  it('lands an average start mid-fleet', () => {
    const { fleet, progress } = setup();
    const avg = seedStartGrid(progress, fleet, race, 0.5);
    const size = race.divisions.pro.fleetSize;
    expect(avg.progress.position).toBeGreaterThan(size * 0.25);
    expect(avg.progress.position).toBeLessThan(size * 0.75);
  });
});
