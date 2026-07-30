// The pure game state machine — the economy + progression reducer, extracted from
// GameContext so it carries NO React / Supabase / react-native imports and is
// unit-testable in isolation (see gameReducer.test.ts). GameContext wires this
// into `useReducer` and owns all the side-effecting glue. Keep this file pure:
// (state, action) => state, no I/O.
import {
  BoatCondition,
  Competitor,
  Currency,
  DivisionKey,
  FleetBoat,
  GameState,
  PlayerProfile,
  PlayerStrategy,
  ProvisionSelection,
  RaceProgress,
  RaceResult,
  RoutingBias,
  TidalField,
  WeatherCondition,
  WeatherScenarioStamp,
  WindField,
} from '../types';
import { STARTING_FUNDS, applyStipend, getBoatById, getRaceById } from '../data';
import { DEFAULT_STRATEGY, seedStartGrid } from '../engine/gameEngine';
import { applyRaceToCareer, hydrateCareer } from '../engine/career';
import { applyReseed, ReseedPayload } from './reseed';

export const DEFAULT_CONDITION: BoatCondition = {
  hullIntegrity: 100,
  crewStamina: 100,
  crewMorale: 100,
};

export const INITIAL_STATE: GameState = {
  funds: STARTING_FUNDS,
  selectedDivision: 'corinthian',
  ownedBoatIds: [],
  selectedCrewIds: [],
  provisions: [],
  strategy: DEFAULT_STRATEGY,
  profile: { fleet: [] },
  condition: DEFAULT_CONDITION,
  history: [],
  eventLog: [],
  tutorialSeen: false,
  scoringSeen: false,
};

export type Action =
  | { type: 'LOAD_STATE'; payload: GameState }
  | { type: 'SELECT_RACE'; payload: { raceId: string; division: DivisionKey } }
  | { type: 'SELECT_BOAT'; payload: string }
  | { type: 'TOGGLE_CREW'; payload: { crewId: string; capacity: number } }
  | { type: 'SET_CREW'; payload: string[] }
  | { type: 'SET_PROVISION'; payload: { provisionId: string; quantity: number } }
  | { type: 'SET_PROVISIONS'; payload: ProvisionSelection[] }
  | { type: 'SET_STRATEGY'; payload: Partial<PlayerStrategy> }
  | {
      type: 'APPLY_START';
      payload: {
        startSpeedMul: number;
        startFadeNm: number;
        timePenaltyH: number;
        bias: RoutingBias;
        rating: number;
      };
    }
  | { type: 'SET_TUTORIAL_SEEN' }
  | { type: 'SET_SCORING_SEEN' }
  | { type: 'MARK_HONOURS_SEEN'; payload: string[] }
  | { type: 'ADD_FLEET_BOAT'; payload: { boat: FleetBoat; cost: number } }
  | { type: 'REMOVE_FLEET_BOAT'; payload: string }
  | { type: 'SET_PLAYER_PROFILE'; payload: PlayerProfile }
  | { type: 'SET_CURRENCY'; payload: Currency }
  | { type: 'BUY_SAIL'; payload: { boatId: string; sailId: string; cost: number } }
  | { type: 'SELL_SAIL'; payload: { boatId: string; sailId: string; refund: number } }
  | {
      type: 'BEGIN_RACE';
      payload: {
        progress: RaceProgress;
        condition: BoatCondition;
        weather: WeatherCondition;
        windField: WindField;
        tidalField: TidalField;
        fleet: Competitor[];
        cost: number;
        scenario?: WeatherScenarioStamp;
      };
    }
  | { type: 'RESEED_WEATHER'; payload: ReseedPayload }
  | {
      type: 'APPLY_STEP';
      payload: {
        progress: RaceProgress;
        condition: BoatCondition;
        weather: WeatherCondition;
        fleet: Competitor[];
        log?: string;
      };
    }
  | { type: 'FINISH_RACE'; payload: { result: RaceResult } }
  | { type: 'PREPARE_NEXT_RACE' }
  | { type: 'RESET_CAMPAIGN' };

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;

    case 'SELECT_RACE':
      return {
        ...state,
        selectedRaceId: action.payload.raceId,
        selectedDivision: action.payload.division,
      };

    case 'SELECT_BOAT': {
      const boat =
        getBoatById(action.payload) ??
        state.profile.fleet.find((b) => b.id === action.payload);
      // Trim the crew if the new boat has fewer berths.
      const trimmed = boat
        ? state.selectedCrewIds.slice(0, boat.crewCapacity)
        : state.selectedCrewIds;
      return { ...state, selectedBoatId: action.payload, selectedCrewIds: trimmed };
    }

    case 'TOGGLE_CREW': {
      const { crewId, capacity } = action.payload;
      const already = state.selectedCrewIds.includes(crewId);
      if (already) {
        return {
          ...state,
          selectedCrewIds: state.selectedCrewIds.filter((id) => id !== crewId),
        };
      }
      if (state.selectedCrewIds.length >= capacity) {
        return state; // berths full
      }
      return { ...state, selectedCrewIds: [...state.selectedCrewIds, crewId] };
    }

    // Set the whole crew at once (auto-crew presets, or sanitizing the roster
    // when the eligible pool changes).
    case 'SET_CREW':
      return { ...state, selectedCrewIds: action.payload };

    case 'SET_PROVISION': {
      const { provisionId, quantity } = action.payload;
      const others = state.provisions.filter((p) => p.provisionId !== provisionId);
      if (quantity <= 0) {
        return { ...state, provisions: others };
      }
      return {
        ...state,
        provisions: [...others, { provisionId, quantity }],
      };
    }

    case 'SET_PROVISIONS':
      return { ...state, provisions: action.payload.filter((p) => p.quantity > 0) };

    case 'SET_STRATEGY':
      return { ...state, strategy: { ...state.strategy, ...action.payload } };

    case 'APPLY_START': {
      // Bake the start sequence's result into the opening leg: a real gun position
      // (the fleet spread + the player's lead, via seedStartGrid), a clean-/dirty-
      // air speed factor, a committed first-beat bias, and any time penalty (a poor
      // start or OCS). No progress yet → ignore (defensive).
      if (!state.progress) return state;
      const race = getRaceById(state.selectedRaceId);
      const { startSpeedMul, startFadeNm, timePenaltyH, bias, rating } = action.payload;
      const seeded = race
        ? seedStartGrid(state.progress, state.fleet ?? [], race, rating)
        : { progress: state.progress, fleet: state.fleet ?? [] };
      return {
        ...state,
        strategy: { ...state.strategy, bias },
        fleet: seeded.fleet,
        progress: {
          ...seeded.progress,
          startSpeedMul,
          startFadeNm,
          elapsedHours: seeded.progress.elapsedHours + timePenaltyH,
        },
      };
    }

    case 'SET_TUTORIAL_SEEN':
      return { ...state, tutorialSeen: true };

    case 'SET_SCORING_SEEN':
      return { ...state, scoringSeen: true };

    // Union the shown honours in (display-only, like tutorialSeen) so an
    // earn-moment fires exactly once.
    case 'MARK_HONOURS_SEEN':
      return {
        ...state,
        seenHonourIds: [...new Set([...(state.seenHonourIds ?? []), ...action.payload])],
      };

    case 'ADD_FLEET_BOAT':
      // Affordability is the reducer's contract, not just the buy screen's: refuse
      // rather than drive funds negative. A no-op in normal play (the UI gates the
      // purchase); the guard closes the negative-balance path if that gate is ever
      // bypassed. It never MASKS an overcharge — it declines the whole action.
      if (action.payload.cost > state.funds) return state;
      return {
        ...state,
        funds: state.funds - action.payload.cost,
        profile: { ...state.profile, fleet: [...state.profile.fleet, action.payload.boat] },
      };

    case 'REMOVE_FLEET_BOAT':
      return {
        ...state,
        profile: {
          ...state.profile,
          fleet: state.profile.fleet.filter((b) => b.id !== action.payload),
        },
        selectedBoatId:
          state.selectedBoatId === action.payload ? undefined : state.selectedBoatId,
      };

    case 'BUY_SAIL': {
      const { boatId, sailId, cost } = action.payload;
      // Same affordability contract as ADD_FLEET_BOAT: refuse rather than go
      // negative (a no-op in the UI-gated happy path; closes the exploit).
      if (cost > state.funds) return state;
      return {
        ...state,
        funds: state.funds - cost,
        profile: {
          ...state.profile,
          fleet: state.profile.fleet.map((b) =>
            b.id === boatId && !(b.sails ?? []).includes(sailId)
              ? { ...b, sails: [...(b.sails ?? []), sailId] }
              : b
          ),
        },
      };
    }

    case 'SELL_SAIL': {
      const { boatId, sailId, refund } = action.payload;
      return {
        ...state,
        funds: state.funds + refund,
        profile: {
          ...state.profile,
          fleet: state.profile.fleet.map((b) =>
            b.id === boatId
              ? { ...b, sails: (b.sails ?? []).filter((id) => id !== sailId) }
              : b
          ),
        },
      };
    }

    case 'SET_PLAYER_PROFILE':
      return {
        ...state,
        profile: { ...state.profile, player: action.payload },
      };

    case 'SET_CURRENCY':
      return state.profile.player
        ? {
            ...state,
            profile: {
              ...state.profile,
              player: { ...state.profile.player, currency: action.payload },
            },
          }
        : state;

    case 'BEGIN_RACE':
      return {
        ...state,
        funds: state.funds - action.payload.cost,
        // Players start on the Balanced auto-helm (the engine's DEFAULT_STRATEGY
        // stays `manual` so the golden stream is untouched; the player race seeds
        // the dial here). Persisting the chosen mode across races is a v2.
        strategy: { ...DEFAULT_STRATEGY, sailMode: 'balanced' },
        ownedBoatIds:
          state.selectedBoatId && !state.ownedBoatIds.includes(state.selectedBoatId)
            ? [...state.ownedBoatIds, state.selectedBoatId]
            : state.ownedBoatIds,
        progress: action.payload.progress,
        condition: action.payload.condition,
        weather: action.payload.weather,
        windField: action.payload.windField,
        tidalField: action.payload.tidalField,
        fleet: action.payload.fleet,
        scenario: action.payload.scenario,
        lastResult: undefined,
        eventLog: [],
      };

    // Swap the pre-start conditions (seasonal ↔ a weather scenario) atomically —
    // the guard lives in applyReseed, which never nulls `progress`.
    case 'RESEED_WEATHER':
      return applyReseed(state, action.payload);

    case 'APPLY_STEP':
      return {
        ...state,
        progress: action.payload.progress,
        condition: action.payload.condition,
        weather: action.payload.weather,
        fleet: action.payload.fleet,
        eventLog: action.payload.log
          ? [...state.eventLog, action.payload.log]
          : state.eventLog,
      };

    case 'FINISH_RACE':
      return {
        ...state,
        funds: state.funds + action.payload.result.prizeMoney,
        lastResult: action.payload.result,
        history: [action.payload.result, ...state.history].slice(0, 50),
        // Fold this finish into the lifetime record (never truncates, unlike the
        // 50-race history). `state.history` here is the PRE-race history, so
        // `hydrateCareer` produces a complete prior floor once (recovering the
        // new distinct-race SET fields for a PR-1-era record, or building from
        // history when there's no record yet), and `applyRaceToCareer` folds the
        // new result exactly once — the new result is only prepended to `history`
        // in the same return, so it is never double-counted.
        career: applyRaceToCareer(
          hydrateCareer(state.career, state.history),
          action.payload.result
        ),
        progress: undefined,
        weather: undefined,
        windField: undefined,
        tidalField: undefined,
        fleet: undefined,
        scenario: undefined,
      };

    case 'PREPARE_NEXT_RACE':
      return {
        ...state,
        // Sponsor top-up so the player can always afford the next campaign.
        funds: applyStipend(state.funds),
        selectedRaceId: undefined,
        selectedDivision: 'corinthian',
        selectedBoatId: undefined,
        selectedCrewIds: [],
        provisions: [],
        progress: undefined,
        weather: undefined,
        windField: undefined,
        tidalField: undefined,
        fleet: undefined,
        scenario: undefined,
        condition: DEFAULT_CONDITION,
      };

    case 'RESET_CAMPAIGN':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}
