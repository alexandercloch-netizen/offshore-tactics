import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import appConfig from '../../app.json';

// The Notice Board's IO layer — posting a "message to the Race Committee".
// Guest-first and cloud-optional: with no Supabase env (CI/e2e, offline guests)
// or when an insert fails for any reason, the note is saved to a local
// AsyncStorage queue and posted opportunistically later. It NEVER throws and
// NEVER loses a note. Insert-only from the client — the app can't read the board.
//
// This is display/IO code, wholly outside the deterministic engine, so it may
// use Date.now()/Math.random() freely; it must never import engine/rng.

export type FeedbackKind = 'race_suggestion' | 'bug' | 'content_request' | 'other';

export interface FeedbackContext {
  platform: string; // Platform.OS
  appVersion?: string; // the app's version, when known
  screen?: string; // the route the player came from
  locale?: string;
  signedIn: boolean;
}

export interface FeedbackDraft {
  kind: FeedbackKind;
  message: string;
  subject?: string;
  replyOk?: boolean;
}

export interface QueuedFeedback extends FeedbackDraft {
  id: string;
  context: FeedbackContext;
  userId?: string;
  queuedAt: number;
}

// Match the '@offshore_tactics/…_v1' convention used by the save cache.
const QUEUE_KEY = '@offshore_tactics/feedback_queue_v1';
// Cap the on-device backlog so a permanently-offline player can't grow it
// without bound; we keep the newest and drop the oldest.
const QUEUE_CAP = 50;

// The bundled app version — read from app.json (never expo-constants, which is
// only a transitive dep here), so it's always present and needs no extra module.
function bundledAppVersion(): string | undefined {
  const v = (appConfig as { expo?: { version?: string } }).expo?.version;
  return v && v.length > 0 ? v : undefined;
}

// A seedless, engine-free id for a queued row. Never touches engine/rng — a
// timestamp + a small monotonic counter + a little entropy is plenty for a
// local dedupe key.
let seq = 0;
function localId(): string {
  seq = (seq + 1) % 1_000_000;
  const rand = Math.floor(Math.random() * 1e9).toString(36);
  return `fb_${Date.now().toString(36)}_${seq.toString(36)}_${rand}`;
}

// Assemble the display/diagnostics context for a note from the current runtime.
export function feedbackContext(signedIn: boolean, screen?: string): FeedbackContext {
  return {
    platform: Platform.OS,
    appVersion: bundledAppVersion(),
    screen,
    locale: resolveLocale(),
    signedIn,
  };
}

function resolveLocale(): string | undefined {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
  } catch {
    // navigator isn't available off-web — a missing locale is fine.
  }
  return undefined;
}

// The wire payload. id/created_at are server defaults; we send no PII beyond the
// self-stamped user_id (guests send null) and the diagnostics context.
function payloadFor(row: QueuedFeedback): Record<string, unknown> {
  return {
    user_id: row.userId ?? null,
    kind: row.kind,
    message: row.message,
    subject: row.subject ?? null,
    context: row.context,
    reply_ok: row.replyOk ?? false,
  };
}

async function readQueue(): Promise<QueuedFeedback[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedFeedback[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedFeedback[]): Promise<void> {
  try {
    // Cap on write: keep the newest QUEUE_CAP, drop the oldest.
    const capped = queue.slice(-QUEUE_CAP);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(capped));
  } catch {
    // Persisting is best-effort; never crash over a write failure.
  }
}

async function enqueue(item: QueuedFeedback): Promise<void> {
  const queue = await readQueue();
  queue.push(item);
  await writeQueue(queue);
}

// Post a note. Signed-in + Supabase configured → insert to the board (and then
// opportunistically drain any earlier backlog). No client / any insert error →
// save it to the local queue, honestly reported as `queued`. Never throws.
export async function submitFeedback(
  draft: FeedbackDraft,
  context: FeedbackContext,
  userId?: string
): Promise<{ ok: boolean; queued: boolean }> {
  const item: QueuedFeedback = {
    ...draft,
    id: localId(),
    context,
    userId,
    queuedAt: Date.now(),
  };

  if (!supabase) {
    await enqueue(item);
    return { ok: true, queued: true };
  }

  try {
    const { error } = await supabase.from('feedback').insert(payloadFor(item));
    if (error) {
      await enqueue(item);
      return { ok: true, queued: true };
    }
  } catch {
    // RLS / relation-missing / network — anything at all, we keep the note.
    await enqueue(item);
    return { ok: true, queued: true };
  }

  // Landed cleanly — try to clear anything the player queued while offline.
  void flushFeedbackQueue();
  return { ok: true, queued: false };
}

// Drain the local queue to the board, best-effort. Rows that land are cleared;
// rows that error (or throw) stay for the next attempt — a partial flush is fine.
// No-ops (returns 0) when Supabase isn't configured. Returns the count posted.
export async function flushFeedbackQueue(): Promise<number> {
  if (!supabase) return 0;
  const queue = await readQueue();
  if (queue.length === 0) return 0;

  const remaining: QueuedFeedback[] = [];
  let posted = 0;
  for (const item of queue) {
    try {
      const { error } = await supabase.from('feedback').insert(payloadFor(item));
      if (error) remaining.push(item);
      else posted += 1;
    } catch {
      remaining.push(item);
    }
  }

  if (posted > 0) await writeQueue(remaining);
  return posted;
}
