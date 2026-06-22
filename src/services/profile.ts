import { supabase } from '../lib/supabase';

// Reads a user's public display name from the profiles table.
export async function loadDisplayName(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.display_name as string;
}

// Updates the player's display name in both the profiles table (the live name
// the leaderboard reads) and the auth metadata (what the session exposes).
export async function updateDisplayName(
  userId: string,
  displayName: string
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Cloud features are off.' };
  const name = displayName.trim();
  if (!name) return { error: 'Enter a display name.' };

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: userId, display_name: name, updated_at: new Date().toISOString() });
  if (profileError) return { error: profileError.message };

  const { error: authError } = await supabase.auth.updateUser({
    data: { display_name: name },
  });
  if (authError) return { error: authError.message };

  return {};
}
