// The Notice Board IO layer: guest-first and cloud-optional. We mock both the
// Supabase client (mutable per scenario) and AsyncStorage (in-memory) so the
// queue behaviour is fully deterministic — no network, no RN storage.

interface InsertResult {
  error: { message: string } | null;
}

// A mutable holder the mocked module reads through a getter, so a test can swap
// between "no client", "insert succeeds" and "insert errors" without resetModules.
const mockState: { client: unknown } = { client: null };

jest.mock('../lib/supabase', () => ({
  get supabase() {
    return mockState.client;
  },
}));

const memStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string): Promise<string | null> => (k in memStore ? memStore[k] : null),
    setItem: async (k: string, v: string): Promise<void> => {
      memStore[k] = v;
    },
    removeItem: async (k: string): Promise<void> => {
      delete memStore[k];
    },
  },
}));

import {
  FeedbackContext,
  FeedbackDraft,
  flushFeedbackQueue,
  QueuedFeedback,
  submitFeedback,
} from '../services/feedback';

const QUEUE_KEY = '@offshore_tactics/feedback_queue_v1';

function readQueue(): QueuedFeedback[] {
  const raw = memStore[QUEUE_KEY];
  return raw ? (JSON.parse(raw) as QueuedFeedback[]) : [];
}

// Configure a client whose insert runs the given impl; returns the insert spy.
function configureClient(
  insert: (payload: Record<string, unknown>) => Promise<InsertResult>
): jest.Mock {
  const insertFn = jest.fn(insert);
  mockState.client = { from: jest.fn(() => ({ insert: insertFn })) };
  return insertFn;
}

function noClient(): void {
  mockState.client = null;
}

const ctx: FeedbackContext = { platform: 'web', appVersion: '1.0.0', signedIn: false };
const draft: FeedbackDraft = { kind: 'bug', message: 'It broke', subject: 'It should not' };

beforeEach(() => {
  for (const k of Object.keys(memStore)) delete memStore[k];
  mockState.client = null;
});

describe('submitFeedback', () => {
  it('posts to the board when signed in + configured (user_id set, queued:false)', async () => {
    const insert = configureClient(async () => ({ error: null }));
    const res = await submitFeedback(draft, { ...ctx, signedIn: true }, 'user-123');
    expect(res).toEqual({ ok: true, queued: false });
    expect(insert).toHaveBeenCalledTimes(1);
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.user_id).toBe('user-123');
    expect(payload.kind).toBe('bug');
    expect(payload.message).toBe('It broke');
    expect(payload.subject).toBe('It should not');
    expect(payload.reply_ok).toBe(false);
    expect(payload.context).toEqual({ ...ctx, signedIn: true });
    expect(readQueue()).toHaveLength(0);
  });

  it('posts a guest note with a null user_id', async () => {
    const insert = configureClient(async () => ({ error: null }));
    const res = await submitFeedback(draft, ctx);
    expect(res).toEqual({ ok: true, queued: false });
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.user_id).toBeNull();
  });

  it('queues locally when Supabase is not configured', async () => {
    noClient();
    const res = await submitFeedback(draft, ctx);
    expect(res).toEqual({ ok: true, queued: true });
    const queue = readQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].message).toBe('It broke');
    expect(queue[0].id).toMatch(/^fb_/);
  });

  it('queues (never loses) when the insert errors', async () => {
    configureClient(async () => ({ error: { message: 'relation "feedback" does not exist' } }));
    const res = await submitFeedback(draft, ctx);
    expect(res).toEqual({ ok: true, queued: true });
    expect(readQueue()).toHaveLength(1);
  });

  it('queues when the insert throws (network)', async () => {
    configureClient(async () => {
      throw new Error('network down');
    });
    const res = await submitFeedback(draft, ctx);
    expect(res).toEqual({ ok: true, queued: true });
    expect(readQueue()).toHaveLength(1);
  });

  it('caps the queue at 50, dropping the oldest', async () => {
    noClient();
    for (let i = 0; i < 60; i += 1) {
      await submitFeedback({ kind: 'other', message: `n${i}` }, ctx);
    }
    const queue = readQueue();
    expect(queue).toHaveLength(50);
    // The oldest ten (n0..n9) were dropped; the newest survive in order.
    expect(queue[0].message).toBe('n10');
    expect(queue[queue.length - 1].message).toBe('n59');
  });
});

describe('flushFeedbackQueue', () => {
  it('no-ops (returns 0) with no client', async () => {
    noClient();
    await submitFeedback(draft, ctx); // enqueue one
    noClient();
    expect(await flushFeedbackQueue()).toBe(0);
    expect(readQueue()).toHaveLength(1);
  });

  it('posts every queued row and clears them', async () => {
    // Enqueue three offline…
    noClient();
    for (let i = 0; i < 3; i += 1) await submitFeedback({ kind: 'other', message: `q${i}` }, ctx);
    expect(readQueue()).toHaveLength(3);
    // …then come online and drain.
    configureClient(async () => ({ error: null }));
    const posted = await flushFeedbackQueue();
    expect(posted).toBe(3);
    expect(readQueue()).toHaveLength(0);
  });

  it('is resilient to a partial flush — errored rows stay queued', async () => {
    noClient();
    for (const m of ['keep-fail', 'ok-a', 'ok-b']) {
      await submitFeedback({ kind: 'other', message: m }, ctx);
    }
    configureClient(async (payload) =>
      payload.message === 'keep-fail'
        ? { error: { message: 'boom' } }
        : { error: null }
    );
    const posted = await flushFeedbackQueue();
    expect(posted).toBe(2);
    const remaining = readQueue();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe('keep-fail');
  });
});
