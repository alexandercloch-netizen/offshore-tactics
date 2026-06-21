import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import {
  BoatCondition,
  GameEvent,
  GameState,
  LegOutcome,
  RaceProgress,
  RaceResult,
  TacticalChoice,
  WeatherCondition,
} from '../types';
import {
  CREW,
  STARTING_FUNDS,
  getBoatById,
  getCrewById,
  getRaceById,
  pickWeather,
} from '../data';
import {
  advanceLeg,
  buildResult,
  campaignCost,
  initialCondition,
  initialProgress,
  maybeEvent,
} from '../engine/gameEngine';
import { clearState, loadState, saveState } from './storage';

const DEFAULT_CONDITION: BoatCondition = {
  hullIntegrity: 100,
  crewStamina: 100,
  crewMorale: 100,
};

const INITIAL_STATE: GameState = {
  funds: STARTING_FUNDS,
  selectedCrewIds: [],
  provisions: [],
  condition: DEFAULT_CONDITION,
  history: [],
  eventLog: [],
};

type Action =
  | { type: 'LOAD_STATE'; payload: GameState }
  | { type: 'SELECT_RACE'; payload: string }
  | { type: 'SELECT_BOAT'; payload: string }
  | { type: 'TOGGLE_CREW'; payload: { crewId: string; capacity: number } }
  | { type: 'SET_PROVISION'; payload: { provisionId: string; quantity: number } }
  | {
      type: 'BEGIN_RACE';
      payload: {
        progress: RaceProgress;
        condition: BoatCondition;
        weather: WeatherCondition;
        cost: number;
      };
    }
  | {
      type: 'APPLY_LEG';
      payload: {
        progress: RaceProgress;
        condition: BoatCondition;
        weather: WeatherCondition;
        log: string;
      };
    }
  | { type: 'FINISH_RACE'; payload: { result: RaceResult } }
  | { type: 'PREPARE_NEXT_RACE' }
  | { type: 'RESET_CAMPAIGN' };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;

    case 'SELECT_RACE':
      return { ...state, selectedRaceId: action.payload };

    case 'SELECT_BOAT': {
      const boat = getBoatById(action.payload);
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

    case 'BEGIN_RACE':
      return {
        ...state,
        funds: state.funds - action.payload.cost,
        progress: action.payload.progress,
        condition: action.payload.condition,
        weather: action.payload.weather,
        lastResult: undefined,
        eventLog: [],
      };

    case 'APPLY_LEG':
      return {
        ...state,
        progress: action.payload.progress,
        condition: action.payload.condition,
        weather: action.payload.weather,
        eventLog: [...state.eventLog, action.payload.log],
      };

    case 'FINISH_RACE':
      return {
        ...state,
        funds: state.funds + action.payload.result.prizeMoney,
        lastResult: action.payload.result,
        history: [action.payload.result, ...state.history].slice(0, 50),
        progress: undefined,
        weather: undefined,
      };

    case 'PREPARE_NEXT_RACE':
      return {
        ...state,
        selectedRaceId: undefined,
        selectedBoatId: undefined,
        selectedCrewIds: [],
        provisions: [],
        progress: undefined,
        weather: undefined,
        condition: DEFAULT_CONDITION,
      };

    case 'RESET_CAMPAIGN':
      return { ...INITIAL_STATE };

    default:
      return state;
  }
}

export interface GameContextValue {
  state: GameState;
  ready: boolean;
  // selection actions
  selectRace: (raceId: string) => void;
  selectBoat: (boatId: string) => void;
  toggleCrew: (crewId: string) => void;
  setProvisionQuantity: (provisionId: string, quantity: number) => void;
  // race lifecycle
  beginRace: () => void;
  sailLeg: () => GameEvent | null;
  resolveLeg: (choice: TacticalChoice | null) => LegOutcome;
  retireRace: () => void;
  prepareNextRace: () => void;
  resetCampaign: () => void;
  // derived helpers
  campaignTotal: () => number;
  canAffordCampaign: () => boolean;
}

const GameContext = createContext<GameContextValue | undefined>(undefined);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [ready, setReady] = React.useState(false);

  // Keep the freshest state available to imperative engine calls.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load persisted state on mount.
  useEffect(() => {
    let mounted = true;
    loadState().then((saved) => {
      if (mounted && saved) {
        dispatch({ type: 'LOAD_STATE', payload: { ...INITIAL_STATE, ...saved } });
      }
      if (mounted) setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist after every change once loaded.
  useEffect(() => {
    if (ready) {
      saveState(state);
    }
  }, [state, ready]);

  const selectRace = useCallback((raceId: string) => {
    dispatch({ type: 'SELECT_RACE', payload: raceId });
  }, []);

  const selectBoat = useCallback((boatId: string) => {
    dispatch({ type: 'SELECT_BOAT', payload: boatId });
  }, []);

  const toggleCrew = useCallback((crewId: string) => {
    const boat = getBoatById(stateRef.current.selectedBoatId);
    const capacity = boat ? boat.crewCapacity : CREW.length;
    dispatch({ type: 'TOGGLE_CREW', payload: { crewId, capacity } });
  }, []);

  const setProvisionQuantity = useCallback(
    (provisionId: string, quantity: number) => {
      dispatch({ type: 'SET_PROVISION', payload: { provisionId, quantity } });
    },
    []
  );

  const campaignTotal = useCallback(() => campaignCost(stateRef.current).total, []);

  const canAffordCampaign = useCallback(
    () => stateRef.current.funds >= campaignCost(stateRef.current).total,
    []
  );

  const beginRace = useCallback(() => {
    const current = stateRef.current;
    const race = getRaceById(current.selectedRaceId);
    if (!race) return;
    const crew = current.selectedCrewIds
      .map((id) => getCrewById(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const cost = campaignCost(current).total;
    dispatch({
      type: 'BEGIN_RACE',
      payload: {
        progress: initialProgress(race),
        condition: initialCondition(crew, current.provisions),
        weather: pickWeather(),
        cost,
      },
    });
  }, []);

  const sailLeg = useCallback((): GameEvent | null => {
    return maybeEvent(stateRef.current);
  }, []);

  const resolveLeg = useCallback((choice: TacticalChoice | null): LegOutcome => {
    const current = stateRef.current;
    const outcome = advanceLeg(current, choice);
    dispatch({
      type: 'APPLY_LEG',
      payload: {
        progress: outcome.progress,
        condition: outcome.condition,
        weather: outcome.weather,
        log: outcome.log,
      },
    });
    if (outcome.finished || outcome.retired) {
      const result = buildResult(current, outcome);
      dispatch({ type: 'FINISH_RACE', payload: { result } });
    }
    return outcome;
  }, []);

  const retireRace = useCallback(() => {
    const current = stateRef.current;
    const race = getRaceById(current.selectedRaceId);
    if (!race || !current.progress || !current.weather) return;
    const outcome: LegOutcome = {
      progress: { ...current.progress, position: race.fleetSize },
      condition: current.condition,
      weather: current.weather,
      pointOfSail: 'Reach',
      legHours: 0,
      log: `Retired from ${race.name}.`,
      finished: false,
      retired: true,
    };
    const result = buildResult(current, outcome);
    dispatch({ type: 'FINISH_RACE', payload: { result } });
  }, []);

  const prepareNextRace = useCallback(() => {
    dispatch({ type: 'PREPARE_NEXT_RACE' });
  }, []);

  const resetCampaign = useCallback(() => {
    clearState();
    dispatch({ type: 'RESET_CAMPAIGN' });
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      ready,
      selectRace,
      selectBoat,
      toggleCrew,
      setProvisionQuantity,
      beginRace,
      sailLeg,
      resolveLeg,
      retireRace,
      prepareNextRace,
      resetCampaign,
      campaignTotal,
      canAffordCampaign,
    }),
    [
      state,
      ready,
      selectRace,
      selectBoat,
      toggleCrew,
      setProvisionQuantity,
      beginRace,
      sailLeg,
      resolveLeg,
      retireRace,
      prepareNextRace,
      resetCampaign,
      campaignTotal,
      canAffordCampaign,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
};

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return ctx;
}
