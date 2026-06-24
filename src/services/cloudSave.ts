import { GameState } from '../types';
import { supabase } from '../lib/supabase';
import { cloudSnapshot } from '../store/persistable';

export { cloudSnapshot };

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
  const snapshot = cloudSnapshot(state);
  const clientUpdatedAt = new Date(snapshot.savedAt ?? Date.now()).toISOString();
  const payload = JSON.stringify(snapshot);
  // Guardrail: durable state should be small (history is capped at 50). If a
  // future regression lets it balloon, log loudly rather than fail silently.
  if (payload.length > 512_000) {
    console.warn(`Cloud save payload is large (${Math.round(payload.length / 1024)} KB)`);
  }
  const { error } = await supabase.rpc('save_game', {
    p_state: snapshot,
    p_client_updated_at: clientUpdatedAt,
  });
  if (error) {
    console.warn('Cloud save failed', error.message);
  }
}
