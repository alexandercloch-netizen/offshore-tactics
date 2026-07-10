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
  Currency,
  DivisionKey,
  GameState,
  RaceProgress,
  RaceResult,
  StepResult,
  Competitor,
  FleetBoat,
  PlayerProfile,
  PlayerStrategy,
  ProvisionSelection,
  RoutingBias,
  StartOutcome,
  TacticalChoice,
  TidalField,
  WeatherCondition,
  WeatherScenario,
  WeatherScenarioStamp,
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
  DECISION_EXPIRED_LOG,
  DEFAULT_STRATEGY,
  applyDecision,
  buildResult,
  campaignCost,
  defaultStepNm,
  expireDecision,
  fleetBenchmarkHours,
  initialCondition,
  initialProgress,
  raceDivision,
  resolveBoatById,
  resolveSailChange,
  seedStartGrid,
  stepRace,
} from '../engine/gameEngine';
import { createWindField, sampleWind, weatherFromWind } from '../engine/wind';
import { createTidalField } from '../engine/current';
import { createFleet } from '../engine/fleet';
import { applyRaceToCareer, careerFrom } from '../engine/career';
import { AppState } from 'react-native';
import { clearState, loadState, saveState, GUEST_SCOPE } from './storage';
import { reconcileSaves, isNewerSave } from './reconcile';
import { detectCurrency, formatMoney } from '../lib/currency';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { loadCloudSave, saveCloud } from '../services/cloudSave';
import { submitRaceResult } from '../services/leaderboard';
import { scenarioStamp } from '../services/weather';
import { applyReseed, ReseedPayload } from './reseed';

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

    case 'BUY_SAIL': {
      const { boatId, sailId, cost } = action.payload;
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
        strategy: DEFAULT_STRATEGY,
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
        // `careerFrom` computes the prior floor once for a save with no record
        // yet, and `applyRaceToCareer` folds the new result exactly once — the
        // new result is only prepended to `history` in the same return, so it is
        // never double-counted.
        career: applyRaceToCareer(
          state.career ?? careerFrom(state.history),
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

export interface GameContextValue {
  state: GameState;
  ready: boolean;
  // selection actions
  selectRace: (raceId: string, division: DivisionKey) => void;
  selectBoat: (boatId: string) => void;
  toggleCrew: (crewId: string) => void;
  setCrew: (crewIds: string[]) => void;
  setProvisionQuantity: (provisionId: string, quantity: number) => void;
  setProvisions: (selections: ProvisionSelection[]) => void;
  setStrategy: (partial: Partial<PlayerStrategy>) => void;
  applyStart: (outcome: StartOutcome) => void;
  markTutorialSeen: () => void;
  addFleetBoat: (boat: FleetBoat, cost: number) => void;
  removeFleetBoat: (id: string) => void;
  buySail: (boatId: string, sailId: string, cost: number) => void;
  sellSail: (boatId: string, sailId: string, refund: number) => void;
  setPlayerProfile: (profile: PlayerProfile) => void;
  setCurrency: (currency: Currency) => void;
  // formatting
  currency: Currency;
  money: (amount: number) => string;
  // race lifecycle
  beginRace: (scenario?: WeatherScenario | null) => void;
  reseedWeather: (scenario: WeatherScenario | null) => void;
  tick: () => StepResult;
  decide: (choice: TacticalChoice) => StepResult;
  // Wave the docked opportunity off ("hold course") without answering it. NOT
  // a decision: zero RNG draws, zero deltas, the slot handed back — just the
  // one quiet race-log line.
  dismissEvent: () => void;
  // Commit a manual sail change (the picker). Null = a no-op (same sail,
  // unknown id, or a sail blown out this race) — nothing applied, no RNG drawn.
  changeSail: (sailId: string) => StepResult | null;
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
  // we reload when the signed-in user changes. `scopeRef` is the live scope used
  // by the imperative save path.
  const loadedScopeRef = useRef<string | null>(null);
  const scopeRef = useRef<string>(GUEST_SCOPE);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The savedAt of the most recent save we pushed to or adopted from the cloud,
  // used to ignore our own Realtime echo and stale pushes.
  const lastSyncedAtRef = useRef<number>(0);
  // Set when we adopt a Realtime push so the resulting state change isn't
  // re-uploaded (the cloud already holds it) — prevents a cross-device echo loop.
  const skipCloudPushRef = useRef(false);
  // Crash-recovery: throttle the mid-race local write to ~1s, but always flush on
  // a decision boundary and at the finish. `lastLocalSaveRef` stamps the last
  // write; `localFlushTimer` holds a pending trailing save; `lastDecisionsRef`
  // detects a decision so we can force an immediate write.
  const lastLocalSaveRef = useRef<number>(0);
  const localFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastDecisionsRef = useRef<number>(0);
  // Cloud-save retry: the last durable snapshot that failed to reach the cloud,
  // re-flushed on app foreground / reconnect so a dropped save isn't lost.
  const pendingCloudRef = useRef<GameState | null>(null);
  const LOCAL_SAVE_THROTTLE_MS = 1000;

  // Load the right save once auth has resolved, and again whenever the user
  // signs in or out: reconcile local and cloud (newest-wins, assets merged).
  useEffect(() => {
    if (authLoading) return;
    const scope = user && configured ? user.id : GUEST_SCOPE;
    if (loadedScopeRef.current === scope) return;
    const prevScope = loadedScopeRef.current;
    loadedScopeRef.current = scope;
    scopeRef.current = scope;

    let mounted = true;
    setReady(false);
    (async () => {
      // Load this scope's own local cache (namespaced per user, so accounts never
      // share a device cache) and, when signed in, the cloud save.
      const localSave = await loadState(scope);
      const cloudSave = user && configured ? await loadCloudSave(user.id) : null;

      // A first, in-session guest→user sign-in folds the guest device save in —
      // and unions funds so money earned offline as a guest carries over. Any
      // other transition (a fresh start already signed in, or switching between
      // two accounts) does NOT merge the guest/other save: it would leak one
      // account's progress and funds into another. The guest cache is cleared
      // once absorbed so a later second account can't inherit it too.
      const guestToUser = scope !== GUEST_SCOPE && prevScope === GUEST_SCOPE;
      let loaded: GameState | null;
      if (guestToUser) {
        const guestSave = await loadState(GUEST_SCOPE);
        const withGuest = reconcileSaves(guestSave, cloudSave, true);
        loaded = reconcileSaves(localSave, withGuest, true);
        if (guestSave) await clearState(GUEST_SCOPE);
      } else {
        // Same account across devices: newest-wins on funds (no union) to close
        // the stale-device refund exploit; assets still merge.
        loaded = reconcileSaves(localSave, cloudSave, false);
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

  // Persist after every change: to the (scoped) local cache, and — debounced —
  // to the cloud when signed in.
  useEffect(() => {
    if (!ready) return;
    const savedAt = Date.now();
    const snapshot: GameState = { ...state, savedAt };
    const scope = scopeRef.current;

    // Local crash-recovery cache. Mid-race the state changes every ~150ms tick,
    // so writing it every tick is wasteful; throttle to ~1s. But ALWAYS flush
    // immediately on a decision boundary and at the finish, so a crash right after
    // a call (or on the results screen) never loses it.
    const isRacing = !!state.progress;
    const decisions = state.progress?.decisionsTaken ?? 0;
    const decisionFired = decisions !== lastDecisionsRef.current;
    lastDecisionsRef.current = decisions;
    const now = Date.now();
    const flushLocalNow = () => {
      if (localFlushTimer.current) {
        clearTimeout(localFlushTimer.current);
        localFlushTimer.current = null;
      }
      lastLocalSaveRef.current = Date.now();
      saveState({ ...stateRef.current, savedAt: Date.now() }, scope);
    };
    if (!isRacing || decisionFired || now - lastLocalSaveRef.current >= LOCAL_SAVE_THROTTLE_MS) {
      flushLocalNow();
    } else if (!localFlushTimer.current) {
      const wait = LOCAL_SAVE_THROTTLE_MS - (now - lastLocalSaveRef.current);
      localFlushTimer.current = setTimeout(flushLocalNow, Math.max(0, wait));
    }

    // Don't sync to the cloud mid-race: it would upload the full live-race state
    // (fleet, wind field, route, trail) on a tight debounce every tick, and no
    // other device can adopt a race in progress anyway (see the Realtime guard
    // below). The local cache still saves for crash recovery; the cloud syncs the
    // durable campaign state at the next race boundary.
    if (user && configured && !state.progress) {
      // A change we just adopted from another device is already in the cloud —
      // cache it locally but don't re-upload it.
      if (skipCloudPushRef.current) {
        skipCloudPushRef.current = false;
        return;
      }
      // Mark this stamp as ours so the Realtime echo of this write is ignored.
      lastSyncedAtRef.current = savedAt;
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
      cloudSaveTimer.current = setTimeout(async () => {
        const ok = await saveCloud(snapshot);
        // A failed save is remembered and re-flushed on foreground/reconnect.
        pendingCloudRef.current = ok ? null : snapshot;
      }, 1200);
    }
  }, [state, ready, user, configured]);

  // Cloud-save retry: when the app returns to the foreground (or the tab regains
  // focus on web), re-flush any save that failed to reach the cloud.
  useEffect(() => {
    if (!configured) return undefined;
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      const pending = pendingCloudRef.current;
      if (!pending || !userRef.current) return;
      const ok = await saveCloud(pending);
      if (ok) pendingCloudRef.current = null;
    });
    return () => sub.remove();
  }, [configured]);

  // Live multi-device sync: adopt a newer save pushed from another device,
  // unless a race is in progress here (never interrupt a live race).
  useEffect(() => {
    if (!ready || !user || !configured || !supabase) return;
    const channel = supabase
      .channel(`saves:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saves', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const incoming = (payload.new as { state?: GameState } | null)?.state;
          if (!incoming) return;
          const current = stateRef.current;
          if (current.progress) return; // don't disrupt an active race
          // Compare against the last thing we synced, not just current state,
          // so our own echo and stale rows are ignored.
          const baseline = Math.max(current.savedAt ?? 0, lastSyncedAtRef.current);
          if (!isNewerSave(incoming, { savedAt: baseline } as GameState)) return;
          // Cancel a debounced upload racing this push so we don't clobber the
          // newer remote state we're about to adopt.
          if (cloudSaveTimer.current) {
            clearTimeout(cloudSaveTimer.current);
            cloudSaveTimer.current = null;
          }
          lastSyncedAtRef.current = incoming.savedAt ?? Date.now();
          skipCloudPushRef.current = true; // don't re-upload what we just adopted
          // Reconcile rather than blindly overwrite: the incoming save is newer
          // (guarded above), but fold in any campaign assets that exist only in
          // our current state so a race just finished locally isn't dropped. Same
          // account, so no funds union (newest-wins).
          const merged =
            reconcileSaves(current, { ...INITIAL_STATE, ...incoming }, false) ?? current;
          dispatch({ type: 'LOAD_STATE', payload: merged });
        }
      )
      .subscribe();
    return () => {
      supabase?.removeChannel(channel);
    };
  }, [ready, user, configured]);

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

  const setCrew = useCallback((crewIds: string[]) => {
    dispatch({ type: 'SET_CREW', payload: crewIds });
  }, []);

  const setProvisionQuantity = useCallback(
    (provisionId: string, quantity: number) => {
      dispatch({ type: 'SET_PROVISION', payload: { provisionId, quantity } });
    },
    []
  );

  const setProvisions = useCallback((selections: ProvisionSelection[]) => {
    dispatch({ type: 'SET_PROVISIONS', payload: selections });
  }, []);

  const setStrategy = useCallback((partial: Partial<PlayerStrategy>) => {
    dispatch({ type: 'SET_STRATEGY', payload: partial });
  }, []);

  const applyStart = useCallback((outcome: StartOutcome) => {
    dispatch({
      type: 'APPLY_START',
      payload: {
        startSpeedMul: outcome.speedMul,
        startFadeNm: outcome.fadeNm,
        timePenaltyH: outcome.timePenaltyH,
        bias: outcome.bias,
        rating: outcome.rating,
      },
    });
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

  const buySail = useCallback((boatId: string, sailId: string, cost: number) => {
    dispatch({ type: 'BUY_SAIL', payload: { boatId, sailId, cost } });
  }, []);

  const sellSail = useCallback((boatId: string, sailId: string, refund: number) => {
    dispatch({ type: 'SELL_SAIL', payload: { boatId, sailId, refund } });
  }, []);

  const setPlayerProfile = useCallback((profile: PlayerProfile) => {
    dispatch({ type: 'SET_PLAYER_PROFILE', payload: profile });
  }, []);

  const setCurrency = useCallback((currency: Currency) => {
    dispatch({ type: 'SET_CURRENCY', payload: currency });
  }, []);

  // The money symbol to show: the player's choice, else auto-detected from the
  // device locale. `money` formats any amount with it.
  const currency: Currency = state.profile.player?.currency ?? detectCurrency();
  const money = useCallback((amount: number) => formatMoney(amount, currency), [currency]);

  const campaignTotal = useCallback(() => campaignCost(stateRef.current).total, []);

  const canAffordCampaign = useCallback(
    () => stateRef.current.funds >= campaignCost(stateRef.current).total,
    []
  );

  // Commit the race. `scenario` is an ALREADY-RESOLVED weather scenario (or
  // null/undefined for the seasonal default) — never a pending fetch: the start
  // path must never await the network.
  const beginRace = useCallback((scenario?: WeatherScenario | null) => {
    const current = stateRef.current;
    const race = getRaceById(current.selectedRaceId);
    const boat = resolveBoatById(current, current.selectedBoatId);
    if (!race || !boat) return;
    const crew = current.selectedCrewIds
      .map((id) => getCrewById(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    const cost = campaignCost(current).total;
    const windField = createWindField(race, scenario ?? undefined);
    const tidalField = createTidalField(race);
    const start = race.waypoints[0];
    const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
    const fleet = createFleet(
      race,
      raceDivision(race, current.selectedDivision),
      fleetBenchmarkHours(race, windField, boat),
      boat
    );
    dispatch({
      type: 'BEGIN_RACE',
      payload: {
        progress: initialProgress(race, boat, current.selectedDivision, windField),
        condition: initialCondition(crew, current.provisions, race),
        weather,
        windField,
        tidalField,
        fleet,
        cost,
        scenario: scenario ? scenarioStamp(scenario) : undefined,
      },
    });
  }, []);

  // Re-seed the pre-start conditions for a chosen scenario (or back to the
  // seasonal default with null): a fresh wind field, a fleet re-benchmarked
  // through it, and a fresh start-line progress — dispatched as ONE action so
  // `progress` is never nulled in between (the Briefing mounts on it).
  const reseedWeather = useCallback((scenario: WeatherScenario | null) => {
    const current = stateRef.current;
    const race = getRaceById(current.selectedRaceId);
    const boat = resolveBoatById(current, current.selectedBoatId);
    if (!race || !boat || !current.progress) return;
    const windField = createWindField(race, scenario ?? undefined);
    const start = race.waypoints[0];
    const weather = weatherFromWind(sampleWind(windField, start.lat, start.lon, 0));
    const fleet = createFleet(
      race,
      raceDivision(race, current.selectedDivision),
      fleetBenchmarkHours(race, windField, boat),
      boat
    );
    dispatch({
      type: 'RESEED_WEATHER',
      payload: {
        progress: initialProgress(race, boat, current.selectedDivision, windField),
        weather,
        windField,
        fleet,
        scenario: scenario ? scenarioStamp(scenario) : undefined,
      },
    });
  }, []);

  // Push a completed race to the global leaderboard when signed in. A weather-
  // scenario run never posts (submitRaceResult fails closed on the stamp) — the
  // ranked ladder is the seasonal game only.
  const publishResult = useCallback((result: RaceResult) => {
    const currentUser = userRef.current;
    if (!currentUser || !configured) return;
    submitRaceResult(result, {
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

  // Retract the docked opportunity unanswered: pure state clearing through the
  // engine's expireDecision (draw-free — passing on a call is not a decision),
  // folded in through the same APPLY_STEP path so the log line lands with it.
  const dismissEvent = useCallback(() => {
    const current = stateRef.current;
    if (!current.progress || !current.weather) return;
    if (current.progress.decisionTriggerNm === undefined) return; // nothing docked
    dispatch({
      type: 'APPLY_STEP',
      payload: {
        progress: expireDecision(current.progress),
        condition: current.condition,
        weather: current.weather,
        fleet: current.fleet ?? [],
        log: DECISION_EXPIRED_LOG,
      },
    });
  }, []);

  // Commit a manual sail change from the picker and fold its outcome in.
  const changeSail = useCallback(
    (sailId: string): StepResult | null => {
      const outcome = resolveSailChange(stateRef.current, sailId);
      if (outcome) applyOutcome(outcome);
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
    clearState(scopeRef.current);
    dispatch({ type: 'RESET_CAMPAIGN' });
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      state,
      ready,
      selectRace,
      selectBoat,
      toggleCrew,
      setCrew,
      setProvisionQuantity,
      setProvisions,
      setStrategy,
      applyStart,
      markTutorialSeen,
      addFleetBoat,
      removeFleetBoat,
      buySail,
      sellSail,
      setPlayerProfile,
      setCurrency,
      currency,
      money,
      beginRace,
      reseedWeather,
      tick,
      decide,
      dismissEvent,
      changeSail,
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
      setCrew,
      setProvisionQuantity,
      setProvisions,
      setStrategy,
      applyStart,
      markTutorialSeen,
      addFleetBoat,
      removeFleetBoat,
      buySail,
      sellSail,
      setPlayerProfile,
      setCurrency,
      currency,
      money,
      beginRace,
      reseedWeather,
      tick,
      decide,
      dismissEvent,
      changeSail,
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
