import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import HarbourDashboard from '../components/harbour/HarbourDashboard';
import { BoardConditions, seasonalBoardConditions } from '../engine/sailNow';
import { LiveFlowGrid } from '../services/weather';
import { WORLD_LATTICE_CELLS, WORLD_LATTICE_COLS, WORLD_LATTICE_ROWS } from '../data/worldLattice';
import { REGION_BOUNDS } from '../data/worldmap';
import { RegionKey } from '../components/harbour/regions';

// The Harbour's painted weather: the world chart carries a wash on BOTH rungs
// (live lattice / baked climatology) but flies particles only when live —
// motion means live; every painted chart names its source on-chart; the 500 km
// gate keeps IDW honest (uk blends, usWest shows vanes only); and the whole
// two-pane spread stays inside the SVG node budget. All structural: these run
// against the src/testing mocks with no rAF at all, which is itself the
// contract — no rAF must mean still streamlets, never a blank ocean.

const NOW = new Date(2026, 5, 15, 12).getTime(); // June
const FETCHED_AT = new Date(2026, 5, 15, 14, 5).getTime(); // "as of 14:05"

// A live world lattice: every cell a brisk sou'wester.
const worldFlowFixture: LiveFlowGrid = {
  cells: WORLD_LATTICE_CELLS.map((c) => ({ lat: c.lat, lon: c.lon, dirDeg: 225, speedKn: 16 })),
  cols: WORLD_LATTICE_COLS,
  rows: WORLD_LATTICE_ROWS,
  fetchedAt: FETCHED_AT,
};

// A live per-region lattice over the UK box (the 6×5 grid fetchRegionFlow uses).
function regionFlowFixture(region: RegionKey, cols = 6, rows = 5): LiveFlowGrid {
  const b = REGION_BOUNDS[region];
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    const lat = b.maxLat + ((b.minLat - b.maxLat) * r) / (rows - 1);
    for (let c = 0; c < cols; c += 1) {
      const lon = b.minLon + ((b.maxLon - b.minLon) * c) / (cols - 1);
      cells.push({ lat, lon, dirDeg: 250, speedKn: 18 });
    }
  }
  return { cells, cols, rows, fetchedAt: FETCHED_AT };
}

function liveConditions(): BoardConditions {
  return { ...seasonalBoardConditions(), source: 'live', fetchedAt: FETCHED_AT };
}

interface MountProps {
  conditions?: BoardConditions;
  worldFlow?: LiveFlowGrid | null;
  regionFlows?: Partial<Record<RegionKey, LiveFlowGrid>>;
  onRegionView?: (region: RegionKey) => void;
  twoPane?: boolean;
  width?: number;
}

function mount(props: MountProps = {}): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <HarbourDashboard
        history={[]}
        conditions={props.conditions ?? seasonalBoardConditions()}
        now={NOW}
        recommendedId="race-round-island"
        worldFlow={props.worldFlow}
        regionFlows={props.regionFlows}
        onRegionView={props.onRegionView}
        onEnterRace={() => undefined}
        width={props.width ?? 350}
        twoPane={props.twoPane}
        rightWidth={props.twoPane ? 480 : undefined}
      />
    );
  });
  return tree;
}

function byTestID(root: ReactTestInstance, testID: string): ReactTestInstance[] {
  return root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
}

function press(node: ReactTestInstance): void {
  act(() => {
    node.props.onPress();
  });
}

// The row-wash gradients of one chart (its id carries the wc-flow prefix).
function washGradients(chart: ReactTestInstance): ReactTestInstance[] {
  return chart.findAll(
    (n) =>
      (n.type as unknown) === 'LinearGradient' &&
      typeof n.props.id === 'string' &&
      n.props.id.includes('wc-flow')
  );
}

function chipText(root: ReactTestInstance, chartID: string): string {
  const chip = byTestID(root, `${chartID}-provenance`);
  expect(chip).toHaveLength(1);
  const texts = chip[0].findAllByType('Text' as never);
  return texts.map((t) => t.props.children).join('');
}

// The unlabelled station vanes of a chart: rotated Gs (locked pins excluded by
// opacity assertions where relevant).
function vanes(chart: ReactTestInstance): ReactTestInstance[] {
  return chart.findAll(
    (n) =>
      (n.type as unknown) === 'G' &&
      typeof n.props.transform === 'string' &&
      n.props.transform.includes('rotate') &&
      n.props.opacity !== undefined
  );
}

beforeEach(() => {
  // The contract under test includes "no rAF": streamlets, not a blank sea.
  expect(typeof requestAnimationFrame).toBe('undefined');
});

describe('the world chart paints the ocean', () => {
  it('live flow: full-lattice wash + flow marks, stamped ECMWF as-of', () => {
    const tree = mount({ conditions: liveConditions(), worldFlow: worldFlowFixture });
    const chart = byTestID(tree.root, 'world-chart')[0];
    // One gradient per lattice row — the wash IS the fetched grid.
    expect(washGradients(chart)).toHaveLength(WORLD_LATTICE_ROWS);
    expect(washGradients(chart)[0].findAllByType('Stop' as never)).toHaveLength(WORLD_LATTICE_COLS);
    // Live means motion; with no rAF that honestly degrades to streamlets.
    const still = byTestID(chart, 'flow-streamlets');
    expect(still).toHaveLength(1);
    const streamletPaths = still[0].findAllByType('Path' as never);
    expect(streamletPaths.length).toBeGreaterThan(0);
    for (const p of streamletPaths) expect(p.props.d.length).toBeGreaterThan(0);
    expect(chipText(tree.root, 'world-chart')).toBe('ECMWF · as of 14:05');
  });

  it('seasonal: the baked monthly wash, vanes only, NO particle swarm', () => {
    const tree = mount(); // no worldFlow, seasonal board
    const chart = byTestID(tree.root, 'world-chart')[0];
    expect(washGradients(chart)).toHaveLength(WORLD_LATTICE_ROWS);
    // Motion means live: a seasonal wash holds perfectly still.
    expect(byTestID(chart, 'flow-streamlets')).toHaveLength(0);
    expect(byTestID(chart, 'flow-swarm')).toHaveLength(0);
    expect(vanes(chart).length).toBeGreaterThanOrEqual(7);
    expect(chipText(tree.root, 'world-chart')).toBe('Seasonal pattern · ERA5 · June');
  });

  it('de-emphasises station vanes to 0.6 over the painted field', () => {
    const tree = mount();
    const chart = byTestID(tree.root, 'world-chart')[0];
    for (const vane of vanes(chart)) expect(vane.props.opacity).toBe(0.6);
  });
});

describe('the region ladder and the 500 km gate', () => {
  it('uk seasonal: the blended IDW wash, still, labelled indicative', () => {
    const tree = mount();
    press(byTestID(tree.root, 'world-chart-pin-uk')[0]);
    const chart = byTestID(tree.root, 'region-chart')[0];
    expect(washGradients(chart).length).toBeGreaterThan(0);
    expect(byTestID(chart, 'flow-streamlets')).toHaveLength(0);
    expect(byTestID(chart, 'flow-swarm')).toHaveLength(0);
    expect(chipText(tree.root, 'region-chart')).toBe('Seasonal · indicative');
  });

  it('usWest seasonal: vanes only — no wash across 4,700 km of Pacific', () => {
    const tree = mount();
    press(byTestID(tree.root, 'world-chart-pin-usWest')[0]);
    const chart = byTestID(tree.root, 'region-chart')[0];
    expect(washGradients(chart)).toHaveLength(0);
    expect(byTestID(chart, 'flow-streamlets')).toHaveLength(0);
    // Vanes speak at full strength on a bare chart (locked pins stay dimmer).
    const open = vanes(chart).filter((v) => v.props.opacity !== 0.35);
    expect(open.length).toBeGreaterThan(0);
    for (const vane of open) expect(vane.props.opacity).toBe(0.85);
    expect(chipText(tree.root, 'region-chart')).toBe('Seasonal · indicative');
  });

  it('uk with a live board: the IDW wash moves and is stamped as ECMWF', () => {
    const tree = mount({ conditions: liveConditions() });
    press(byTestID(tree.root, 'world-chart-pin-uk')[0]);
    const chart = byTestID(tree.root, 'region-chart')[0];
    expect(washGradients(chart).length).toBeGreaterThan(0);
    expect(byTestID(chart, 'flow-streamlets')).toHaveLength(1); // motion, degraded honestly
    expect(chipText(tree.root, 'region-chart')).toBe('ECMWF · as of 14:05');
  });

  it('a landed region lattice replaces the blend and keeps the live stamp', () => {
    const tree = mount({
      conditions: liveConditions(),
      regionFlows: { uk: regionFlowFixture('uk') },
    });
    press(byTestID(tree.root, 'world-chart-pin-uk')[0]);
    const chart = byTestID(tree.root, 'region-chart')[0];
    expect(washGradients(chart)).toHaveLength(5); // the lattice's rows, not the blend's 22
    expect(chipText(tree.root, 'region-chart')).toBe('ECMWF · as of 14:05');
  });

  it('drilling in asks the screen for that region exactly once per view', () => {
    const asked: RegionKey[] = [];
    const tree = mount({ onRegionView: (r) => asked.push(r) });
    press(byTestID(tree.root, 'world-chart-pin-usWest')[0]);
    expect(asked).toEqual(['usWest']);
  });
});

describe('the conditions hero climbs the same ladder', () => {
  it('seasonal home waters: still wash, indicative chip, legend beneath', () => {
    const tree = mount();
    const hero = byTestID(tree.root, 'harbour-hero')[0];
    const chart = byTestID(hero, 'hero-chart')[0];
    expect(washGradients(chart).length).toBeGreaterThan(0);
    expect(byTestID(chart, 'flow-streamlets')).toHaveLength(0);
    expect(byTestID(chart, 'flow-swarm')).toHaveLength(0);
    expect(chipText(tree.root, 'hero-chart')).toBe('Seasonal · indicative');
  });

  it('the home region lattice paints the hero live', () => {
    const tree = mount({
      conditions: liveConditions(),
      regionFlows: { uk: regionFlowFixture('uk') },
    });
    const chart = byTestID(tree.root, 'hero-chart')[0];
    expect(washGradients(chart)).toHaveLength(5);
    expect(byTestID(chart, 'flow-streamlets')).toHaveLength(1);
    expect(chipText(tree.root, 'hero-chart')).toBe('ECMWF · as of 14:05');
  });
});

describe('budgets and discipline', () => {
  const SVG_HOSTS = new Set([
    'Svg', 'Defs', 'G', 'Path', 'Rect', 'Stop', 'LinearGradient',
    'Circle', 'Line', 'Polygon', 'Polyline', 'ClipPath', 'SvgText',
  ]);

  it('keeps the worst-case two-pane render under 1,200 SVG host nodes', () => {
    // Both charts painted LIVE at desktop sizes — the heaviest honest frame.
    const tree = mount({
      conditions: liveConditions(),
      worldFlow: worldFlowFixture,
      regionFlows: { uk: regionFlowFixture('uk') },
      twoPane: true,
      width: 760,
    });
    const hosts = tree.root.findAll(
      (n) => typeof n.type === 'string' && SVG_HOSTS.has(n.type)
    );
    expect(hosts.length).toBeLessThanOrEqual(1200);
    // And it IS a painted spread, not an empty pass: the world wash alone
    // carries 13 gradients × 36 stops.
    expect(hosts.filter((n) => (n.type as unknown) === 'Stop').length).toBeGreaterThan(400);
  });

  it('never dials out: the dashboard is props-driven, fetch stays untouched', () => {
    const spy = jest.fn();
    const realFetch = global.fetch;
    global.fetch = spy as unknown as typeof fetch;
    try {
      const tree = mount({ conditions: liveConditions(), worldFlow: worldFlowFixture });
      press(byTestID(tree.root, 'world-chart-pin-uk')[0]);
      press(byTestID(tree.root, 'world-back')[0]);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      global.fetch = realFetch;
    }
  });
});
