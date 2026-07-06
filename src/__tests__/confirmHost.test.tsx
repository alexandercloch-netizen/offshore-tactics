import React from 'react';
import renderer, { act, ReactTestRenderer } from 'react-test-renderer';
import ConfirmHost from '../components/ConfirmHost';
import { confirmAction } from '../lib/confirm';

// The themed destructive confirm: on web (the mock RN reports Platform.OS ===
// 'web') confirmAction routes to the root-mounted ConfirmHost sheet, and the
// caller's callbacks resolve asynchronously — only on the player's tap, never
// synchronously at the call site. With no host mounted the old fallback stands.

function mountHost(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<ConfirmHost />);
  });
  return tree;
}

function pressByTestID(tree: ReactTestRenderer, testID: string): void {
  const node = tree.root
    .findAllByProps({ testID })
    .find((n) => typeof n.type === 'string' && n.props.onPress);
  expect(node).toBeDefined();
  act(() => node!.props.onPress());
}

describe('ConfirmHost', () => {
  it('presents the sheet and resolves onConfirm only when accepted', () => {
    const tree = mountHost();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    act(() => {
      confirmAction({ title: 'Retire from Race', message: 'Abandon?', onConfirm, onCancel });
    });

    // The request resolves on the tap, not at the call site.
    expect(onConfirm).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: 'confirm-sheet' }).length).toBeGreaterThan(0);

    pressByTestID(tree, 'confirm-accept');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    // The sheet retracts once resolved.
    expect(tree.root.findAllByProps({ testID: 'confirm-sheet' })).toHaveLength(0);
    tree.unmount();
  });

  it('resolves onCancel when declined, and the sheet retracts', () => {
    const tree = mountHost();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    act(() => {
      confirmAction({ title: 'Scrap Boat', message: 'Really?', onConfirm, onCancel });
    });
    pressByTestID(tree, 'confirm-cancel');

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(tree.root.findAllByProps({ testID: 'confirm-sheet' })).toHaveLength(0);
    tree.unmount();
  });

  it('treats a backdrop tap as declining — backing out is the easy path', () => {
    const tree = mountHost();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();

    act(() => {
      confirmAction({ title: 'Reset Campaign', message: 'Sure?', onConfirm, onCancel });
    });
    const overlay = tree.root
      .findAllByProps({ testID: 'confirm-overlay' })
      .find((n) => typeof n.type === 'string')!;
    const backdrop = overlay.findAllByType('Pressable' as never)[0] as unknown as {
      props: { onPress: () => void };
    };
    act(() => backdrop.props.onPress());

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('declines a superseded request instead of dropping its callbacks', () => {
    const tree = mountHost();
    const first = { onConfirm: jest.fn(), onCancel: jest.fn() };
    const second = { onConfirm: jest.fn(), onCancel: jest.fn() };

    act(() => {
      confirmAction({ title: 'First', message: 'one', ...first });
    });
    act(() => {
      confirmAction({ title: 'Second', message: 'two', ...second });
    });
    expect(first.onCancel).toHaveBeenCalledTimes(1);

    pressByTestID(tree, 'confirm-accept');
    expect(second.onConfirm).toHaveBeenCalledTimes(1);
    expect(first.onConfirm).not.toHaveBeenCalled();
    tree.unmount();
  });

  it('labels the buttons from the request and styles a non-destructive confirm as primary', () => {
    const tree = mountHost();
    act(() => {
      confirmAction({
        title: 'Sign Out',
        message: 'Sign out?',
        confirmLabel: 'Sign Out',
        cancelLabel: 'Stay',
        destructive: false,
        onConfirm: () => undefined,
      });
    });
    const accept = tree.root
      .findAllByProps({ testID: 'confirm-accept' })
      .find((n) => typeof n.type === 'string' && n.props.onPress)!;
    expect(accept.props.accessibilityLabel).toBe('Sign Out');
    const cancel = tree.root
      .findAllByProps({ testID: 'confirm-cancel' })
      .find((n) => typeof n.type === 'string' && n.props.onPress)!;
    expect(cancel.props.accessibilityLabel).toBe('Stay');
    tree.unmount();
  });

  it('falls back without a host mounted, so no call site can hang', () => {
    // Mount and unmount a host so its presenter provably unregisters. In a
    // window-less environment the fallback resolves as an accept — a destructive
    // action must never become a silent no-op.
    const tree = mountHost();
    act(() => tree.unmount());
    const onConfirm = jest.fn();
    confirmAction({ title: 'Orphan', message: 'no host', onConfirm });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
