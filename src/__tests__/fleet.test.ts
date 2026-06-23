import {
  advanceFleet,
  competitorPoints,
  correctedPosition,
  createFleet,
  finalPosition,
  livePosition,
  madeGoodSpeed,
} from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { createWindField } from '../engine/wind';
import { getBoatById, getRaceById } from '../data';
import { Competitor, WindField } from '../types';

const race = getRaceById('race-fastnet')!;
const boat = getBoatById('boat-mistral')!;

function steady(fromDeg: number, speedKn: number): WindField {
  return {
    baseDir: fromDeg,
    baseSpeed: speedKn,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 0,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat: 0,
    refLon: 0,
    feature: { lat: 0, lon: 0, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

afterEach(() => resetRng());

describe('createFleet', () => {
  it('builds fleetSize - 1 competitors, deterministically', () => {
    setRng(mulberry32(1));
    const a = createFleet(race, race.divisions.pro);
    setRng(mulberry32(1));
    const b = createFleet(race, race.divisions.pro);
    expect(a).toHaveLength(race.divisions.pro.fleetSize - 1);
    expect(a).toEqual(b);
  });

  it('gives the pro fleet a tighter spread of skill than the Corinthian fleet', () => {
    setRng(mulberry32(5));
    const spread = (f: Competitor[]) => {
      const muls = f.map((c) => c.speedMul);
      return Math.max(...muls) - Math.min(...muls);
    };
    const pro = createFleet(race, race.divisions.pro);
    const cor = createFleet(race, race.divisions.corinthian);
    expect(spread(pro)).toBeLessThan(spread(cor));
  });

  it('gives each boat a course-side bias within [-1, 1]', () => {
    setRng(mulberry32(2));
    const fleet = createFleet(race, race.divisions.pro);
    expect(fleet.every((c) => typeof c.bias === 'number')).toBe(true);
    expect(fleet.every((c) => c.bias! >= -1 && c.bias! <= 1)).toBe(true);
  });
});

describe('fleet racing dynamics', () => {
  it('is deterministic for a given seed', () => {
    const run = () => {
      setRng(mulberry32(31));
      const f = createWindField(race);
      let fleet = createFleet(race, race.divisions.pro);
      for (let i = 0; i < 25; i += 1) fleet = advanceFleet(fleet, race, f, i, 1);
      return fleet.map((c) => Math.round(c.distanceNm));
    };
    expect(run()).toEqual(run());
  });

  it('rewards the side a boat backs — flipping bias changes the result', () => {
    // Same field, same base fleet, same puff-luck noise; only the boats' chosen
    // side differs. If side genuinely matters, the standings must diverge.
    setRng(mulberry32(40));
    const f = createWindField(race);
    setRng(mulberry32(41));
    const base = createFleet(race, race.divisions.pro);

    const sim = (flip: boolean) => {
      setRng(mulberry32(42));
      let fleet: Competitor[] = base.map((c) => ({ ...c, bias: (flip ? -1 : 1) * (c.bias ?? 0) }));
      for (let i = 0; i < 40; i += 1) fleet = advanceFleet(fleet, race, f, i, 1);
      return fleet.map((c) => Math.round(c.distanceNm * 100));
    };

    expect(sim(false)).not.toEqual(sim(true));
  });
});

describe('madeGoodSpeed', () => {
  it('makes way toward an upwind mark via the VMG angle', () => {
    // Mark due north, wind from the north => dead upwind.
    expect(madeGoodSpeed(boat, 0, 0, 14)).toBeGreaterThan(0);
  });

  it('is fastest on a reach', () => {
    const reach = madeGoodSpeed(boat, 90, 0, 14);
    const upwind = madeGoodSpeed(boat, 0, 0, 14);
    expect(reach).toBeGreaterThan(upwind);
  });
});

describe('advanceFleet', () => {
  it('moves every competitor forward and faster boats lead', () => {
    setRng(mulberry32(3));
    let fleet = createFleet(race, race.divisions.pro);
    const field = steady(240, 16);
    for (let i = 0; i < 20; i += 1) {
      fleet = advanceFleet(fleet, race, field, i * 2, 2);
    }
    expect(fleet.every((c) => c.distanceNm > 0 || c.retired)).toBe(true);
    const fastest = [...fleet].sort((a, b) => b.speedMul - a.speedMul)[0];
    const slowest = [...fleet].sort((a, b) => a.speedMul - b.speedMul)[0];
    if (!fastest.retired && !slowest.retired) {
      expect(fastest.distanceNm).toBeGreaterThan(slowest.distanceNm);
    }
  });

  it('records a finish time when a competitor completes the course', () => {
    const fleet: Competitor[] = [
      { id: 'a', name: 'A', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: race.distanceNm - 1, finishedHours: null, retired: false },
    ];
    const advanced = advanceFleet(fleet, race, steady(240, 16), 10, 5);
    expect(advanced[0].finishedHours).not.toBeNull();
    expect(advanced[0].distanceNm).toBe(race.distanceNm);
  });
});

describe('standings', () => {
  const fleet: Competitor[] = [
    { id: 'a', name: 'A', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: 300, finishedHours: null, retired: false },
    { id: 'b', name: 'B', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: 100, finishedHours: null, retired: false },
    { id: 'c', name: 'C', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: 0, finishedHours: null, retired: true },
  ];

  it('ranks the player by how many boats are ahead', () => {
    expect(livePosition(fleet, 200)).toBe(2); // one boat (A) ahead
    expect(livePosition(fleet, 350)).toBe(1); // leading
    expect(livePosition(fleet, 50)).toBe(3); // A and B ahead; C retired
  });

  it('ranks the final finish by who crossed the line first', () => {
    const finished: Competitor[] = [
      { id: 'a', name: 'A', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: race.distanceNm, finishedHours: 40, retired: false },
      { id: 'b', name: 'B', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: race.distanceNm, finishedHours: 52, retired: false },
    ];
    expect(finalPosition(finished, 48)).toBe(2); // beat B, lost to A
  });

  it('corrected time can beat a faster boat on handicap', () => {
    const finished: Competitor[] = [
      // Faster across the line (40h) but rates high, so it owes time: corrected 52h.
      { id: 'a', name: 'A', speedMul: 1.2, ratingTcc: 1.3, targetHours: 100, distanceNm: race.distanceNm, finishedHours: 40, retired: false },
      // Slower across the line (50h), rates 1.0: corrected 50h.
      { id: 'b', name: 'B', speedMul: 0.9, ratingTcc: 1.0, targetHours: 100, distanceNm: race.distanceNm, finishedHours: 50, retired: false },
    ];
    expect(finalPosition(finished, 48)).toBe(2); // 2nd on the water (A ahead)
    expect(correctedPosition(finished, race.distanceNm, 48, 1.0)).toBe(1); // 1st on handicap
  });

  it('projects an unfinished boat from its pace for corrected standings', () => {
    const stillRacing: Competitor[] = [
      // Half the course done when the player finishes → projects to ~2× elapsed.
      { id: 'a', name: 'A', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: race.distanceNm / 2, finishedHours: null, retired: false },
    ];
    expect(correctedPosition(stillRacing, race.distanceNm, 50, 1.0)).toBe(1);
  });
});

describe('competitorPoints', () => {
  it('maps racing competitors to coordinates and omits finished/retired', () => {
    const fleet: Competitor[] = [
      { id: 'a', name: 'A', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: 200, finishedHours: null, retired: false },
      { id: 'b', name: 'B', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: 200, finishedHours: 30, retired: false },
      { id: 'c', name: 'C', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: 200, finishedHours: null, retired: true },
    ];
    const pts = competitorPoints(fleet, race);
    expect(pts).toHaveLength(1);
    expect(typeof pts[0].lat).toBe('number');
  });

  it('spreads boats across the course by the side they back (lateral leverage)', () => {
    // Two boats at the same progress but opposite sides sit either side of the
    // rhumb line mid-course — the fleet has width, not a single-file line.
    const mid = race.distanceNm / 2;
    const left: Competitor[] = [
      { id: 'l', name: 'L', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: mid, bias: -1, finishedHours: null, retired: false },
    ];
    const right: Competitor[] = [
      { id: 'r', name: 'R', speedMul: 1, ratingTcc: 1, targetHours: 100, distanceNm: mid, bias: 1, finishedHours: null, retired: false },
    ];
    const [lp] = competitorPoints(left, race);
    const [rp] = competitorPoints(right, race);
    // Opposite sides → genuinely different positions across the course.
    expect(lp.lat !== rp.lat || lp.lon !== rp.lon).toBe(true);
    expect(Math.hypot(lp.lat - rp.lat, lp.lon - rp.lon)).toBeGreaterThan(0.02);
  });

  it('shows competitors sitting on the start line (distance 0)', () => {
    // A freshly created fleet is all at distance 0; it must be visible from the
    // gun, not only once boats have sailed clear of the start.
    setRng(mulberry32(1));
    const fresh = createFleet(race, race.divisions.corinthian);
    expect(fresh.every((c) => c.distanceNm === 0)).toBe(true);
    expect(competitorPoints(fresh, race)).toHaveLength(fresh.length);
  });
});
