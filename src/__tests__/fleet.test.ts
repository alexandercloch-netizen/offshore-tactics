import {
  advanceFleet,
  competitorPoints,
  createFleet,
  finalPosition,
  livePosition,
  madeGoodSpeed,
} from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
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
      fleet = advanceFleet(fleet, race, boat, field, i * 2, 2);
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
      { id: 'a', name: 'A', speedMul: 1, distanceNm: race.distanceNm - 1, finishedHours: null, retired: false },
    ];
    const advanced = advanceFleet(fleet, race, boat, steady(240, 16), 10, 5);
    expect(advanced[0].finishedHours).not.toBeNull();
    expect(advanced[0].distanceNm).toBe(race.distanceNm);
  });
});

describe('standings', () => {
  const fleet: Competitor[] = [
    { id: 'a', name: 'A', speedMul: 1, distanceNm: 300, finishedHours: null, retired: false },
    { id: 'b', name: 'B', speedMul: 1, distanceNm: 100, finishedHours: null, retired: false },
    { id: 'c', name: 'C', speedMul: 1, distanceNm: 0, finishedHours: null, retired: true },
  ];

  it('ranks the player by how many boats are ahead', () => {
    expect(livePosition(fleet, 200)).toBe(2); // one boat (A) ahead
    expect(livePosition(fleet, 350)).toBe(1); // leading
    expect(livePosition(fleet, 50)).toBe(3); // A and B ahead; C retired
  });

  it('ranks the final finish by who crossed the line first', () => {
    const finished: Competitor[] = [
      { id: 'a', name: 'A', speedMul: 1, distanceNm: race.distanceNm, finishedHours: 40, retired: false },
      { id: 'b', name: 'B', speedMul: 1, distanceNm: race.distanceNm, finishedHours: 52, retired: false },
    ];
    expect(finalPosition(finished, 48)).toBe(2); // beat B, lost to A
  });
});

describe('competitorPoints', () => {
  it('maps racing competitors to coordinates and omits finished/retired', () => {
    const fleet: Competitor[] = [
      { id: 'a', name: 'A', speedMul: 1, distanceNm: 200, finishedHours: null, retired: false },
      { id: 'b', name: 'B', speedMul: 1, distanceNm: 200, finishedHours: 30, retired: false },
      { id: 'c', name: 'C', speedMul: 1, distanceNm: 200, finishedHours: null, retired: true },
    ];
    const pts = competitorPoints(fleet, race);
    expect(pts).toHaveLength(1);
    expect(typeof pts[0].lat).toBe('number');
  });
});
