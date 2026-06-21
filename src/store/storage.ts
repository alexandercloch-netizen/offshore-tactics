import AsyncStorage from '@react-native-async-storage/async-storage';
import { GameState } from '../types';

const STATE_KEY = '@offshore_tactics/state_v1';

export async function saveState(state: GameState): Promise<void> {
  try {
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
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
