import { effectivePolar, sailCoverage, wardrobeMultiplier, bestSailAt } from '../engine/sails';
import { interpolatePolar } from '../engine/polarTable';
import { resolveBoatById } from '../engine/gameEngine';
import { polarSpeed } from '../engine/polar';
import {
  SAILS,
  getSailById,
  availableSailsFor,
  sailCost,
  sailRefund,
} from '../data/sails';
import { getClassOption } from '../data/polarLibrary';
import { BoatType, FleetBoat, GameState, Sail } from '../types';

function buildFleetBoat(boatType: BoatType, sails: string[] = []): FleetBoat {
  const opt = getClassOption(boatType)!;
  return {
    id: `fleet-${boatType}`,
    name: `My ${boatType}`,
    className: opt.className,
    description: '',
    baseSpeed: opt.baseSpeed,
    upwind: opt.upwind,
    downwind: opt.downwind,
    stability: opt.stability,
    crewCapacity: opt.crewCapacity,
    price: opt.price,
    custom: true,
    boatType,
    polar: opt.polar,
    speedAdjustment: { upwindPct: 100, downwindPct: 100, nightPct: 100 },
    sails,
  };
}

const codeZero = getSailById('code-zero')!;

describe('sail coverage', () => {
  it('is full inside the envelope and zero well outside it', () => {
    const mid = (codeZero.twaMin + codeZero.twaMax) / 2;
    const midW = (codeZero.twsMin + codeZero.twsMax) / 2;
    expect(sailCoverage(codeZero, mid, midW)).toBeCloseTo(1, 5);
    // Far below the wind band and far off the angle: no contribution.
    expect(sailCoverage(codeZero, 180, 40)).toBe(0);
  });

  it('tapers smoothly just outside the band rather than cliff-edging', () => {
    const justOver = sailCoverage(codeZero, codeZero.twaMax + 10, 10);
    expect(justOver).toBeGreaterThan(0);
    expect(justOver).toBeLessThan(1);
  });

  it('folds reflex wind angles into 0..180', () => {
    const inside = (codeZero.twaMin + codeZero.twaMax) / 2;
    const midW = (codeZero.twsMin + codeZero.twsMax) / 2;
    expect(sailCoverage(codeZero, 360 - inside, midW)).toBeCloseTo(
      sailCoverage(codeZero, inside, midW),
      5
    );
  });
});

describe('wardrobe multiplier', () => {
  it('is 1 with no sails and lifts within a carried sail band', () => {
    expect(wardrobeMultiplier([], 80, 10)).toBe(1);
    const mid = (codeZero.twaMin + codeZero.twaMax) / 2;
    const midW = (codeZero.twsMin + codeZero.twsMax) / 2;
    expect(wardrobeMultiplier([codeZero], mid, midW)).toBeCloseTo(1 + codeZero.boost, 5);
  });

  it('does not stack sails — takes the single best lift', () => {
    const a: Sail = { ...codeZero, id: 'a', boost: 0.05 };
    const b: Sail = { ...codeZero, id: 'b', boost: 0.08 };
    const mid = (codeZero.twaMin + codeZero.twaMax) / 2;
    const midW = (codeZero.twsMin + codeZero.twsMax) / 2;
    expect(wardrobeMultiplier([a, b], mid, midW)).toBeCloseTo(1 + 0.08, 5);
  });

  it('names the best sail working at a point', () => {
    const mid = (codeZero.twaMin + codeZero.twaMax) / 2;
    const midW = (codeZero.twsMin + codeZero.twsMax) / 2;
    expect(bestSailAt([codeZero], mid, midW)?.id).toBe('code-zero');
    expect(bestSailAt([codeZero], 180, 40)).toBeNull();
    expect(bestSailAt([], 80, 10)).toBeNull();
  });
});

describe('effective polar', () => {
  it('returns the base polar untouched with no sails', () => {
    const base = getClassOption('tp52')!.polar;
    expect(effectivePolar(base, [])).toBe(base);
    expect(effectivePolar(base, undefined)).toBe(base);
    expect(effectivePolar(base, ['not-a-real-sail'])).toBe(base);
  });

  it('never sails slower than the base polar', () => {
    const base = getClassOption('class40')!.polar;
    const eff = effectivePolar(base, ['code-zero', 'heavy-spinnaker']);
    base.twa.forEach((twa, ti) =>
      base.tws.forEach((_tws, wi) => {
        expect(eff.speed[ti][wi]).toBeGreaterThanOrEqual(base.speed[ti][wi]);
      })
    );
  });

  it('lifts speed where the carried sail is cut for it', () => {
    const base = getClassOption('cruiserRacerIRC')!.polar;
    const eff = effectivePolar(base, ['code-zero']);
    // Reaching in light air — squarely inside the Code 0 band.
    const before = interpolatePolar(base, 80, 8);
    const after = interpolatePolar(eff, 80, 8);
    expect(after).toBeGreaterThan(before);
    // Dead downwind in a gale — outside the Code 0 band, so unchanged.
    expect(interpolatePolar(eff, 175, 24)).toBeCloseTo(interpolatePolar(base, 175, 24), 2);
  });

  it('recomputes VMG targets for the lifted polar', () => {
    const base = getClassOption('maxi72')!.polar;
    const eff = effectivePolar(base, ['light-spinnaker']);
    expect(eff.targets.runSpeed.length).toBe(eff.tws.length);
    const i = eff.tws.indexOf(8);
    expect(eff.targets.runSpeed[i]).toBeGreaterThanOrEqual(base.targets.runSpeed[i]);
  });

  it('memoises by base polar and sail set', () => {
    const base = getClassOption('tp52')!.polar;
    expect(effectivePolar(base, ['code-zero'])).toBe(effectivePolar(base, ['code-zero']));
    // Order-independent signature.
    const a = effectivePolar(base, ['code-zero', 'light-spinnaker']);
    const b = effectivePolar(base, ['light-spinnaker', 'code-zero']);
    expect(a).toBe(b);
  });
});

describe('sail catalogue', () => {
  it('scales cost and refund with the class price', () => {
    const cruiser = sailCost('cruiserRacerIRC', codeZero);
    const maxi = sailCost('maxi72', codeZero);
    expect(maxi).toBeGreaterThan(cruiser);
    expect(sailRefund('maxi72', codeZero)).toBeLessThan(maxi);
  });

  it('only offers sails from the catalogue, in availability lists', () => {
    (['cruiserRacerIRC', 'tp52', 'class40', 'maxi72'] as BoatType[]).forEach((t) => {
      availableSailsFor(t).forEach((s) => {
        expect(SAILS.some((cat) => cat.id === s.id)).toBe(true);
      });
    });
  });
});

describe('engine integration', () => {
  it('resolves a rigged boat with its effective polar', () => {
    const boat = buildFleetBoat('class40', ['code-zero']);
    const state = {
      ownedBoatIds: [],
      profile: { fleet: [boat] },
    } as unknown as GameState;
    const resolved = resolveBoatById(state, boat.id)!;
    // Faster on a light-air reach than the bare boat...
    expect(polarSpeed(resolved, 80, 8)).toBeGreaterThan(polarSpeed(boat, 80, 8));
    // ...and the no-wardrobe case is returned untouched (same reference).
    const bare = buildFleetBoat('class40', []);
    const bareState = {
      ownedBoatIds: [],
      profile: { fleet: [bare] },
    } as unknown as GameState;
    expect(resolveBoatById(bareState, bare.id)).toBe(bare);
  });
});
