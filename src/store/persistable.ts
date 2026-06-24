import { GameState } from '../types';

// The persistable (cloud) view of a save. The live-race runtime fields
// (`progress`, `windField`, `tidalField`, `fleet`, `weather`) are large and
// ephemeral, and no other device can resume an in-progress race, so they're
// stripped before the cloud write — only durable campaign state (funds, boats,
// crew, history, profile, settings) is uploaded. Pure: no platform imports, so
// it's unit-testable without the Supabase/React Native chain.
export function cloudSnapshot(state: GameState): GameState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { progress, windField, tidalField, fleet, weather, ...durable } = state;
  return durable;
}
