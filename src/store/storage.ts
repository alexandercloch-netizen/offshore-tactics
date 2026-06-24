import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameState } from '../types';

const STATE_KEY = '@offshore_tactics/state_v1';

export async function saveState(state: GameState): Promise<void> {
  try {
    const raw = JSON.stringify(state);
    // The local cache holds the full state (incl. live race) for crash recovery,
    // so it's larger than the cloud snapshot — but it should still be tens of KB,
    // not megabytes. Warn if a growth regression ever blows past a sane ceiling.
    if (raw.length > 2_000_000) {
      console.warn(`Local save is very large (${Math.round(raw.length / 1024)} KB)`);
    }
    await AsyncStorage.setItem(STATE_KEY, raw);
  } catch (err) {
    // Persisting is best-effort; never crash the game over a write failure.
    console.warn('Failed to save game state', err);
  }
}

export async function loadState(): Promise<GameState | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch (err) {
    console.warn('Failed to load game state', err);
    return null;
  }
}

export async function clearState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STATE_KEY);
  } catch (err) {
    console.warn('Failed to clear game state', err);
  }
}
