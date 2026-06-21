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
  DivisionKey,
  GameState,
  RaceProgress,
  RaceResult,
  StepResult,
  Competitor,
  FleetBoat,
  PlayerStrategy,
  TacticalChoice,
  WeatherCondition,
  WindField,
} from '../types';
import {
  CREW,
  STARTING_FUNDS,
  applyStipend,
  getBoatById,
  getCrewById,
  getRaceById,
} from '../data';
import {
  DEFAULT_STRATEGY,
  applyDecision,
  buildResult,
  campaignCost,
  defaultStepNm,
  initialCondition,
  initialProgress,
  raceDivision,
  resolveBoatById,
  stepRace,
} from '../engine/gameEngine';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createFleet } from '../engine/fleet';
import { clearState, loadState, saveState } from './storage';
import { useAuth } from './AuthContext';
import { loadCloudSave, saveCloud } from '../services/cloudSave';
import { submitToLeaderboard } from '../services/leaderboard';

const DEFAULT_CONDITION: BoatCondition = {
  hullIntegrity: 100,
  crewStamina: 100,
  crewMorale: 100,
};

const INITIAL_STATE: GameState = {
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
};

type Action =
  | { type: 'LOAD_STATE'; payload: GameState }
  | { type: 'SELECT_RACE'; payload: { raceId: string; division: DivisionKey } }
  | { type: 'SELECT_BOAT'; payload: string }
  | { type: 'TOGGLE_CREW'; payload: { crewId: string; capacity: number } }
  | { type: 'SET_PROVISION'; payload: { provisionId: string; quantity: number } }
  | { type: 'SET_STRATEGY'; payload: Partial<PlayerStrategy> }
  | { type: 'SET_TUTORIAL_SEEN' }
  | { type: 'ADD_FLEET_BOAT'; payload: { boat: FleetBoat; cost: number } }
  | { type: 'REMOVE_FLEET_BOAT'; payload: string }
  | {
      type: 'BEGIN_RACE';
      payload: {
        progress: RaceProgress;
        condition: BoatCondition;
        weather: WeatherCondition;
        windField: WindField;
        fleet: Competitor[];
        cost: number;
      };
    }
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

function reducer(state: GameState, action: Action): GameState {
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

    case 'SET_STRATEGY':
      return { ...state, strategy: { ...state.strategy, ...action.payload } };

    case 'SET_TUTORIAL_SEEN':
      return { ...state, tutorialSeen: true };

    case 'ADD_FLEET_BOAT':
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

    case 'BEGIN_RACE':
      return {
        ...state,
        funds: state.funds - action.payload.cost,
        strategy: DEFAULT_STRATEGY,
        ownedBoatIds:
          state.selectedBoatId && !state.ownedBoatIds.includes(state.selectedBoatId)
            ? [...state.ownedBoatIds, state.selectedBoatId]
            : state.ownedBoatIds,
        progress: action.payload.progress,
        condition: action.payload.condition,
        weather: action.payload.weather,
        windField: action.payload.windField,
        fleet: action.payload.fleet,
        lastResult: undefined,
        eventLog: [],
      };

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
        progress: undefined,
        weather: undefined,
        windField: undefined,
        fleet: undefined,
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
        fleet: undefined,
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
  selectRace: (raceId: string, division: DivisionKey) => void;
  selectBoat: (boatId: string) => void;
  toggleCrew: (crewId: string) => void;
  setProvisionQuantity: (provisionId: string, quantity: number) => void;
  setStrategy: (partial: Partial<PlayerStrategy>) => void;
  markTutorialSeen: () => void;
  addFleetBoat: (boat: FleetBoat, cost: number) => void;
  removeFleetBoat: (id: string) => void;
  // race lifecycle
  beginRace: () => void;
  tick: () => StepResult;
  decide: (choice: TacticalChoice) => StepResult;
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

  const { user, displayName, configured, loading: authLoading } = useAuth();

  // Keep the freshest state and identity available to imperative calls.
  const stateRef = useRef(state);
  stateRef.current = state;
  const userRef = useRef(user);
  userRef.current = user;
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;

  // Tracks which save "scope" (a user id, or 'local') is currently loaded so
  // we reload when the signed-in user changes.
  const loadedScopeRef = useRef<string | null>(null);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load the right save once auth has resolved, and again whenever the user
  // signs in or out. Cloud save wins for signed-in users; otherwise local.
  useEffect(() => {
    if (authLoading) return;
    const scope = user && configured ? user.id : 'local';
    if (loadedScopeRef.current === scope) return;
    loadedScopeRef.current = scope;

    let mounted = true;
    setReady(false);
    (async () => {
      let loaded: GameState | null = null;
      if (user && configured) {
        loaded = await loadCloudSave(user.id);
      }
      if (!loaded) {
        loaded = await loadState();
      }
      if (!mounted) return;
      let merged = loaded ? { ...INITIAL_STATE, ...loaded } : INITIAL_STATE;
      // Top up a chest that has run dry between sessions.
      if (!merged.progress) merged = { ...merged, funds: applyStipend(merged.funds) };
      // Drop an in-progress race that references a race no longer in the roster
      // (e.g. after a content update) so the player can't get stranded.
      if (merged.selectedRaceId && !getRaceById(merged.selectedRaceId)) {
        merged = {
          ...merged,
          selectedRaceId: undefined,
          selectedBoatId: undefined,
          selectedCrewIds: [],
          provisions: [],
          progress: undefined,
          weather: undefined,
          condition: DEFAULT_CONDITION,
        };
      }
      dispatch({ type: 'LOAD_STATE', payload: merged });
      setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [user, configured, authLoading]);

  // Persist after every change: always to local cache, and (debounced) to the
  // cloud when signed in.
  useEffect(() => {
    if (!ready) return;
    saveState(state);
    if (user && configured) {
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
      const userId = user.id;
      const snapshot = state;
      cloudSaveTimer.current = setTimeout(() => {
        saveCloud(userId, snapshot);
      }, 1200);
    }
  }, [state, ready, user, configured]);

  const selectRace = useCallback((raceId: string, division: DivisionKey) => {
    dispatch({ type: 'SELECT_RACE', payload: { raceId, division } });
  }, []);

  const selectBoat = useCallback((boatId: string) => {
    dispatch({ type: 'SELECT_BOAT', payload: boatId });
  }, []);

  const toggleCrew = useCallback((crewId: string) => {
    const boat = resolveBoatById(stateRef.current, stateRef.current.selectedBoatId);
    const capacity = boat ? boat.crewCapacity : CREW.length;
    dispatch({ type: 'TOGGLE_CREW', payload: { crewId, capacity } });
  }, []);

  const setProvisionQuantity = useCallback(
    (provisionId: string, quantity: number) => {
      dispatch({ type: 'SET_PROVISION', payload: { provisionId, quantity } });
    },
    []
  );

  const setStrategy = useCallback((partial: Partial<PlayerStrategy>) => {
    dispatch({ type: 'SET_STRATEGY', payload: partial });
  }, []);

  const markTutorialSeen = useCallback(() => {
    dispatch({ type: 'SET_TUTORIAL_SEEN' });
  }, []);

  const addFleetBoat = useCallback((boat: FleetBoat, cost: number) => {
    dispatch({ type: 'ADD_FLEET_BOAT', payload: { boat, cost } });
  }, []);

  const removeFleetBoat = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FLEET_BOAT', payload: id });
  }, []);

  const campaignTotal = useCallback(() => campaignCost(stateRef.current).total, []);

  const canAffordCampaign = useCallback(
    () => stateRef.current.funds >= campaignCost(stateRef.current).total,
    []
  );

  const beginRace = useCallback(() => {
    const current = stateRef.current;
    const race = getRaceById(current.selectedRaceId);
    const boat = resolveBoatById(current, current.selectedBoatId);
    if (!race || !boat) return;
    const crew = current.selectedCrewIds
      .map((id) => getCrewById(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const cost = campaignCost(current).total;
    const windField = createWindField(race);
    const start = race.waypoints[0];
    const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
    const fleet = createFleet(race, raceDivision(race, current.selectedDivision));
    dispatch({
      type: 'BEGIN_RACE',
      payload: {
        progress: initialProgress(race, boat, current.selectedDivision, windField),
        condition: initialCondition(crew, current.provisions),
        weather,
        windField,
        fleet,
        cost,
      },
    });
  }, []);

  // Push a completed race to the global leaderboard when signed in.
  const publishResult = useCallback((result: RaceResult) => {
    const currentUser = userRef.current;
    if (!currentUser || !configured) return;
    submitToLeaderboard({
      user_id: currentUser.id,
      display_name: displayNameRef.current ?? 'Sailor',
      race_id: result.raceId,
      race_name: result.raceName,
      position: result.position,
      fleet_size: result.fleetSize,
      elapsed_hours: result.elapsedHours,
      prize_money: result.prizeMoney,
      retired: result.retired,
    });
  }, [configured]);

  // Applies a step/decision outcome to state and finalizes the race if it ended.
  const applyOutcome = useCallback(
    (outcome: StepResult) => {
      const current = stateRef.current;
      dispatch({
        type: 'APPLY_STEP',
        payload: {
          progress: outcome.progress,
          condition: outcome.condition,
          weather: outcome.weather,
          fleet: outcome.fleet,
          log: outcome.log,
        },
      });
      if (outcome.finished || outcome.retired) {
        const result = buildResult(current, outcome);
        dispatch({ type: 'FINISH_RACE', payload: { result } });
        publishResult(result);
      }
    },
    [publishResult]
  );

  // One auto-play tick: advance the boat until the next decision or the finish.
  const tick = useCallback((): StepResult => {
    const current = stateRef.current;
    const race = getRaceById(current.selectedRaceId);
    const outcome = stepRace(current, race ? defaultStepNm(race) : 1);
    applyOutcome(outcome);
    return outcome;
  }, [applyOutcome]);

  // Resolve the active decision with the player's choice.
  const decide = useCallback(
    (choice: TacticalChoice): StepResult => {
      const outcome = applyDecision(stateRef.current, choice);
      applyOutcome(outcome);
      return outcome;
    },
    [applyOutcome]
  );

  const retireRace = useCallback(() => {
    const current = stateRef.current;
    const race = getRaceById(current.selectedRaceId);
    if (!race || !current.progress || !current.weather) return;
    const fleetSize = raceDivision(race, current.selectedDivision).fleetSize;
    const outcome: StepResult = {
      progress: { ...current.progress, position: fleetSize },
      condition: current.condition,
      weather: current.weather,
      fleet: current.fleet ?? [],
      event: null,
      log: `Retired from ${race.name}.`,
      finished: false,
      retired: true,
    };
    const result = buildResult(current, outcome);
    dispatch({ type: 'FINISH_RACE', payload: { result } });
    publishResult(result);
  }, [publishResult]);

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
      setStrategy,
      markTutorialSeen,
      addFleetBoat,
      removeFleetBoat,
      beginRace,
      tick,
      decide,
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
      setStrategy,
      markTutorialSeen,
      addFleetBoat,
      removeFleetBoat,
      beginRace,
      tick,
      decide,
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
