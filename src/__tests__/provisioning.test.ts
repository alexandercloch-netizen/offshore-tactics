import {
  autoProvision,
  estimatePassageDays,
  initialCondition,
  provisioningPlan,
} from '../engine/gameEngine';
import { getRaceById, getBoatById, getCrewById, crewForTier } from '../data';
import { GameState } from '../types';

const race = getRaceById('race-fastnet')!;
const boat = getBoatById('boat-mistral')!;
const crew = crewForTier('pro').slice(0, 6);

function stateFor(provisions = []) {
  return {
    selectedRaceId: race.id,
    selectedBoatId: boat.id,
    selectedCrewIds: crew.map((c) => c.id),
    provisions,
  } as unknown as GameState;
}

describe('estimatePassageDays', () => {
  it('scales with the course record and is always positive', () => {
    expect(estimatePassageDays(race)).toBeGreaterThan(0);
    const longer = getRaceById('race-transpac')!;
    expect(estimatePassageDays(longer)).toBeGreaterThan(estimatePassageDays(race));
  });
});

describe('provisioningPlan', () => {
  it('an unprovisioned boat is starved — big condition penalty, no resilience', () => {
    const plan = provisioningPlan([], crew.length, race);
    expect(plan.sustenance).toBe(0);
    expect(plan.staminaStart).toBeLessThan(0);
    expect(plan.moraleStart).toBeLessThan(0);
    expect(plan.hullWearResist).toBe(0);
    expect(plan.safety).toBe(0);
  });

  it('covering the passage lifts sustenance to full with no penalty', () => {
    const sel = autoProvision(stateFor(), 'minimum');
    const plan = provisioningPlan(sel, crew.length, race);
    expect(plan.foodRatio).toBeGreaterThanOrEqual(1);
    expect(plan.waterRatio).toBeGreaterThanOrEqual(1);
    expect(plan.staminaStart).toBeGreaterThanOrEqual(0);
  });

  it('equipment resilience saturates (diminishing returns, capped)', () => {
    const one = provisioningPlan([{ provisionId: 'prov-safety', quantity: 1 }], crew.length, race);
    const ten = provisioningPlan([{ provisionId: 'prov-safety', quantity: 10 }], crew.length, race);
    expect(ten.safety).toBeGreaterThan(one.safety);
    expect(ten.safety).toBeLessThan(one.safety * 10); // not linear
    expect(ten.safety).toBeLessThanOrEqual(0.5);
  });
});

describe('autoProvision', () => {
  it('minimum covers food & water but fits no equipment', () => {
    const plan = provisioningPlan(autoProvision(stateFor(), 'minimum'), crew.length, race);
    expect(plan.sustenance).toBeGreaterThanOrEqual(1);
    expect(plan.safety).toBe(0);
  });

  it('balanced and bluewater cover the passage and add safety/spares', () => {
    for (const preset of ['balanced', 'bluewater'] as const) {
      const plan = provisioningPlan(autoProvision(stateFor(), preset), crew.length, race);
      expect(plan.sustenance).toBeGreaterThanOrEqual(1);
      expect(plan.safety).toBeGreaterThan(0);
      expect(plan.hullWearResist).toBeGreaterThan(0);
    }
  });

  it('bluewater carries a bigger margin than minimum', () => {
    const min = provisioningPlan(autoProvision(stateFor(), 'minimum'), crew.length, race);
    const blue = provisioningPlan(autoProvision(stateFor(), 'bluewater'), crew.length, race);
    // Both stock the same water item, so the bigger bluewater margin shows here
    // without rounding ties masking it.
    expect(blue.waterRatio).toBeGreaterThan(min.waterRatio);
  });
});

describe('initialCondition with provisioning', () => {
  it('a well-provisioned crew starts in better shape than a starved one', () => {
    const members = crew.map((c) => getCrewById(c.id)!).filter(Boolean);
    const starved = initialCondition(members, [], race);
    const stocked = initialCondition(members, autoProvision(stateFor(), 'balanced'), race);
    expect(stocked.crewStamina).toBeGreaterThan(starved.crewStamina);
    expect(stocked.crewMorale).toBeGreaterThan(starved.crewMorale);
  });
});
