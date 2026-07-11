import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabParamList, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import { useAuth } from '../store/AuthContext';
import { defaultDivision, goalHeadline, recommendedRace } from '../engine/recommend';
import { BoardConditions, seasonalBoardConditions } from '../engine/sailNow';
import {
  fetchBoardConditions,
  fetchRegionFlow,
  fetchWorldFlow,
  LiveFlowGrid,
  liveWeatherEnabled,
  LIVE_REFRESH_MS,
  STALE_DEMOTE_MS,
} from '../services/weather';
import { RACES, getRaceById } from '../data';
import { getClassOption } from '../data/polarLibrary';
import NauticalButton from '../components/NauticalButton';
import HarbourDashboard from '../components/harbour/HarbourDashboard';
import { homeRegion, RegionKey } from '../components/harbour/regions';
import { confirmAction } from '../lib/confirm';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Race'>,
  NativeStackScreenProps<RootStackParamList>
>;

// The Harbour — the home screen as a sailing analytics dashboard. The screen
// owns navigation, the CTAs and the conditions fetch; everything visual lives
// in components/harbour. Charts stay readable, not vast, on a wide web window.
const MAX_CONTENT_WIDTH = 680;
const TWO_PANE_MAX_WIDTH = 1360;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { state, ready, prepareNextRace, selectRace } = useGame();
  const { user, displayName } = useAuth();
  const raceInProgress = !!state.progress;
  const player = state.profile.player;

  // First-run: send new players through the onboarding quiz (but never trap
  // someone mid-race or before their save has loaded).
  useEffect(() => {
    if (ready && !player && !raceInProgress) {
      navigation.navigate('Onboarding');
    }
  }, [ready, player, raceInProgress, navigation]);

  // The Harbour's weather, owned HERE (the dashboard stays props-driven and
  // network-free): the conditions board and the world flow lattice fetch in
  // parallel on mount, refetch on focus once LIVE_REFRESH_MS stale, and each
  // demotes whole-surface to its seasonal rung (and relabels) on a REAL timer
  // at STALE_DEMOTE_MS — never a live/seasonal mix. Region lattices are lazy
  // (one GET on first drill-in, session-cached in a ref), so a Harbour mount
  // costs at most three GETs: board + world + the open (home) region. Flag
  // off (CI, guests by default) means none of these code paths run.
  const [liveConditions, setLiveConditions] = useState<BoardConditions | null>(null);
  const [worldFlow, setWorldFlow] = useState<LiveFlowGrid | null>(null);
  const [regionFlows, setRegionFlows] = useState<Partial<Record<RegionKey, LiveFlowGrid>>>({});
  const regionCache = useRef(new Map<RegionKey, LiveFlowGrid | 'pending'>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const requestRegionFlow = useCallback((region: RegionKey) => {
    if (!liveWeatherEnabled()) return;
    const cached = regionCache.current.get(region);
    if (
      cached === 'pending' ||
      (cached && Date.now() - cached.fetchedAt < LIVE_REFRESH_MS)
    ) {
      return; // in flight or fresh — a drill-in is never a second GET
    }
    regionCache.current.set(region, 'pending');
    fetchRegionFlow(region).then((flow) => {
      if (!flow) {
        regionCache.current.delete(region); // a later drill-in may knock again
        return;
      }
      regionCache.current.set(region, flow);
      if (alive.current) setRegionFlows((prev) => ({ ...prev, [region]: flow }));
    });
  }, []);

  const refreshLive = useCallback(() => {
    if (!liveWeatherEnabled()) return;
    const stale = (at?: number) => at == null || Date.now() - at >= LIVE_REFRESH_MS;
    if (stale(liveConditions?.fetchedAt)) {
      fetchBoardConditions(RACES).then((board) => {
        if (alive.current && board) setLiveConditions(board);
      });
    }
    if (stale(worldFlow?.fetchedAt)) {
      fetchWorldFlow().then((flow) => {
        if (alive.current && flow) setWorldFlow(flow);
      });
    }
    // The home region is the chart on screen from the first frame — its
    // lattice is the third (and last) mount-time GET.
    requestRegionFlow(homeRegion(player?.region, recommendedRace(player, state.history)?.id));
  }, [liveConditions, worldFlow, requestRegionFlow, player, state.history]);

  // Mount + focus, never a background timer: refetch only when stale.
  useEffect(() => {
    refreshLive();
    return navigation.addListener('focus', refreshLive);
  }, [navigation, refreshLive]);

  // The demotion clocks are real timers (not the frozen per-mount `now`): a
  // live claim older than STALE_DEMOTE_MS stops being shown as live at all.
  useEffect(() => {
    if (liveConditions?.fetchedAt == null) return;
    const t = setTimeout(
      () => setLiveConditions(null),
      Math.max(0, liveConditions.fetchedAt + STALE_DEMOTE_MS - Date.now())
    );
    return () => clearTimeout(t);
  }, [liveConditions]);
  useEffect(() => {
    const stamps = [
      ...(worldFlow ? [worldFlow.fetchedAt] : []),
      ...Object.values(regionFlows).map((f) => (f as LiveFlowGrid).fetchedAt),
    ];
    if (stamps.length === 0) return;
    const t = setTimeout(() => {
      const cut = Date.now() - STALE_DEMOTE_MS;
      setWorldFlow((w) => (w && w.fetchedAt > cut ? w : null));
      setRegionFlows((prev) => {
        const next: Partial<Record<RegionKey, LiveFlowGrid>> = {};
        for (const [key, flow] of Object.entries(prev) as [RegionKey, LiveFlowGrid][]) {
          if (flow.fetchedAt > cut) next[key] = flow;
        }
        return next;
      });
      for (const [key, flow] of regionCache.current) {
        if (flow !== 'pending' && flow.fetchedAt <= cut) regionCache.current.delete(key);
      }
    }, Math.max(0, Math.min(...stamps) + STALE_DEMOTE_MS - Date.now()));
    return () => clearTimeout(t);
  }, [worldFlow, regionFlows]);

  const conditions = useMemo(
    () => liveConditions ?? seasonalBoardConditions(RACES),
    [liveConditions]
  );

  // The dashboard's clock: frozen per mount — the board shouldn't reshuffle
  // under the player's thumb mid-session.
  const now = useMemo(() => Date.now(), []);

  const recommended = recommendedRace(player, state.history);
  const suggestedClass =
    player?.boatType && !state.profile.fleet.some((b) => b.boatType === player.boatType)
      ? getClassOption(player.boatType)
      : undefined;

  const startNewCampaign = () => {
    // Starting a new campaign wipes an in-progress race. Guard it so a stray tap
    // on "New Race" can't silently scuttle a race the player is mid-way through.
    if (raceInProgress) {
      confirmAction({
        title: 'Discard race in progress?',
        message: 'You have a race underway. Starting a new one abandons it.',
        confirmLabel: 'Discard & Continue',
        cancelLabel: 'Keep Racing',
        onConfirm: () => {
          prepareNextRace();
          navigation.navigate('RaceSelect');
        },
      });
      return;
    }
    prepareNextRace();
    navigation.navigate('RaceSelect');
  };

  // Enter a race straight from the dashboard (a pin, a board card, a season
  // chip) — the same funnel the race list's Enter uses, with the same guard
  // against scuttling a race underway. Can't cover the entry fee? Land on the
  // race list instead, where the fees are laid out.
  const enterRace = (raceId: string) => {
    const race = getRaceById(raceId);
    if (!race) return;
    const division = defaultDivision(player?.experience);
    const affordable = state.funds >= race.divisions[division].entryFee;
    const go = () => {
      prepareNextRace();
      if (affordable) {
        selectRace(raceId, division);
        navigation.navigate('BoatSelect');
      } else {
        navigation.navigate('RaceSelect');
      }
    };
    if (raceInProgress) {
      confirmAction({
        title: 'Discard race in progress?',
        message: 'You have a race underway. Starting a new one abandons it.',
        confirmLabel: 'Discard & Continue',
        cancelLabel: 'Keep Racing',
        onConfirm: go,
      });
      return;
    }
    go();
  };

  const sailRecommended = () => {
    if (!recommended) {
      startNewCampaign();
      return;
    }
    enterRace(recommended.id);
  };

  // Desktop-wide stages get the two-pane chart table (charts left, numbers
  // right); anything narrower reads as the phone's single column. The
  // breakpoint sits below the cockpit's 900 rail so a comfortable laptop
  // window qualifies, and the two-pane content is capped like a broadsheet.
  const twoPane = windowWidth >= 1024;
  const contentWidth = twoPane
    ? Math.min(windowWidth, TWO_PANE_MAX_WIDTH)
    : Math.min(windowWidth, MAX_CONTENT_WIDTH);
  const usable = contentWidth - spacing.xl * 2;
  const chartWidth = twoPane ? Math.round(usable * 0.6) : usable;
  const rightWidth = twoPane ? usable - chartWidth - spacing.xl : undefined;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={[styles.column, { width: contentWidth }]}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>
              {user ? `Welcome aboard, ${displayName}` : 'Offshore Tactics'}
            </Text>
            <Text
              style={styles.pennant}
              accessibilityRole="button"
              accessibilityLabel="Notice Board — message the Race Committee"
              testID="feedback-entry-home"
              onPress={() => navigation.navigate('NoticeBoard', { fromRoute: 'Home' })}
            >
              ⚑
            </Text>
          </View>
          <Text style={styles.title}>THE HARBOUR</Text>
          <Text style={styles.tagline}>{goalHeadline(player?.goal)}</Text>
        </View>

        {/* A race underway outranks every dashboard card — resume sits on top. */}
        {raceInProgress ? (
          <View style={styles.resumeBlock}>
            <View style={styles.resumeCard}>
              <Text style={styles.resumeLabel}>Race underway</Text>
              <Text style={styles.resumeHint}>Pick up where you left off.</Text>
            </View>
            <NauticalButton
              label="Resume Race"
              subtitle="You have a race underway"
              onPress={() => navigation.navigate('RaceMap')}
            />
          </View>
        ) : null}

        <HarbourDashboard
          player={player}
          history={state.history}
          conditions={conditions}
          now={now}
          recommendedId={recommended?.id}
          worldFlow={worldFlow}
          regionFlows={regionFlows}
          onRegionView={requestRegionFlow}
          onEnterRace={enterRace}
          width={chartWidth}
          twoPane={twoPane}
          rightWidth={rightWidth}
        >
          {/* The standing CTAs, anchored right under the world chart. */}
          <View style={styles.actions}>
            {!raceInProgress && recommended ? (
              <NauticalButton
                label={`Race the ${recommended.name}`}
                onPress={sailRecommended}
              />
            ) : null}
            <NauticalButton
              label="Browse All Races"
              variant="secondary"
              onPress={startNewCampaign}
            />
            {suggestedClass ? (
              <NauticalButton
                label={`Build your ${suggestedClass.name}`}
                subtitle="Set up the boat you sail"
                variant="secondary"
                onPress={() => navigation.navigate('BoatBuilder')}
              />
            ) : null}
          </View>
        </HarbourDashboard>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { alignItems: 'center' },
  column: { paddingHorizontal: spacing.xl },
  hero: { marginBottom: spacing.xl },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pennant: {
    color: colors.brassLight,
    fontSize: fontSize.lg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    letterSpacing: 4,
    lineHeight: 34,
  },
  tagline: {
    color: colors.mist,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  resumeBlock: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  resumeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brassLight,
    padding: spacing.lg,
  },
  resumeLabel: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resumeHint: { color: colors.mist, fontSize: fontSize.sm, marginTop: spacing.xs },
  actions: { gap: spacing.md, marginBottom: spacing.xl },
});

export default HomeScreen;
