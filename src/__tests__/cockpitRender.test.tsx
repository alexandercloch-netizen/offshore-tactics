import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { setMockWindowDimensions } from '../testing/mockReactNative';
import RaceCockpit, { cockpitLayout } from '../components/cockpit/RaceCockpit';
import StatusRibbon from '../components/cockpit/StatusRibbon';
import InstrumentBand from '../components/cockpit/InstrumentBand';
import ControlDock from '../components/cockpit/ControlDock';
import DecisionDock from '../components/cockpit/DecisionDock';
import RouteMap from '../components/RouteMap';
import { buildPrimaryCells } from '../components/cockpit/cells';
import { buildInstrumentReport } from '../engine/instruments';
import { WeatherOutlook } from '../engine/wind';
import {
  BoatCondition,
  GameEvent,
  RaceProgress,
  VmgPreview,
  Waypoint,
} from '../types';

// ---------------------------------------------------------------------------
// Structural render tests: the cockpit TREE keeps its promises — the chart
// lives outside every scroll container, no Modal exists during a decision,
// the band is exactly six cells on one line at both reference phone sizes,
// the band is byte-identical idle vs docked, and the sim-hold surface (the
// HELD pill) is raised for a man overboard ONLY — every other docked mode is
// a live opportunity the race sails on through.
// ---------------------------------------------------------------------------

const WAYPOINTS: Waypoint[] = [
  { name: 'Start', lat: 50.76, lon: -1.3, type: 'start' },
  { name: 'Mark', lat: 50.66, lon: -1.6, type: 'mark' },
  { name: 'Finish', lat: 50.76, lon: -1.28, type: 'finish' },
];

const condition: BoatCondition = { hullIntegrity: 90, crewStamina: 80, crewMorale: 75 };
const outlook: WeatherOutlook = {
  nowKn: 14,
  soonKn: 15,
  peakKn: 15,
  trend: 'steady',
  warn: false,
  headline: 'Moderate breeze',
  lookaheadH: 2,
};

const progress = {
  distanceCoveredNm: 20,
  totalDistanceNm: 60,
  windDir: 225,
  windSpeedKn: 14,
  heading: 260,
  pointOfSail: 'Reach',
  position: 5,
  legStartNm: 10,
  readings: [
    { atNm: 10, hours: 1.2, windDir: 220, windSpeedKn: 13, speedKn: 7.2, position: 6 },
    { atNm: 20, hours: 2.4, windDir: 225, windSpeedKn: 14, speedKn: 7.6, position: 5 },
  ],
} as unknown as RaceProgress;

const report = buildInstrumentReport(progress, condition, 30, outlook, {
  targetKn: 8,
  vmcKn: 6.1,
  activeSail: {
    id: undefined,
    name: 'Working Sails',
    isWorking: true,
    coverage: 1,
    changes: 0,
    fumbled: 0,
  },
});

const EVENT: GameEvent = {
  id: 'evt-test',
  title: 'A test of nerve',
  prompt: 'The breeze is shifting.',
  kind: 'tactical',
  choices: [
    {
      id: 'a',
      label: 'Send it',
      description: 'Tack out to the shift.',
      timeDelta: -0.4,
      staminaDelta: 0,
      moraleDelta: 0,
      hullDelta: 0,
      risk: 0.05,
      field: true,
    },
    {
      id: 'b',
      label: 'Hold the line',
      description: 'Stay on the routed track.',
      timeDelta: 0.2,
      staminaDelta: 0,
      moraleDelta: 0,
      hullDelta: 0,
      risk: 0.02,
    },
  ],
};

const VMG: VmgPreview = {
  before: 6.2,
  after: { a: 6.5, b: 6.0 },
  band: { a: { lo: 6.1, hi: 6.9 } },
  confidence: 0.9,
  downside: { a: 'If it goes wrong: ~+0.3h', b: 'Little to go wrong.' },
};

// A man overboard — the ONE event that still holds the sim.
const MOB_EVENT: GameEvent = {
  ...EVENT,
  id: 'evt-mob-test',
  title: 'MAN OVERBOARD',
  kind: 'mob',
  choices: EVENT.choices.map((c) => ({ ...c, field: false })),
};

interface MountOptions {
  width: number;
  height: number;
  docked: boolean;
  mob?: boolean; // dock the MOB emergency instead of an everyday call
}

// Assemble the cockpit exactly as the screen wires it (chart render-prop with
// a real RouteMap, band from buildPrimaryCells, dock replacing controls). The
// screen raises `held` for ANY docked decision (the watch stops while a call
// is on the table) and withholds the dismiss for a MOB only.
function mountCockpit({ width, height, docked, mob = false }: MountOptions): ReactTestRenderer {
  setMockWindowDimensions(width, height);
  const layout = cockpitLayout(width, height, docked);
  const cells = buildPrimaryCells(report);
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <RaceCockpit
        layout={layout}
        ribbon={<StatusRibbon raceName="Test Race" elapsed="2h 24m" standing="5th · +0:42 to Rán" />}
        chart={(w, h) => (
          <RouteMap waypoints={WAYPOINTS} testID="race-chart" width={w - 18} height={h - 18} />
        )}
        band={<InstrumentBand cells={cells} onSailPress={() => undefined} />}
        controls={
          <ControlDock
            strategy={{ bias: 0, effort: 'cruise' }}
            onStrategy={() => undefined}
            onCallSailChange={() => undefined}
            onHelp={() => undefined}
            onOverflow={() => undefined}
            compact={!layout.rail}
          />
        }
        dock={
          docked ? (
            <DecisionDock
              mode="decision"
              reducedMotion
              maxHeight={layout.dockMaxHeight}
              event={mob ? MOB_EVENT : EVENT}
              vmg={VMG}
              read={{ edge: 0.4, shiftDeg: 8, buildKn: 2, reliable: 0.9, hint: 'worth the risk.' }}
              onChoice={() => undefined}
              onDismiss={mob ? undefined : () => undefined}
            />
          ) : undefined
        }
        progressPct={33}
        held={docked}
      />
    );
  });
  // Fire the stage measurement so the chart mounts (onLayout never fires in a
  // node renderer).
  const stage = tree.root.findByProps({ testID: 'chart-stage' });
  act(() => {
    (stage.props as { onLayout: (e: unknown) => void }).onLayout({
      nativeEvent: { layout: { width, height: 360, x: 0, y: 0 } },
    });
  });
  return tree;
}

function ancestors(node: ReactTestInstance): ReactTestInstance[] {
  const out: ReactTestInstance[] = [];
  let p = node.parent;
  while (p) {
    out.push(p);
    p = p.parent;
  }
  return out;
}

afterEach(() => {
  setMockWindowDimensions(375, 667);
});

describe('the cockpit tree', () => {
  it('mounts the chart OUTSIDE every scroll container, docked or not', () => {
    for (const docked of [false, true]) {
      const tree = mountCockpit({ width: 390, height: 844, docked });
      const chart = tree.root.findByProps({ testID: 'race-chart' });
      const scrollAncestors = ancestors(chart).filter((a) => (a.type as unknown) === 'ScrollView');
      expect(scrollAncestors).toHaveLength(0);
      tree.unmount();
    }
  });

  it('renders NO Modal while a decision is docked (the lane compresses, never covers)', () => {
    const tree = mountCockpit({ width: 390, height: 844, docked: true });
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0);
    // The decision itself is present and drivable.
    expect(tree.root.findAllByProps({ testID: 'decision-choice' }).length).toBeGreaterThanOrEqual(2);
    tree.unmount();
  });

  it('keeps exactly six cells on one non-wrapping line at 375×667 and 390×844, dock open', () => {
    for (const [w, h] of [
      [375, 667],
      [390, 844],
    ] as const) {
      const tree = mountCockpit({ width: w, height: h, docked: true });
      const cells = tree.root
        .findAllByProps({ testID: 'instrument-cell' })
        .filter((n) => typeof n.type === 'string'); // host nodes only, not composites
      expect(cells).toHaveLength(6);
      const band = tree.root.findAllByProps({ testID: 'instrument-band' }).find((n) => typeof n.type === 'string')!;
      const style = band.props.style as { flexDirection?: string; flexWrap?: string };
      expect(style.flexDirection).toBe('row');
      expect(style.flexWrap).toBe('nowrap');
      tree.unmount();
    }
  });

  it('shows identical band labels idle vs docked', () => {
    const labelsAt = (docked: boolean): string[] => {
      const tree = mountCockpit({ width: 390, height: 844, docked });
      const cells = tree.root
        .findAllByProps({ testID: 'instrument-cell' })
        .filter((n) => typeof n.type === 'string');
      const labels = cells.map((c) => {
        const texts = c.findAllByType('Text' as never);
        const last = texts[texts.length - 1] as unknown as ReactTestInstance;
        return String(last.props.children);
      });
      tree.unmount();
      return labels;
    };
    expect(labelsAt(false)).toEqual(labelsAt(true));
  });

  it('holds the chart floor in the stage style (snap, not animation)', () => {
    for (const docked of [false, true]) {
      const tree = mountCockpit({ width: 390, height: 844, docked });
      const stage = tree.root.findByProps({ testID: 'chart-stage' });
      const styles = Array.isArray(stage.props.style) ? stage.props.style : [stage.props.style];
      const minHeight = styles.reduce(
        (acc: number | undefined, s: { minHeight?: number } | null) => s?.minHeight ?? acc,
        undefined
      );
      expect(minHeight).toBe(docked ? 260 : 300);
      tree.unmount();
    }
  });

  it('raises the HELD pill whenever a decision is docked — the watch stops for a key call', () => {
    const idle = mountCockpit({ width: 390, height: 844, docked: false });
    expect(idle.root.findAllByProps({ testID: 'held-pill' })).toHaveLength(0);
    idle.unmount();
    // Any docked decision stops the watch and says so.
    const held = mountCockpit({ width: 390, height: 844, docked: true });
    expect(held.root.findAllByProps({ testID: 'held-pill' }).length).toBeGreaterThan(0);
    held.unmount();
    const mob = mountCockpit({ width: 390, height: 844, docked: true, mob: true });
    expect(mob.root.findAllByProps({ testID: 'held-pill' }).length).toBeGreaterThan(0);
    mob.unmount();
  });

  it('offers "hold course" on a held decision but never on a MOB, and shows no edge bar', () => {
    // A docked everyday call is dismissable (the moment can be waved off); the
    // edge bar is gone — the watch stops under the cards, so the edge cannot
    // drain and a static "fading" bar would lie.
    const held = mountCockpit({ width: 390, height: 844, docked: true });
    expect(held.root.findAllByProps({ testID: 'decision-dismiss' }).length).toBeGreaterThan(0);
    expect(held.root.findAllByProps({ testID: 'edge-fade' })).toHaveLength(0);
    held.unmount();
    // A MOB demands an answer: no dismiss.
    const mob = mountCockpit({ width: 390, height: 844, docked: true, mob: true });
    expect(mob.root.findAllByProps({ testID: 'decision-dismiss' })).toHaveLength(0);
    expect(mob.root.findAllByProps({ testID: 'edge-fade' })).toHaveLength(0);
    mob.unmount();
  });

  it('rails on a landscape phone (844×390) and keeps the chart full height', () => {
    const tree = mountCockpit({ width: 844, height: 390, docked: true });
    // Rail mode: the dock fills the rail, the chart column carries no dock.
    expect(cockpitLayout(844, 390, true).rail).toBe(true);
    const chart = tree.root.findByProps({ testID: 'race-chart' });
    expect(ancestors(chart).filter((a) => (a.type as unknown) === 'ScrollView')).toHaveLength(0);
    tree.unmount();
  });
});

describe('the debrief ribbon auto-continue', () => {
  it('runs on an independent setTimeout — never a tick-driven timer', () => {
    jest.useFakeTimers();
    const onDismiss = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DecisionDock
          mode="debrief"
          reducedMotion
          maxHeight={300}
          debrief={{ summary: 'Read it right — you banked the shift.', glyph: '✓' }}
          onDismiss={onDismiss}
        />
      );
    });
    // No ticks ever fire (the sim is held) — the ribbon must still move on.
    act(() => {
      jest.advanceTimersByTime(7000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    tree.unmount();
    jest.useRealTimers();
  });
});

describe('the sail picker lane', () => {
  it('routes through the same dock with drivable sail-change rows', () => {
    const onPick = jest.fn();
    const onDismiss = jest.fn();
    let tree!: ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DecisionDock
          mode="sail"
          reducedMotion
          maxHeight={300}
          sailOptions={[
            {
              sail: {
                id: 'working-jib',
                name: 'Working Sails',
                category: 'headsail',
                blurb: 'The boat as rated',
                twaMin: 0,
                twaMax: 180,
                twsMin: 0,
                twsMax: 99,
                boost: 0,
                baseCost: 0,
              },
              current: true,
              recommended: false,
              coverage: 1,
              minutes: 2,
            },
            {
              sail: {
                id: 'code-zero',
                name: 'Code 0',
                category: 'reacher',
                blurb: 'Close reaching',
                twaMin: 55,
                twaMax: 110,
                twsMin: 4,
                twsMax: 13,
                boost: 0.08,
                baseCost: 6000,
              },
              current: false,
              recommended: true,
              coverage: 0.9,
              minutes: 3,
            },
          ]}
          onSailPick={onPick}
          onDismiss={onDismiss}
        />
      );
    });
    const rows = tree.root
      .findAllByProps({ testID: 'sail-change-choice' })
      .filter((n) => typeof n.type === 'string');
    expect(rows).toHaveLength(2);
    // Picking the specialist commits it; tapping the flying sail dismisses.
    act(() => rows.find((r) => String(r.props.accessibilityLabel).includes('Code 0'))!.props.onPress());
    expect(onPick).toHaveBeenCalledWith('code-zero');
    act(() => rows.find((r) => String(r.props.accessibilityLabel).includes('Working'))!.props.onPress());
    expect(onDismiss).toHaveBeenCalled();
    tree.unmount();
  });
});
