import React from 'react';
import { Text } from 'react-native';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import Segmented from '../components/Segmented';
import SelectableCard from '../components/SelectableCard';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import FunnelSteps from '../components/FunnelSteps';
import { status } from '../theme';

// The app-wide interaction primitives keep their promises: a segment announces
// selection and meets the 44pt tap target, a selectable card carries the a11y
// state, the empty/loading templates hold their structure. Tree assertions
// against the lightweight RN mock — the same contract style as the cockpit
// render tests.

function create(el: React.ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce<Record<string, unknown>>(
      (acc, s) => ({ ...acc, ...flatten(s) }),
      {}
    );
  }
  return (style as Record<string, unknown>) ?? {};
}

describe('Segmented', () => {
  const options = [
    { value: 'conserve', label: 'Conserve' },
    { value: 'cruise', label: 'Cruise' },
    { value: 'push', label: 'Push' },
  ];

  function segments(tree: ReactTestRenderer): ReactTestInstance[] {
    return tree.root
      .findAllByType('Pressable' as never)
      .filter((n: ReactTestInstance) => n.props.accessibilityRole === 'button');
  }

  it('announces exactly one selected segment and fires onSelect', () => {
    const onSelect = jest.fn();
    const tree = create(<Segmented value="cruise" options={options} onSelect={onSelect} />);
    const segs = segments(tree);
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.props.accessibilityState.selected)).toEqual([false, true, false]);
    act(() => segs[2].props.onPress());
    expect(onSelect).toHaveBeenCalledWith('push');
    tree.unmount();
  });

  it('keeps the 44pt tap target and the selected accent on every segment', () => {
    const tree = create(<Segmented value="push" options={options} onSelect={() => undefined} />);
    for (const seg of segments(tree)) {
      expect(flatten(seg.props.style).minHeight).toBe(44);
    }
    const active = segments(tree)[2];
    const label = active.findAllByType('Text' as never)[0] as unknown as ReactTestInstance;
    expect(flatten(label.props.style).color).toBe(status.selected);
    tree.unmount();
  });
});

describe('SelectableCard', () => {
  it('is a button carrying selected/disabled state, with the selection border', () => {
    const onPress = jest.fn();
    const tree = create(
      <SelectableCard onPress={onPress} selected accessibilityLabel="Sea Sprite" testID="card">
        <Text>Sea Sprite</Text>
      </SelectableCard>
    );
    const card = tree.root
      .findAllByProps({ testID: 'card' })
      .find((n) => typeof n.type === 'string')!;
    expect(card.props.accessibilityRole).toBe('button');
    expect(card.props.accessibilityState).toEqual({ selected: true, disabled: false });
    expect(flatten(card.props.style).borderColor).toBe(status.selected);
    expect(flatten(card.props.style).minHeight).toBe(44);
    act(() => card.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    tree.unmount();
  });

  it('dims without breaking the disabled contract', () => {
    const tree = create(
      <SelectableCard onPress={() => undefined} disabled dimmed testID="card">
        <Text>Too dear</Text>
      </SelectableCard>
    );
    const card = tree.root
      .findAllByProps({ testID: 'card' })
      .find((n) => typeof n.type === 'string')!;
    expect(card.props.accessibilityState.disabled).toBe(true);
    expect(flatten(card.props.style).opacity).toBe(0.5);
    tree.unmount();
  });
});

describe('EmptyState', () => {
  it('renders title always, body and action only when given', () => {
    const bare = create(<EmptyState title="No custom boats yet." testID="empty" />);
    expect(bare.root.findAllByType('Text' as never)).toHaveLength(1);
    bare.unmount();

    const full = create(
      <EmptyState
        title="Couldn't load the leaderboard"
        body="Check your connection and try again."
        action={<Text>Retry</Text>}
      />
    );
    const texts = full.root
      .findAllByType('Text' as never)
      .map((t: ReactTestInstance) => String(t.props.children));
    expect(texts).toEqual([
      "Couldn't load the leaderboard",
      'Check your connection and try again.',
      'Retry',
    ]);
    full.unmount();
  });
});

describe('LoadingState', () => {
  it('shows the spinner, and a line only when the wait needs naming', () => {
    const tree = create(<LoadingState title="Reading the conditions…" />);
    expect(tree.root.findAllByType('ActivityIndicator' as never)).toHaveLength(1);
    expect(
      tree.root.findAllByType('Text' as never).map((t: ReactTestInstance) => t.props.children)
    ).toEqual(['Reading the conditions…']);
    tree.unmount();

    const splash = create(<LoadingState />);
    expect(splash.root.findAllByType('Text' as never)).toHaveLength(0);
    splash.unmount();
  });
});

describe('FunnelSteps', () => {
  it('renders four pips and names the current step for a screen reader', () => {
    const tree = create(<FunnelSteps stage="crew" />);
    const row = tree.root
      .findAllByProps({ testID: 'funnel-steps' })
      .find((n) => typeof n.type === 'string')!;
    expect(row.props.accessibilityLabel).toBe('Step 3 of 4: sign your crew');
    // Four pips, no text — dots, not a labelled banner.
    expect(row.children).toHaveLength(4);
    expect(tree.root.findAllByType('Text' as never)).toHaveLength(0);
    tree.unmount();
  });
});
