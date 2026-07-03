import { LeaderboardEntry } from '../types';
import { supabase } from '../lib/supabase';

// Submits a finished/retired race to the global leaderboard, keeping only the
// player's BEST corrected/elapsed time per race. It first reads the player's
// current best for the race and skips the write if the new time isn't better;
// when it is, it improves the existing row in place (falling back to an insert if
// the update is blocked). Defensive and idempotent-ish so a re-submit or a retry
// can't pile up duplicate rows. Best-effort — resilient if the dedupe constraint
// / policies aren't applied yet (the game degrades gracefully offline).
export async function submitToLeaderboard(
  entry: LeaderboardEntry
): Promise<void> {
  if (!supabase) return;
  try {
    const { data: existingRows } = await supabase
      .from('leaderboard')
      .select('id, elapsed_hours')
      .eq('user_id', entry.user_id)
      .eq('race_id', entry.race_id)
      .order('elapsed_hours', { ascending: true })
      .limit(1);
    const best = existingRows?.[0] as { id: string; elapsed_hours: number } | undefined;

    if (best && best.elapsed_hours <= entry.elapsed_hours) {
      return; // an equal-or-better time is already posted — keep it
    }
    if (best) {
      // Improve the existing row to the better time (needs the owner update
      // policy; if it's blocked we fall through to an insert below).
      const { error } = await supabase.from('leaderboard').update(entry).eq('id', best.id);
      if (!error) return;
    }
    const { error } = await supabase.from('leaderboard').insert(entry);
    if (error) console.warn('Leaderboard submission failed', error.message);
  } catch (err) {
    console.warn('Leaderboard submission threw', err);
  }
}

interface LeaderboardRow extends LeaderboardEntry {
  // Embedded live profile name (PostgREST resource embedding via the FK).
  profiles?: { display_name: string } | null;
}

// Fetches the fastest finishers, optionally filtered to a single race. Each
// row's display name comes from the linked profile (live, editable), falling
// back to the name denormalized when the result was submitted.
export async function fetchLeaderboard(
  raceId?: string
): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  let query = supabase
    .from('leaderboard')
    .select('*, profiles!leaderboard_user_id_profiles_fkey(display_name)')
    .eq('retired', false)
    .order('elapsed_hours', { ascending: true })
    .limit(50);
  if (raceId) {
    query = query.eq('race_id', raceId);
  }
  const { data, error } = await query;
  // Distinguish a real failure from a genuinely empty board: throw on error so
  // the screen can show a retryable error state rather than "no times yet".
  if (error) throw new Error(error.message);
  if (!data) return [];
  return (data as LeaderboardRow[]).map(({ profiles, ...row }) => ({
    ...row,
    display_name: profiles?.display_name ?? row.display_name,
  }));
}
