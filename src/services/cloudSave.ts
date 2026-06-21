import { GameState } from '../types';
import { supabase } from '../lib/supabase';

// Loads a user's cloud save, or null if none exists / Supabase is unconfigured.
export async function loadCloudSave(userId: string): Promise<GameState | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('saves')
    .select('state')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.state as GameState;
}

// Upserts the user's cloud save. Best-effort: failures are swallowed so the
// game never breaks over a network hiccup (local AsyncStorage is the fallback).
export async function saveCloud(userId: string, state: GameState): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('saves').upsert({
    user_id: userId,
    state,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn('Cloud save failed', error.message);
  }
}
