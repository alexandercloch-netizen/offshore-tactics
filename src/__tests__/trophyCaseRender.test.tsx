import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import TrophyCaseView from '../screens/profile/TrophyCaseView';
import { emptyCareer, applyRaceToCareer } from '../engine/career';
import { evaluateHonours } from '../engine/honours';
import { HONOURS } from '../data/honours';
import { RaceResult } from '../types';

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

function mount(awards = evaluateHonours(emptyCareer(), []).awards): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<TrophyCaseView awards={awards} />);
  });
  return tree;
}

function byTestID(tree: ReactTestRenderer, id: string): ReactTestInstance[] {
  return tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
}

function press(node: ReactTestInstance): void {
  act(() => {
    node.props.onPress();
  });
}

describe('the Trophy Case', () => {
  it('renders the case root and an earned tile full-colour, locked tiles disabled', () => {
    // Win the Fastnet → the Fastnet Challenge Cup is earned.
    const career = applyRaceToCareer(emptyCareer(), finish('race-fastnet', 1));
    const awards = evaluateHonours(career, [finish('race-fastnet', 1)]).awards;
    const tree = mount(awards);
    expect(byTestID(tree, 'trophy-case')).toHaveLength(1);

    const cup = byTestID(tree, 'honour-fastnet-challenge-cup');
    expect(cup).toHaveLength(1);
    expect(cup[0].props.accessibilityState).toEqual({ disabled: false });
  });

  it('is a map of goals at zero — every honour shown, all locked & disabled', () => {
    const tree = mount(); // empty career
    // With nothing earned the locked goals auto-reveal (never a grey wall).
    for (const h of HONOURS) {
      const tile = byTestID(tree, `honour-${h.id}`);
      expect(tile).toHaveLength(1);
      expect(tile[0].props.accessibilityState).toEqual({ disabled: true });
    }
    // Auto-revealed, so no expander is offered.
    expect(byTestID(tree, 'trophy-show-locked')).toHaveLength(0);
  });

  it('hides locked tiles behind an expander once something is earned, then reveals them', () => {
    const career = applyRaceToCareer(emptyCareer(), finish('race-fastnet', 1));
    const awards = evaluateHonours(career, [finish('race-fastnet', 1)]).awards;
    const tree = mount(awards);

    // A locked honour is not shown until the expander is tapped.
    expect(byTestID(tree, 'honour-tattersall-cup')).toHaveLength(0);
    const expander = byTestID(tree, 'trophy-show-locked');
    expect(expander).toHaveLength(1);
    press(expander[0]);
    expect(byTestID(tree, 'honour-tattersall-cup')).toHaveLength(1);
  });

  it('hosts no Modal', () => {
    const tree = mount();
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0);
  });
});
