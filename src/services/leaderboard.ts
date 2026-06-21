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

// Fetches the fastest finishers, optionally filtered to a single race.
export async function fetchLeaderboard(
  raceId?: string
): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  let query = supabase
    .from('leaderboard')
    .select('*')
    .eq('retired', false)
    .order('elapsed_hours', { ascending: true })
    .limit(50);
  if (raceId) {
    query = query.eq('race_id', raceId);
  }
  const { data, error } = await query;
  if (error || !data) return [];
  return data as LeaderboardEntry[];
}
