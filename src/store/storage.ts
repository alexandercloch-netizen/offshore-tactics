import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameState } from '../types';

// The local cache is namespaced by save "scope" — a signed-in user's id, or the
// guest key `local` — so two accounts on the same device never share a cache and
// one player can't see another's save. The unscoped guest key is the legacy key
// so existing local-only campaigns survive the upgrade untouched.
const BASE_KEY = '@offshore_tactics/state_v1';
export const GUEST_SCOPE = 'local';

function keyFor(scope: string): string {
  return scope === GUEST_SCOPE ? BASE_KEY : `${BASE_KEY}:${scope}`;
}

export async function saveState(state: GameState, scope: string = GUEST_SCOPE): Promise<void> {
  try {
    const raw = JSON.stringify(state);
    // The local cache holds the full state (incl. live race) for crash recovery,
    // so it's larger than the cloud snapshot — but it should still be tens of KB,
    // not megabytes. Warn if a growth regression ever blows past a sane ceiling.
    if (raw.length > 2_000_000) {
      console.warn(`Local save is very large (${Math.round(raw.length / 1024)} KB)`);
    }
    await AsyncStorage.setItem(keyFor(scope), raw);
  } catch (err) {
    // Persisting is best-effort; never crash the game over a write failure.
    console.warn('Failed to save game state', err);
  }
}

export async function loadState(scope: string = GUEST_SCOPE): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(scope));
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch (err) {
    console.warn('Failed to load game state', err);
    return null;
  }
}

export async function clearState(scope: string = GUEST_SCOPE): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(scope));
  } catch (err) {
    console.warn('Failed to clear game state', err);
  }
}
