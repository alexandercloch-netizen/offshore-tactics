import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import LiveStandings from '../components/LiveStandings';
import { Competitor } from '../types';

// ---------------------------------------------------------------------------
// The corrected-standings overlay is the honest, scored truth the player is
// judged on. These tests pin the two things that make it loud from the gun:
//   1. it defaults OPEN (the corrected order is up without a tap);
//   2. collapsed, it STILL names the player's own corrected place + fleet size.
// ---------------------------------------------------------------------------

// A fleet where the player lands 2nd of 4 on corrected time. The player's live
// corrected finish is elapsed × (total ÷ covered) × tcc = 10 × 2 × 1 = 20h.
// A rival projects to 16.7h (ahead); two project to 25h / 33h (astern).
const FLEET: Competitor[] = [
  mk('rival-fast', 'Rán', 60), // → ~16.7h corrected, ahead of the player
  mk('rival-mid', 'Wild Rose', 40), // → 25h, astern
  mk('rival-slow', 'Kestrel', 30), // → ~33h, astern
];

function mk(id: string, name: string, distanceNm: number): Competitor {
  return {
    id,
    name,
    speedMul: 1,
    ratingTcc: 1,
    targetHours: 20,
    distanceNm,
    finishedHours: null,
    retired: false,
  };
}

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <LiveStandings
        fleet={FLEET}
        totalNm={100}
        playerElapsedHours={10}
        playerDistanceNm={50}
        playerTcc={1}
        playerName="Aurora"
        cadenceKey={1}
      />
    );
  });
  return tree;
}

function summaryText(tree: ReactTestRenderer): string {
  const node = tree.root.findByProps({ testID: 'live-standings-summary' }) as ReactTestInstance;
  return String(node.props.children);
}

describe('the corrected-standings overlay', () => {
  it('defaults OPEN — the corrected order is up from the gun', () => {
    const tree = mount();
    // Expanded: the toggle summary reads "Hide", the body rows and footnote show.
    expect(summaryText(tree)).toContain('Hide');
    const texts = tree.root.findAllByType('Text' as never).map((t) => String(t.props.children));
    expect(texts.some((t) => t.includes('on handicap (corrected) time'))).toBe(true);
    tree.unmount();
  });

  it('names the player OWN corrected place + fleet size while collapsed — no tap needed', () => {
    const tree = mount();
    // Fold it away for a clear chart.
    act(() => {
      (tree.root.findByProps({ testID: 'live-standings-toggle' }).props as {
        onPress: () => void;
      }).onPress();
    });
    // The player is 2nd of 4 on handicap; the collapsed header must say so.
    expect(summaryText(tree)).toBe('2nd of 4 · on handicap ▾');
    tree.unmount();
  });
});
