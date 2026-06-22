import { LeaderboardEntry } from '../types';
import { supabase } from '../lib/supabase';

// Submits a finished/retired race to the global leaderboard. Best-effort.
export async function submitToLeaderboard(
  entry: LeaderboardEntry
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('leaderboard').insert(entry);
  if (error) {
    console.warn('Leaderboard submission failed', error.message);
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
  if (error || !data) return [];
  return (data as LeaderboardRow[]).map(({ profiles, ...row }) => ({
    ...row,
    display_name: profiles?.display_name ?? row.display_name,
  }));
}
