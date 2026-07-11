import React from 'react';
import renderer, { act, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import NoticeBoardForm, { NoticeBoardFormProps } from '../screens/feedback/NoticeBoardForm';
import { FeedbackContext, FeedbackDraft } from '../services/feedback';

// Structural render tests for the props-driven Notice Board form. Mounted with a
// stub submit and plain diagnostics (no game/auth/service), mirroring the
// Sailor's Card test. Tree assertions, not pixels.

const diagnostics: FeedbackContext = {
  platform: 'web',
  appVersion: '1.0.0',
  screen: 'Home',
  signedIn: false,
};

function props(overrides: Partial<NoticeBoardFormProps> = {}): NoticeBoardFormProps {
  return {
    signedIn: false,
    diagnostics,
    submit: async () => ({ ok: true, queued: true }),
    onClose: () => undefined,
    ...overrides,
  };
}

function mount(p: NoticeBoardFormProps): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<NoticeBoardForm {...p} />);
  });
  return tree;
}

function byTestID(tree: ReactTestRenderer, id: string): ReactTestInstance[] {
  // Match only host (string-typed) nodes, not the component instance that also
  // carries the forwarded testID — otherwise every id counts twice.
  return tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
}

describe('the Notice Board form', () => {
  it('renders the four categories, the message input and the submit button', () => {
    const tree = mount(props());
    for (const id of [
      'feedback-cat-race',
      'feedback-cat-bug',
      'feedback-cat-content',
      'feedback-cat-general',
    ]) {
      expect(byTestID(tree, id)).toHaveLength(1);
    }
    expect(byTestID(tree, 'feedback-message')).toHaveLength(1);
    expect(byTestID(tree, 'feedback-submit')).toHaveLength(1);
  });

  it('hides the reply toggle for guests and shows the honest guest note', () => {
    const tree = mount(props({ signedIn: false }));
    expect(byTestID(tree, 'feedback-reply-toggle')).toHaveLength(0);
    expect(byTestID(tree, 'feedback-guest-note')).toHaveLength(1);
  });

  it('shows the reply toggle when signed in', () => {
    const tree = mount(props({ signedIn: true }));
    expect(byTestID(tree, 'feedback-reply-toggle')).toHaveLength(1);
    expect(byTestID(tree, 'feedback-guest-note')).toHaveLength(0);
  });

  it('calls the service on submit and swaps to the success state', async () => {
    const submit = jest.fn(async (_draft: FeedbackDraft) => ({ ok: true, queued: true }));
    const tree = mount(props({ submit }));

    // Type a note (submit is inert until the message is non-empty)…
    act(() => {
      byTestID(tree, 'feedback-message')[0].props.onChangeText('Something went wrong');
    });
    // …then send it.
    await act(async () => {
      byTestID(tree, 'feedback-submit')[0].props.onPress();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0]).toMatchObject({
      kind: 'race_suggestion',
      message: 'Something went wrong',
    });
    expect(byTestID(tree, 'feedback-success')).toHaveLength(1);
  });

  it('does not call the service with an empty message', async () => {
    const submit = jest.fn(async (_draft: FeedbackDraft) => ({ ok: true, queued: true }));
    const tree = mount(props({ submit }));
    await act(async () => {
      byTestID(tree, 'feedback-submit')[0].props.onPress();
    });
    expect(submit).not.toHaveBeenCalled();
    expect(byTestID(tree, 'feedback-success')).toHaveLength(0);
  });

  it('hosts no Modal', () => {
    const tree = mount(props());
    expect(tree.root.findAllByType('Modal' as never)).toHaveLength(0);
  });
});
