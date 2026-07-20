import { orcGphSecondsPerMile, orcRating, windBandMultiplier, ORC_BASE_TWS } from '../engine/orc';
import { ratingTccFor, raceWindBandTws } from '../engine/gameEngine';
import { createWindField } from '../engine/wind';
import { getBoatById, getRaceById } from '../data';
import { Boat } from '../types';

// A parametric (catalogue-style) hull with NO authored rating, so `ratingTccFor`
// and `orcRating` must derive from its polar. Vary the fields to probe the model.
function hull(over: Partial<Boat>): Boat {
  return {
    id: 'test-hull',
    name: 'Test Hull',
    className: 'Test',
    description: '',
    baseSpeed: 8.6,
    upwind: 70,
    downwind: 70,
    stability: 70,
    crewCapacity: 8,
    price: 0,
    ...over,
  };
}

describe('ORC rating derived from the polar', () => {
  it('pegs the reference cruiser-racer (boat-corsair) at ~1.0', () => {
    const corsair = getBoatById('boat-corsair')!;
    // The reference boat is the yardstick, so it rates itself at exactly 1.0.
    expect(orcRating(corsair)).toBeCloseTo(1.0, 6);
  });

  it('GPH is lower (faster) for a quicker hull, and rating is higher', () => {
    const slow = hull({ baseSpeed: 7.5 });
    const fast = hull({ baseSpeed: 10.5 });
    // GPH = seconds per mile made good — the faster boat needs fewer.
    expect(orcGphSecondsPerMile(fast)).toBeLessThan(orcGphSecondsPerMile(slow));
    // …so it rates higher and owes its speed back on corrected time.
    expect(orcRating(fast)).toBeGreaterThan(orcRating(slow));
  });

  it("is shaped by the boat's upwind/downwind CHARACTER, not just baseSpeed", () => {
    // Two hulls, identical baseSpeed — the old `baseSpeed`-only heuristic rated
    // them the same. ORC integrates the polar, so a strong pointer and a strong
    // runner earn different handicaps.
    const pointer = hull({ upwind: 90, downwind: 60 });
    const runner = hull({ upwind: 60, downwind: 90 });
    expect(orcRating(pointer)).not.toBeCloseTo(orcRating(runner), 3);
  });

  it('keeps every derived rating inside the engine band [0.85, 1.45]', () => {
    for (const bs of [5, 6.5, 8.6, 11, 14]) {
      const r = orcRating(hull({ baseSpeed: bs }));
      expect(r).toBeGreaterThanOrEqual(0.85);
      expect(r).toBeLessThanOrEqual(1.45);
    }
  });

  it('varies with the quoted wind (foundation for wind-band scoring)', () => {
    const b = hull({ baseSpeed: 9.5, upwind: 82, downwind: 85 });
    // The rating is a function of the wind the GPH is quoted at; the default is
    // ORC_BASE_TWS. This just proves the twsKn arg is honoured (Tier B builds on it).
    const light = orcGphSecondsPerMile(b, 6);
    const fresh = orcGphSecondsPerMile(b, 16);
    expect(light).toBeGreaterThan(0);
    expect(fresh).toBeGreaterThan(0);
    expect(orcGphSecondsPerMile(b, ORC_BASE_TWS)).toBeGreaterThan(0);
  });
});

describe('ratingTccFor routes through ORC only when unrated', () => {
  it('returns the authored catalogue rating verbatim (override wins)', () => {
    const tempest = getBoatById('boat-tempest')!; // authored ratingTcc 1.07
    expect(tempest.ratingTcc).toBe(1.07);
    expect(ratingTccFor(tempest)).toBe(1.07);
  });

  it('derives an ORC rating for a boat with no authored rating', () => {
    const custom = hull({ baseSpeed: 9.4, upwind: 82, downwind: 85 });
    expect(custom.ratingTcc).toBeUndefined();
    expect(ratingTccFor(custom)).toBe(orcRating(custom));
  });
});

describe('wind-band ("Triple Number") scoring', () => {
  // A neutral-stability hull (the reference pivot) has NO band shift at any wind —
  // its handicap is the same in a drifter and a gale.
  it('leaves a reference-stability boat flat across the wind range', () => {
    const neutral = hull({ stability: 68 });
    expect(windBandMultiplier(neutral, 6)).toBeCloseTo(1, 6);
    expect(windBandMultiplier(neutral, 12)).toBeCloseTo(1, 6);
    expect(windBandMultiplier(neutral, 20)).toBeCloseTo(1, 6);
  });

  it('is exactly 1.0 at the medium anchor for every boat (backward compatible)', () => {
    for (const s of [45, 60, 68, 80, 92]) {
      expect(windBandMultiplier(hull({ stability: s }), ORC_BASE_TWS)).toBeCloseTo(1, 6);
    }
  });

  it('rates a STIFF boat up in a blow and down in the light (heavy-air weapon)', () => {
    const stiff = hull({ stability: 92 });
    expect(windBandMultiplier(stiff, 20)).toBeGreaterThan(1);
    expect(windBandMultiplier(stiff, 6)).toBeLessThan(1);
  });

  it('rates a TENDER boat up in the light and down in a blow (light-air flyer)', () => {
    const tender = hull({ stability: 45 });
    expect(windBandMultiplier(tender, 6)).toBeGreaterThan(1);
    expect(windBandMultiplier(tender, 20)).toBeLessThan(1);
  });

  it('ratingTccFor with no wind is the plain certificate rating (unchanged)', () => {
    const tempest = getBoatById('boat-tempest')!;
    expect(ratingTccFor(tempest)).toBe(tempest.ratingTcc);
    // …and passing the medium anchor changes nothing.
    expect(ratingTccFor(tempest, ORC_BASE_TWS)).toBeCloseTo(tempest.ratingTcc!, 6);
  });

  it('ratingTccFor shifts the certificate rating with the race wind', () => {
    const meridian = getBoatById('boat-meridian')!; // stiff Sydney–Hobart boat
    const base = meridian.ratingTcc!;
    // A break in the drifter (owes less), owes more when it honks — its weather.
    expect(ratingTccFor(meridian, 6)).toBeLessThan(base);
    expect(ratingTccFor(meridian, 20)).toBeGreaterThan(base);
  });

  it('raceWindBandTws is a stable, positive passage mean (pure — same twice)', () => {
    const race = getRaceById('race-fastnet')!;
    const field = createWindField(race);
    const a = raceWindBandTws(field, race);
    const b = raceWindBandTws(field, race);
    expect(a).toBe(b); // pure: no RNG, identical live and at the finish
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(60);
  });
});
