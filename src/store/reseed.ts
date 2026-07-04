import {
  Competitor,
  GameState,
  RaceProgress,
  WeatherCondition,
  WeatherScenarioStamp,
  WindField,
} from '../types';

// Everything a conditions change swaps in one atomic move: the wind field, the
// weather at the line, a fleet re-benchmarked through the new field (so the
// difficulty self-calibrates in any weather), and a fresh pre-start progress
// routed on it. `scenario` is the provenance stamp (absent = seasonal).
export interface ReseedPayload {
  progress: RaceProgress;
  weather: WeatherCondition;
  windField: WindField;
  fleet: Competitor[];
  scenario?: WeatherScenarioStamp;
}

// Atomically swap the pre-start race world for one seeded under the chosen
// conditions. `progress` is REPLACED, never nulled, even transiently — the
// Briefing's mount effect calls beginRace whenever progress vanishes, and a
// null flash would race it into a second campaign charge. Pure, so the
// guarantee is unit-testable without the React chain.
export function applyReseed(state: GameState, payload: ReseedPayload): GameState {
  if (!state.progress) return state; // nothing to reseed — never conjure a race
  if (state.progress.distanceCoveredNm > 0) return state; // gun's gone — conditions are locked
  // The start outcome (clean/dirty air, OCS penalty) is baked into progress at
  // APPLY_START; a fresh initialProgress would silently erase it. Once the
  // start has been sailed, the conditions are locked too.
  if (state.progress.startSpeedMul != null) return state;
  return {
    ...state,
    progress: payload.progress,
    weather: payload.weather,
    windField: payload.windField,
    fleet: payload.fleet,
    scenario: payload.scenario,
  };
}
