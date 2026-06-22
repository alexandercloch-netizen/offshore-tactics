import { polarSpeed, noGoAngle, bestVmgAngles } from '../engine/polar';
import { isBoatOwned, resolveBoatById } from '../engine/gameEngine';
import { CLASS_LIBRARY, getClassOption } from '../data/polarLibrary';
import { BOATS, getBoatById } from '../data';
import { FleetBoat, GameState } from '../types';

function buildFleetBoat(overrides: Partial<FleetBoat> = {}): FleetBoat {
  const opt = getClassOption('tp52')!;
  return {
    id: 'fleet-test',
    name: 'My TP52',
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
    ...overrides,
  };
}

describe('class library', () => {
  it('provides four classes with valid polars', () => {
    expect(CLASS_LIBRARY).toHaveLength(4);
    CLASS_LIBRARY.forEach((c) => {
      expect(c.polar.tws.length).toBeGreaterThan(1);
      expect(c.polar.speed.length).toBe(c.polar.twa.length);
      // makes way on a reach
      const boat = buildFleetBoat({ boatType: c.boatType, polar: c.polar });
      expect(polarSpeed(boat, 90, 14)).toBeGreaterThan(0);
    });
  });
});

describe('custom boat uses its polar table', () => {
  const boat = buildFleetBoat();

  it('reads speed from the polar and respects the no-go zone', () => {
    expect(polarSpeed(boat, 90, 14)).toBeGreaterThan(0);
    expect(polarSpeed(boat, noGoAngle(boat) - 5, 14)).toBe(0);
  });

  it('derives VMG angles from the polar targets', () => {
    const v = bestVmgAngles(boat, 14);
    expect(v.upAngle).toBeLessThan(90);
    expect(v.downAngle).toBeGreaterThan(90);
  });

  it('applies the downwind speed adjustment multiplicatively', () => {
    const slowed = buildFleetBoat({ speedAdjustment: { upwindPct: 100, downwindPct: 50, nightPct: 100 } });
    const full = polarSpeed(boat, 150, 14);
    const half = polarSpeed(slowed, 150, 14);
    expect(half).toBeCloseTo(full * 0.5, 5);
  });
});

describe('ownership & resolution', () => {
  const boat = buildFleetBoat();
  const state = { ownedBoatIds: [], profile: { fleet: [boat] } } as unknown as GameState;

  it('treats custom boats as owned and resolves them by id', () => {
    expect(isBoatOwned(state, boat)).toBe(true);
    expect(resolveBoatById(state, 'fleet-test')).toBe(boat);
  });

  it('does not treat an unbought catalogue boat as owned', () => {
    expect(isBoatOwned(state, BOATS[0])).toBe(false);
    expect(resolveBoatById(state, BOATS[0].id)).toBe(BOATS[0]);
  });

  it('exposes a custom boat berth count only via resolveBoatById (not getBoatById)', () => {
    // Regression: the crew screen must resolve against the fleet, or a custom
    // boat reports 0 berths and blocks signing crew.
    expect(getBoatById('fleet-test')).toBeUndefined();
    expect(resolveBoatById(state, 'fleet-test')?.crewCapacity).toBe(boat.crewCapacity);
    expect(boat.crewCapacity).toBeGreaterThan(0);
  });
});
