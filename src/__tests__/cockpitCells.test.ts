import {
  buildPrimaryCells,
  formatTwa,
  healthTint,
  pctTargetTint,
  sailTint,
} from '../components/cockpit/cells';
import { cockpitLayout, CHART_MIN_DOCKED, CHART_MIN_IDLE } from '../components/cockpit/RaceCockpit';
import { buildInstrumentReport } from '../engine/instruments';
import { durations, MOTION, RIBBON_AUTO_CONTINUE_MS } from '../lib/motion';
import { status } from '../theme';
import { WeatherOutlook } from '../engine/wind';
import { BoatCondition, InstrumentReading, RaceProgress } from '../types';

// ---------------------------------------------------------------------------
// The band as data: the honesty rules are pure functions, tested as such.
// ---------------------------------------------------------------------------

const condition: BoatCondition = { hullIntegrity: 80, crewStamina: 70, crewMorale: 65 };
const outlook: WeatherOutlook = {
  nowKn: 15,
  soonKn: 16,
  peakKn: 16,
  trend: 'steady',
  warn: false,
  headline: 'Fresh breeze',
  lookaheadH: 2,
};

function reading(atNm: number, speedKn: number): InstrumentReading {
  return { atNm, hours: atNm / 8, windDir: 200, windSpeedKn: 15, speedKn, position: 3 };
}

function progressFixture(over: Partial<RaceProgress> = {}): RaceProgress {
  return {
    distanceCoveredNm: 110,
    totalDistanceNm: 200,
    windDir: 200,
    windSpeedKn: 15,
    heading: 245, // wind 45° off the port... 200-245 = -45 → starboard? see below
    pointOfSail: 'Reach',
    position: 3,
    legStartNm: 100,
    readings: [reading(100, 7), reading(110, 8)],
    ...over,
  } as unknown as RaceProgress;
}

describe('%TGT thresholds', () => {
  it('tints green ≥95, amber 85–94, red <85', () => {
    expect(pctTargetTint(100)).toBe(status.good);
    expect(pctTargetTint(95)).toBe(status.good);
    expect(pctTargetTint(94)).toBe(status.warn);
    expect(pctTargetTint(85)).toBe(status.warn);
    expect(pctTargetTint(84)).toBe(status.bad);
    expect(pctTargetTint(40)).toBe(status.bad);
  });
});

describe('SAIL cell tint', () => {
  it('reads by coverage: right sail neutral, marginal amber, wrong red', () => {
    expect(sailTint(false, 0.9)).toBeUndefined();
    expect(sailTint(false, 0.7)).toBe(status.warn);
    expect(sailTint(false, 0.3)).toBe(status.bad);
  });

  it('the working set is neutral — never red, whatever the moment', () => {
    expect(sailTint(true, 1)).toBeUndefined();
    expect(sailTint(true, 0)).toBeUndefined();
  });
});

describe('signed TWA', () => {
  it('formats with the tack suffix (positive = starboard)', () => {
    expect(formatTwa(52)).toBe('52°S');
    expect(formatTwa(-52)).toBe('52°P');
    expect(formatTwa(0)).toBe('0°');
    expect(formatTwa(180)).toBe('180°');
  });
});

describe('composite health chip', () => {
  it('takes the worst of hull/crew/morale at the existing thresholds', () => {
    expect(healthTint(80, 70, 65)).toBeUndefined();
    expect(healthTint(80, 59, 65)).toBe(status.warn);
    expect(healthTint(34, 90, 90)).toBe(status.bad);
  });
});

describe('buildInstrumentReport — the new pure derivations', () => {
  it('derives a signed TWA and passes the extras through', () => {
    const r = buildInstrumentReport(progressFixture(), condition, 20, outlook, {
      targetKn: 10,
      vmcKn: 6.4,
      tide: { rateKn: 1.2, along: -0.6 },
      activeSail: { id: 'code-zero', name: 'Code 0', isWorking: false, coverage: 0.8, changes: 2, fumbled: 1 },
    });
    // heading 245, wind FROM 200 → wind 45° off the port bow → negative.
    expect(r.now.twaDeg).toBe(-45);
    expect(r.now.targetKn).toBe(10);
    expect(r.now.vmcKn).toBe(6.4);
    expect(r.now.polarPct).toBe(80); // speed 8 (latest reading) of target 10
    expect(r.now.tide).toEqual({ rateKn: 1.2, along: -0.6 });
    expect(r.now.activeSail?.name).toBe('Code 0');
  });

  it('handles the guest/no-field path: extras absent, report still whole', () => {
    const r = buildInstrumentReport(progressFixture(), condition, 20, outlook);
    expect(r.now.tide).toBeUndefined();
    expect(r.now.activeSail).toBeUndefined();
    expect(r.now.targetKn).toBeUndefined();
    expect(r.now.polarPct).toBeUndefined();
    expect(Number.isFinite(r.now.twaDeg)).toBe(true);
  });

  it('the display report never re-enters game state (pure projection of its inputs)', () => {
    const p = progressFixture();
    const before = JSON.stringify(p);
    buildInstrumentReport(p, condition, 20, outlook, { targetKn: 9, vmcKn: 5 });
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('the primary band — exactly six cells, one home per number', () => {
  const report = buildInstrumentReport(progressFixture(), condition, 20, outlook, {
    targetKn: 10,
    vmcKn: 6.4,
    activeSail: { id: undefined, name: 'Working Sails', isWorking: true, coverage: 1, changes: 0, fumbled: 0 },
  });

  it('always yields the six fixed slots in order', () => {
    const cells = buildPrimaryCells(report);
    expect(cells.map((c) => c.id)).toEqual(['sog', 'vmc', 'tgt', 'twa', 'tws', 'sail']);
    expect(cells.map((c) => c.label)).toEqual(['SOG', 'VMC', '%TGT', 'TWA', 'TWS', 'SAIL']);
  });

  it('gives every live datum exactly one home (no value string repeats)', () => {
    const cells = buildPrimaryCells(report);
    const values = cells.map((c) => `${c.label}:${c.value}`);
    expect(new Set(values).size).toBe(values.length);
    // The honest relabels hold: no cell called "VMG", "Boat" or "Wind".
    expect(cells.some((c) => c.label === 'VMG' || c.label === 'Boat' || c.label === 'Wind')).toBe(false);
  });

  it('smooths %TGT through the passed rolling average', () => {
    const cells = buildPrimaryCells(report, 96.4);
    const tgt = cells.find((c) => c.id === 'tgt')!;
    expect(tgt.value).toBe('96');
    expect(tgt.tint).toBe(status.good);
  });

  it('carries the ⇄N badge on the SAIL cell', () => {
    const withChanges = buildInstrumentReport(progressFixture(), condition, 20, outlook, {
      activeSail: { id: 'code-zero', name: 'Code 0', isWorking: false, coverage: 0.9, changes: 3, fumbled: 1 },
    });
    const sail = buildPrimaryCells(withChanges).find((c) => c.id === 'sail')!;
    expect(sail.badge).toBe('⇄3');
    expect(sail.tint).toBeUndefined(); // right sail: neutral
  });
});

describe('the 2-D breakpoint rule and the chart floor', () => {
  it('rails when wide OR short; stacks only when narrow AND tall', () => {
    expect(cockpitLayout(1200, 800, false).rail).toBe(true); // desktop
    expect(cockpitLayout(844, 390, false).rail).toBe(true); // landscape phone (short!)
    expect(cockpitLayout(900, 700, false).rail).toBe(true); // boundary width
    expect(cockpitLayout(390, 844, false).rail).toBe(false); // phone portrait
    expect(cockpitLayout(375, 667, false).rail).toBe(false); // small phone portrait
    expect(cockpitLayout(768, 1024, false).rail).toBe(false); // tablet portrait
  });

  it('holds the hard chart floor: 260 docked, 300 idle', () => {
    expect(cockpitLayout(390, 844, true).chartMin).toBe(CHART_MIN_DOCKED);
    expect(cockpitLayout(390, 844, false).chartMin).toBe(CHART_MIN_IDLE);
    expect(CHART_MIN_DOCKED).toBe(260);
    expect(CHART_MIN_IDLE).toBe(300);
  });

  it('budgets the dock so the floor survives on both reference phones', () => {
    for (const [w, h] of [
      [375, 667],
      [390, 844],
    ] as const) {
      const l = cockpitLayout(w, h, true);
      expect(l.rail).toBe(false);
      // ribbon + band + floor + dock budget never exceeds the viewport.
      expect(44 + 56 + CHART_MIN_DOCKED + l.dockMaxHeight).toBeLessThanOrEqual(h);
    }
  });

  it('clamps the rail width like the retired sidebar did', () => {
    expect(cockpitLayout(1000, 800, false).railWidth).toBe(340);
    expect(cockpitLayout(2000, 900, false).railWidth).toBe(420);
    expect(cockpitLayout(920, 800, false).railWidth).toBe(320);
  });
});

describe('motion tokens', () => {
  it('publishes the full vocabulary', () => {
    expect(MOTION.enter).toBe(220);
    expect(MOTION.exit).toBe(160);
    expect(MOTION.mob).toBe(140);
    expect(MOTION.counterPop).toBe(200);
    expect(RIBBON_AUTO_CONTINUE_MS).toBeGreaterThanOrEqual(4000);
  });

  it('reduced motion collapses to a short cross-fade and snaps', () => {
    const d = durations(true);
    expect(d.enter).toBeLessThanOrEqual(120);
    expect(d.exit).toBeLessThanOrEqual(120);
    expect(d.counterPop).toBe(0);
    // Full motion untouched.
    expect(durations(false)).toEqual(MOTION);
  });
});
