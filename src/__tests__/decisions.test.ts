import {
  DEFAULT_STRATEGY,
  EDGE_SEND,
  applyDecision,
  choiceDownside,
  decisionBungleChance,
  defaultStepNm,
  edgeDecay,
  effectiveTacticalEdge,
  initialProgress,
  misreadForgiveness,
  raceDivision,
  realisedDecisionHours,
  resolveFieldDelta,
  roleSkill,
  speedMadeGood,
  stepRace,
  vmgPreview,
} from '../engine/gameEngine';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { getBoatById, getRaceById } from '../data';
import { GameEvent, GameState, TacticalChoice, WindField } from '../types';

afterEach(() => resetRng());

// Build a race-ready state with a seeded wind field and an initial route.
function baseState(overrides: Partial<GameState> = {}): GameState {
  const raceId = overrides.selectedRaceId ?? 'race-round-island';
  const division = overrides.selectedDivision ?? 'corinthian';
  const race = getRaceById(raceId)!;
  const boat = getBoatById(overrides.selectedBoatId ?? 'boat-mistral')!;
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
    fleet: createFleet(race, raceDivision(race, division), undefined, boat),
    strategy: DEFAULT_STRATEGY,
    profile: { fleet: [] },
    progress: initialProgress(race, boat, division, windField),
    history: [],
    eventLog: [],
    ...overrides,
  };
}

// A wind field with a strong, steady veer — a genuine, exploitable shift.
function shiftingField(refLat: number, refLon: number): WindField {
  return {
    baseDir: 200,
    baseSpeed: 14,
    shiftAmpDeg: 0,
    shiftPeriodH: 6,
    shiftPhase: 0,
    rotateDegPerH: 20,
    gradientAxisDeg: 0,
    gradientPerNm: 0,
    refLat,
    refLon,
    feature: { lat: refLat, lon: refLon, radiusNm: 1, deltaKn: 0, driftDir: 0, driftKn: 0 },
  };
}

// A dead-flat field: nothing to exploit, so a bold call is a false alarm.
function flatField(refLat: number, refLon: number): WindField {
  return { ...shiftingField(refLat, refLon), rotateDegPerH: 0 };
}

const START = getRaceById('race-round-island')!.waypoints[0];

const boldCall: TacticalChoice = {
  id: 'test-bold',
  label: 'Send it',
  description: '',
  timeDelta: -0.6,
  staminaDelta: 0,
  moraleDelta: 0,
  hullDelta: 0,
  risk: 0, // isolate the field resolution from the bungle roll
  field: true,
};

describe('resolveFieldDelta — the single source of truth', () => {
  it('passes a non-field choice through untouched', () => {
    const safe: TacticalChoice = { ...boldCall, id: 's', timeDelta: 0.4, field: false };
    expect(resolveFieldDelta(safe, -1)).toBe(0.4);
    expect(resolveFieldDelta(safe, 1)).toBe(0.4);
    const gain: TacticalChoice = { ...safe, timeDelta: -0.7 };
    expect(resolveFieldDelta(gain, 0)).toBe(-0.7);
  });

  it('charges a field choice by how far the edge falls short of the send line', () => {
    expect(resolveFieldDelta(boldCall, EDGE_SEND)).toBe(0); // read it right: free
    expect(resolveFieldDelta(boldCall, 1)).toBe(0); // a screaming edge is still free
    expect(resolveFieldDelta(boldCall, 0)).toBeCloseTo(0.6 * EDGE_SEND, 6);
    expect(resolveFieldDelta(boldCall, -0.25)).toBeCloseTo(0.6 * (EDGE_SEND + 0.25), 6);
    // Monotone: a better edge never costs more.
    let prev = Infinity;
    for (let e = -1; e <= 1; e += 0.1) {
      const cost = resolveFieldDelta(boldCall, e);
      expect(cost).toBeLessThanOrEqual(prev + 1e-9);
      prev = cost;
    }
  });
});

describe('applyDecision → typed resolution (edge × bungle × field)', () => {
  beforeEach(() => setRng(mulberry32(11)));

  it('bold + genuine edge + clean hands: paid off, banked the shift', () => {
    const s = baseState({ windField: shiftingField(START.lat, START.lon) });
    setRng(() => 0.999); // no bungle
    const out = applyDecision(s, boldCall);
    expect(out.resolution).toBeDefined();
    expect(out.resolution!.outcome).toBe('bold');
    expect(out.resolution!.paidOff).toBe(true);
    expect(out.resolution!.bungled).toBe(false);
    expect(out.resolution!.lostHours).toBeCloseTo(0, 5);
    expect(out.resolution!.summary).toBe('Read it right — you banked the shift.');
    expect(out.log).toBe(out.resolution!.summary);
  });

  it('bold + flat field + clean hands: a phantom corner that costs real time', () => {
    const s = baseState({ windField: flatField(START.lat, START.lon) });
    setRng(() => 0.999);
    const out = applyDecision(s, boldCall);
    expect(out.resolution!.outcome).toBe('bold');
    expect(out.resolution!.paidOff).toBe(false);
    expect(out.resolution!.bungled).toBe(false);
    expect(out.resolution!.lostHours).toBeGreaterThan(0.05);
    expect(out.resolution!.summary).toMatch(/^Phantom corner — the breeze never came/);
  });

  it('a bungled sail-handling call names the hands that fumbled it', () => {
    const kite: TacticalChoice = { ...boldCall, id: 'k', risk: 0.4, crewSkill: 'Bowman' };
    const s = baseState({ windField: flatField(START.lat, START.lon) });
    setRng(() => 0); // force the bungle
    const out = applyDecision(s, kite);
    expect(out.resolution!.bungled).toBe(true);
    expect(out.resolution!.summary).toContain('the bowman fumbled the change');
    expect(out.resolution!.lostHours).toBeGreaterThan(0.1);
  });

  it('safe and hedge non-field calls classify by authored risk and keep the label line', () => {
    const safe: TacticalChoice = { ...boldCall, id: 's', field: false, timeDelta: 0.3, risk: 0.05 };
    const hedge: TacticalChoice = { ...boldCall, id: 'h', field: false, timeDelta: -0.2, risk: 0.2 };
    setRng(() => 0.999);
    const a = applyDecision(baseState(), safe);
    setRng(() => 0.999);
    const b = applyDecision(baseState(), hedge);
    expect(a.resolution!.outcome).toBe('safe');
    expect(a.resolution!.summary).toBe('Send it.');
    expect(b.resolution!.outcome).toBe('hedge');
    expect(b.resolution!.bungled).toBe(false);
  });
});

describe('the honest preview band (item 1)', () => {
  const fieldEvent: GameEvent = {
    id: 'e-band',
    title: 't',
    prompt: 'p',
    kind: 'tactical',
    choices: [
      boldCall,
      { ...boldCall, id: 'test-safe', timeDelta: 0.3, field: false },
    ],
  };

  // The realised VMG over the same stretch the preview projects.
  function realisedVmg(state: GameState, lost: number): number {
    const race = getRaceById(state.selectedRaceId)!;
    const stretchNm = race.distanceNm / 12;
    const baseHours = Math.max(stretchNm / speedMadeGood(state), 0.2);
    return stretchNm / Math.max(baseHours + lost, 0.2);
  }

  it('brackets the realised outcome, whatever the field says', () => {
    const fields = [
      shiftingField(START.lat, START.lon),
      flatField(START.lat, START.lon),
      createWindField(getRaceById('race-round-island')!),
    ];
    fields.forEach((windField, i) => {
      setRng(mulberry32(100 + i));
      const s = baseState({ windField });
      const preview = vmgPreview(s, fieldEvent);
      const band = preview.band![boldCall.id];
      expect(band).toBeDefined();
      expect(band.lo).toBeLessThanOrEqual(band.hi);
      [1, 2, 3, 4, 5].forEach((seed) => {
        setRng(mulberry32(seed));
        const out = applyDecision(s, boldCall);
        const lost = out.progress.elapsedHours - s.progress!.elapsedHours;
        const vmg = realisedVmg(s, lost);
        expect(vmg).toBeGreaterThanOrEqual(band.lo - 0.06);
        expect(vmg).toBeLessThanOrEqual(band.hi + 0.06);
      });
    });
  });

  it('a sharper Navigator projects a tighter band', () => {
    setRng(mulberry32(7));
    const field = createWindField(getRaceById('race-round-island')!);
    const strong = baseState({ windField: field, selectedCrewIds: ['crew-lindqvist'] }); // Navigator 94
    const weak = baseState({ windField: field, selectedCrewIds: ['crew-nolan'] }); // Navigator 55
    const strongBand = vmgPreview(strong, fieldEvent).band![boldCall.id];
    const weakBand = vmgPreview(weak, fieldEvent).band![boldCall.id];
    expect(strongBand.hi - strongBand.lo).toBeLessThan(weakBand.hi - weakBand.lo);
    expect(vmgPreview(strong, fieldEvent).confidence!).toBeGreaterThan(
      vmgPreview(weak, fieldEvent).confidence!
    );
  });

  it('non-field choices keep the exact authored projection', () => {
    setRng(mulberry32(8));
    const s = baseState();
    const preview = vmgPreview(s, fieldEvent);
    const race = getRaceById(s.selectedRaceId)!;
    const stretchNm = race.distanceNm / 12;
    const baseHours = Math.max(stretchNm / speedMadeGood(s), 0.2);
    const expected = Math.round((stretchNm / Math.max(baseHours + 0.3, 0.2)) * 10) / 10;
    expect(preview.after['test-safe']).toBe(expected);
    expect(preview.band?.['test-safe']).toBeUndefined();
  });

  it('spells out the downside in hours and words, never raw integers', () => {
    setRng(mulberry32(9));
    const s = baseState();
    const kite: TacticalChoice = { ...boldCall, id: 'k', risk: 0.25, crewSkill: 'Bowman' };
    const line = choiceDownside(s, kite);
    expect(line).toMatch(/^If it goes wrong: ~\+\d+(\.\d+)?h/);
    expect(line).toContain('risks the sail change');
    expect(line).not.toMatch(/Hull -?\d/);
    // A becalmed, risk-free call has nothing to warn about.
    const calm: TacticalChoice = {
      id: 'c', label: 'c', description: '', timeDelta: 0, staminaDelta: 0,
      moraleDelta: 0, hullDelta: 0, risk: 0,
    };
    expect(choiceDownside(s, calm)).toBe('Little to go wrong.');
  });
});

describe('crew-role interplay (item 2)', () => {
  it('roleSkill reads the signed specialist and falls back to the crew average', () => {
    expect(roleSkill(['crew-nakamura'], 'Tactician')).toBe(90);
    expect(roleSkill(['crew-vega'], 'Tactician')).toBe(92); // no tactician → general nous
  });

  it('a strong Tactician softens a misread bold call — and only that', () => {
    setRng(mulberry32(4));
    const field = flatField(START.lat, START.lon);
    const strong = baseState({ windField: field, selectedCrewIds: ['crew-nakamura'] }); // 90
    const weak = baseState({ windField: field, selectedCrewIds: ['crew-byrne'] }); // 68
    // Misread field call: the strong tactician gives time back.
    setRng(() => 0.999);
    const a = applyDecision(strong, boldCall);
    setRng(() => 0.999);
    const b = applyDecision(weak, boldCall);
    const lostA = a.progress.elapsedHours - strong.progress!.elapsedHours;
    const lostB = b.progress.elapsedHours - weak.progress!.elapsedHours;
    expect(lostA).toBeLessThan(lostB);
    expect(lostA).toBeGreaterThan(0); // forgiveness, not immunity
    // A paid-off bold call is free for both — nothing to forgive.
    const shifting = shiftingField(START.lat, START.lon);
    setRng(() => 0.999);
    const c = applyDecision({ ...strong, windField: shifting }, boldCall);
    setRng(() => 0.999);
    const d = applyDecision({ ...weak, windField: shifting }, boldCall);
    expect(c.progress.elapsedHours - strong.progress!.elapsedHours).toBeCloseTo(
      d.progress.elapsedHours - weak.progress!.elapsedHours,
      6
    );
    // A non-field choice is untouched by the tactician.
    const safe: TacticalChoice = { ...boldCall, id: 's', field: false, timeDelta: 0.4 };
    setRng(() => 0.999);
    const e = applyDecision(strong, safe);
    setRng(() => 0.999);
    const f = applyDecision(weak, safe);
    expect(e.progress.elapsedHours - strong.progress!.elapsedHours).toBeCloseTo(
      f.progress.elapsedHours - weak.progress!.elapsedHours,
      6
    );
    // And the forgiveness itself is capped well short of half.
    expect(misreadForgiveness(['crew-nakamura'])).toBeLessThanOrEqual(0.35 + 1e-9);
  });

  it('a strong Bowman steadies tagged sail-handling calls only', () => {
    // Two crews with the SAME average skill (68.5) so the long-standing
    // crew-average relief cancels — only the Bowman differs. Both share one
    // wind field so the weather (and the skipper's weather factor) match.
    setRng(mulberry32(5));
    const windField = createWindField(getRaceById('race-round-island')!);
    const strongBow = ['crew-mensah', 'crew-foster']; // Bowman 85, Tactician 52
    const weakBow = ['crew-petrov', 'crew-griffiths']; // Bowman 64, Tactician 73
    const tagged: TacticalChoice = { ...boldCall, id: 'k', field: false, risk: 0.3, crewSkill: 'Bowman' };
    const untagged: TacticalChoice = { ...tagged, id: 'u', crewSkill: undefined };
    const a = baseState({ selectedCrewIds: strongBow, windField });
    const b = baseState({ selectedCrewIds: weakBow, windField });
    expect(decisionBungleChance(a, tagged)).toBeLessThan(decisionBungleChance(b, tagged));
    expect(decisionBungleChance(a, untagged)).toBeCloseTo(decisionBungleChance(b, untagged), 9);
    // The lower odds are realised: a threshold-straddling roll bungles only the weak bow.
    const mid = (decisionBungleChance(a, tagged) + decisionBungleChance(b, tagged)) / 2;
    setRng(() => mid);
    const outA = applyDecision(a, tagged);
    setRng(() => mid);
    const outB = applyDecision(b, tagged);
    expect(outA.resolution!.bungled).toBe(false);
    expect(outB.resolution!.bungled).toBe(true);
  });

  it('the Skipper trims risk only when the weather bites', () => {
    const gale = weatherFromWind({ fromDeg: 200, speedKn: 34 });
    const calm = weatherFromWind({ fromDeg: 200, speedKn: 8 });
    const choice: TacticalChoice = { ...boldCall, id: 'r', field: false, risk: 0.3 };
    const strong = ['crew-vega']; // Skipper 92
    const weak = ['crew-park']; // Skipper 65
    const gapIn = (weather: typeof gale): number =>
      decisionBungleChance(baseState({ selectedCrewIds: weak, weather }), choice) -
      decisionBungleChance(baseState({ selectedCrewIds: strong, weather }), choice);
    // The strong skipper's extra relief over the weak one grows with the weather
    // (the crew-average gap is constant, so the difference isolates the skipper).
    expect(gapIn(gale)).toBeGreaterThan(gapIn(calm));
  });

  it('the relief cap holds: a dream team never drops below half the authored risk', () => {
    setRng(mulberry32(6));
    const dream = baseState({
      selectedCrewIds: ['crew-vega', 'crew-lindqvist', 'crew-nakamura', 'crew-hassan', 'crew-mensah'],
      provisions: [
        { provisionId: 'prov-safety', quantity: 3 },
        { provisionId: 'prov-medkit', quantity: 3 },
        { provisionId: 'prov-water', quantity: 2 },
      ],
    });
    const tagged: TacticalChoice = { ...boldCall, id: 'k', field: false, risk: 0.3, crewSkill: 'Bowman' };
    expect(decisionBungleChance(dream, tagged)).toBeGreaterThanOrEqual(0.15 - 1e-9);
    expect(decisionBungleChance(dream, tagged)).toBeCloseTo(0.15, 9); // the floor binds
  });
});

describe('edge decay on late commits (item 3)', () => {
  it('decays smoothly with distance past the trigger', () => {
    expect(edgeDecay(0, 500)).toBe(1);
    expect(edgeDecay(-5, 500)).toBe(1); // never amplifies
    let prev = 1;
    for (let d = 5; d <= 200; d += 5) {
      const k = edgeDecay(d, 500);
      expect(k).toBeLessThan(prev);
      prev = k;
    }
    expect(edgeDecay(400, 500)).toBeLessThan(0.05);
  });

  it('a late commit is worth less than an immediate one, deterministically', () => {
    const field = shiftingField(START.lat, START.lon);
    const fresh = baseState({ windField: field });
    fresh.progress = { ...fresh.progress!, decisionTriggerNm: fresh.progress!.distanceCoveredNm };
    const stale = baseState({ windField: field });
    stale.progress = {
      ...stale.progress!,
      decisionTriggerNm:
        stale.progress!.distanceCoveredNm - stale.progress!.totalDistanceNm * 0.2,
    };
    expect(effectiveTacticalEdge(fresh)).toBeGreaterThan(effectiveTacticalEdge(stale));

    setRng(() => 0.999);
    const now = applyDecision(fresh, boldCall);
    setRng(() => 0.999);
    const late = applyDecision(stale, boldCall);
    const lostNow = now.progress.elapsedHours - fresh.progress!.elapsedHours;
    const lostLate = late.progress.elapsedHours - stale.progress!.elapsedHours;
    expect(lostNow).toBeCloseTo(0, 5); // the genuine shift, taken at once, is free
    expect(lostLate).toBeGreaterThan(lostNow + 0.05); // the moment passed
    // Replays identically.
    setRng(() => 0.999);
    const again = applyDecision(stale, boldCall);
    expect(again.progress.elapsedHours).toBeCloseTo(late.progress.elapsedHours, 9);
  });

  it('resolving a decision spends the trigger point', () => {
    setRng(mulberry32(2));
    const s = baseState();
    s.progress = { ...s.progress!, decisionTriggerNm: s.progress!.distanceCoveredNm };
    setRng(() => 0.999);
    const out = applyDecision(s, boldCall);
    expect(out.progress.decisionTriggerNm).toBeUndefined();
  });
});

describe('chained decisions (item 4)', () => {
  const reefChoice: TacticalChoice = {
    id: 'r',
    label: 'Tuck a reef in',
    description: '',
    timeDelta: 0.5,
    staminaDelta: -2,
    moraleDelta: 1,
    hullDelta: -1,
    risk: 0.06,
    crewSkill: 'Bowman',
    sets: 'reefed',
  };

  it('a choice that sets a situation opens a distance-bounded window on progress', () => {
    setRng(mulberry32(3));
    const s = baseState();
    setRng(() => 0.999);
    const out = applyDecision(s, reefChoice);
    expect(out.progress.pendingSituation).toBeDefined();
    expect(out.progress.pendingSituation!.key).toBe('reefed');
    expect(out.progress.pendingSituation!.expiresAtNm).toBeGreaterThan(
      out.progress.distanceCoveredNm
    );
  });

  it('stepRace draws the matching follow-on while the situation is live, and consumes it', () => {
    setRng(mulberry32(9));
    const race = getRaceById('race-round-island')!;
    const s = baseState();
    s.progress = {
      ...s.progress!,
      nextDecisionAtNm: 0, // force a decision this tick
      pendingSituation: { key: 'reefed', expiresAtNm: s.progress!.totalDistanceNm },
    };
    setRng(() => 0.5); // deterministic: no MOB (0.5 ≥ 0.08), single-candidate pick
    const out = stepRace(s, defaultStepNm(race));
    expect(out.event).not.toBeNull();
    expect(out.event!.id).toBe('evt-fo-shakeout');
    expect(out.event!.followsFrom).toBe('reefed');
    expect(out.progress.pendingSituation).toBeUndefined(); // the beat is spent
    expect(out.progress.decisionTriggerNm).toBeCloseTo(out.progress.distanceCoveredNm, 6);
  });

  it('an expired situation is cleared and never fires its follow-on', () => {
    setRng(mulberry32(9));
    const race = getRaceById('race-round-island')!;
    const s = baseState();
    s.progress = {
      ...s.progress!,
      nextDecisionAtNm: 0,
      pendingSituation: { key: 'reefed', expiresAtNm: 0.01 }, // already astern
    };
    setRng(() => 0.5);
    const out = stepRace(s, defaultStepNm(race));
    expect(out.progress.pendingSituation).toBeUndefined();
    expect(out.event?.followsFrom).toBeUndefined();
  });

  it('the pending situation survives the save round-trip (progress persists wholesale)', () => {
    const s = baseState();
    s.progress = {
      ...s.progress!,
      decisionTriggerNm: 12.5,
      pendingSituation: { key: 'big-kite', expiresAtNm: 99 },
    };
    const revived = JSON.parse(JSON.stringify(s)) as GameState;
    expect(revived.progress!.pendingSituation).toEqual({ key: 'big-kite', expiresAtNm: 99 });
    expect(revived.progress!.decisionTriggerNm).toBe(12.5);
  });
});
