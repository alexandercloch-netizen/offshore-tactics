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

// Persists the save through the conditional-upsert RPC: the server writes only
// when this save is newer than the stored one, so a stale device can't clobber
// newer cloud data. Best-effort — failures are swallowed (local AsyncStorage is
// the fallback). The RPC reads auth.uid(), so no user id is passed.
export async function saveCloud(state: GameState): Promise<void> {
  if (!supabase) return;
  const clientUpdatedAt = new Date(state.savedAt ?? Date.now()).toISOString();
  const { error } = await supabase.rpc('save_game', {
    p_state: state,
    p_client_updated_at: clientUpdatedAt,
  });
  if (error) {
    console.warn('Cloud save failed', error.message);
  }
}
