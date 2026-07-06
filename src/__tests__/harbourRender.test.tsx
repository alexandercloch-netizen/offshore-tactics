import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import HarbourDashboard from '../components/harbour/HarbourDashboard';
import { seasonalBoardConditions } from '../engine/sailNow';
import { RaceResult } from '../types';

// Structural render tests for the Harbour dashboard: all five sections mount,
// a fresh profile gets the empty logbook (never invented numbers), the world
// chart drills world → region → race entry and back, and the dashboard stays
// scroller-free (the screen owns the single ScrollView) and Modal-free.

const NOW = new Date(2026, 5, 15, 12).getTime();

function finish(raceId: string, position: number): RaceResult {
  return {
    raceId,
    raceName: raceId,
    boatId: 'b',
    finished: true,
    retired: false,
    position,
    fleetSize: 10,
    elapsedHours: 8,
    prizeMoney: 0,
    summary: '',
    timestamp: 1,
  };
}

function mount(history: RaceResult[] = [], onEnterRace: (id: string) => void = () => undefined) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <HarbourDashboard
        history={history}
        conditions={seasonalBoardConditions()}
        now={NOW}
        recommendedId="race-round-island"
        onEnterRace={onEnterRace}
        width={350}
      />
    );
  });
  return tree;
}

// Host elements only — the composite component instance carries the same
// testID prop, so an unfiltered findAll double-counts.
function byTestID(tree: ReactTestRenderer, testID: string): ReactTestInstance[] {
  return tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
}

function press(node: ReactTestInstance): void {
  act(() => {
    node.props.onPress();
  });
}

describe('the Harbour dashboard', () => {
  it('mounts all five sections for a fresh profile, with the empty logbook', () => {
    const tree = mount();
    for (const section of [
      'harbour-hero',
      'harbour-world',
      'harbour-board',
      'harbour-logbook',
      'harbour-season',
    ]) {
      expect(byTestID(tree, section)).toHaveLength(1);
    }
    expect(byTestID(tree, 'logbook-empty')).toHaveLength(1);
    // At most three board cards, and at least one (starter races are open).
    expect(byTestID(tree, 'sail-today-card-0').length).toBe(1);
    expect(byTestID(tree, 'sail-today-card-3')).toHaveLength(0);
  });

  it('shows real numbers instead of the empty state once a race is finished', () => {
    const tree = mount([finish('race-round-island', 2)]);
    expect(byTestID(tree, 'logbook-empty')).toHaveLength(0);
    expect(byTestID(tree, 'harbour-logbook')).toHaveLength(1);
  });

  it('drills world → region → course entry, and the back arrow returns', () => {
    const entered: string[] = [];
    const tree = mount([], (id) => entered.push(id));

    // World view: one station pin per region, no region chart yet.
    expect(byTestID(tree, 'world-chart')).toHaveLength(1);
    expect(byTestID(tree, 'region-chart')).toHaveLength(0);
    expect(byTestID(tree, 'world-chart-pin-uk')).toHaveLength(1);

    // Tap the UK station → the region chart with its courses pinned.
    press(byTestID(tree, 'world-chart-pin-uk')[0]);
    expect(byTestID(tree, 'region-chart')).toHaveLength(1);
    expect(byTestID(tree, 'region-chart-pin-race-cowes-dinard')).toHaveLength(1);

    // A locked course is pinned but does not enter.
    press(byTestID(tree, 'region-chart-pin-race-fastnet')[0]);
    expect(entered).toEqual([]);

    // An open course enters the race funnel.
    press(byTestID(tree, 'region-chart-pin-race-cowes-dinard')[0]);
    expect(entered).toEqual(['race-cowes-dinard']);

    // Back to the world.
    press(byTestID(tree, 'world-back')[0]);
    expect(byTestID(tree, 'world-chart')).toHaveLength(1);
    expect(byTestID(tree, 'region-chart')).toHaveLength(0);
  });

  it('enters a race from a board card and a season chip', () => {
    const entered: string[] = [];
    const tree = mount([], (id) => entered.push(id));
    press(byTestID(tree, 'sail-today-card-0')[0]);
    // June: Round the Island is on the calendar and open.
    press(byTestID(tree, 'season-chip-race-round-island')[0]);
    expect(entered).toHaveLength(2);
    expect(entered[1]).toBe('race-round-island');
  });

  it('hosts no Modal and no scroll container of its own', () => {
    const tree = mount([finish('race-round-island', 1)]);
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0);
    expect(tree.root.findAllByType('ScrollView' as never)).toHaveLength(0);
  });
});
