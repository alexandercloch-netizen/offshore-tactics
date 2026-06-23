import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GameEvent,
  GameState,
  RootStackParamList,
  TacticalChoice,
  VmgPreview,
} from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { getRaceById } from '../data';
import { LANDMASSES } from '../data/landmasses';
import { useGame } from '../store/GameContext';
import {
  currentSpeed,
  formatDuration,
  raceDivision,
  resolveBoatById,
  speedMadeGood,
  tacticalRead,
  vmgPreview,
} from '../engine/gameEngine';
import type { TacticalRead } from '../engine/gameEngine';
import { competitorPoints } from '../engine/fleet';
import { courseAspect, courseBounds } from '../engine/geo';
import { featureState, pressureHint, sampleWindGrid, weatherOutlook } from '../engine/wind';
import { buildInstrumentReport, InstrumentReport } from '../engine/instruments';
import { EffortMode, RoutingBias } from '../types';
import RouteMap from '../components/RouteMap';
import WindScaleLegend from '../components/WindScaleLegend';
import TutorialOverlay from '../components/TutorialOverlay';
import WindIndicator from '../components/WindIndicator';
import StatBar from '../components/StatBar';
import NauticalButton from '../components/NauticalButton';
import TacticalDecisionModal from '../components/TacticalDecisionModal';

type Props = NativeStackScreenProps<RootStackParamList, 'RaceMap'>;

const TICK_MS = 150;

export const RaceMapScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { state, beginRace, tick, decide, retireRace, setStrategy, markTutorialSeen } = useGame();
  const [activeEvent, setActiveEvent] = useState<GameEvent | null>(null);
  const [activeVmg, setActiveVmg] = useState<VmgPreview | null>(null);
  const [activeInstruments, setActiveInstruments] = useState<InstrumentReport | null>(null);
  const [activeRead, setActiveRead] = useState<TacticalRead | null>(null);
  const [paused, setPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);

  // Live wind field sampled across the course for the chart overlay. Recomputed
  // each in-race hour (and when the field changes), not every animation tick.
  const windField = state.windField;
  const elapsedHourBucket = state.progress ? Math.floor(state.progress.elapsedHours) : 0;
  const windArrows = useMemo(() => {
    if (!race || !windField) return [];
    const cols = 7;
    const rows = Math.max(4, Math.min(9, Math.round(cols * courseAspect(race.waypoints))));
    return sampleWindGrid(windField, courseBounds(race.waypoints), cols, rows, elapsedHourBucket);
  }, [race, windField, elapsedHourBucket]);

  // Denser grid for the wind-speed heatmap, refreshed each in-race hour.
  const heatCols = 22;
  const heatRows = race
    ? Math.max(10, Math.min(30, Math.round(heatCols * courseAspect(race.waypoints))))
    : 0;
  const windHeat = useMemo(() => {
    if (!race || !windField) return [];
    return sampleWindGrid(windField, courseBounds(race.waypoints), heatCols, heatRows, elapsedHourBucket);
  }, [race, windField, heatRows, elapsedHourBucket]);

  // If we landed here without an active race but with a full loadout, start it.
  useEffect(() => {
    if (!state.progress && race && boat && state.selectedCrewIds.length > 0) {
      beginRace();
    }
  }, [state.progress, race, boat, state.selectedCrewIds.length, beginRace]);

  // Keep imperative helpers fresh for the auto-play interval.
  const tickRef = useRef(tick);
  tickRef.current = tick;
  // Scroll the chart back into view when a decision docks over the screen, so
  // the player can read their position behind the sheet/panel.
  const scrollRef = useRef<ScrollView>(null);
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;
  const eventActiveRef = useRef(false);
  const helpRef = useRef(false);
  helpRef.current = showHelp;

  const goToResults = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Results' }] });
  }, [navigation]);

  const started = !!state.progress;

  // Show the how-to-play overlay automatically on the player's first race.
  useEffect(() => {
    if (started && !state.tutorialSeen) setShowHelp(true);
  }, [started, state.tutorialSeen]);

  const closeHelp = useCallback(() => {
    setShowHelp(false);
    if (!stateRef.current.tutorialSeen) markTutorialSeen();
  }, [markTutorialSeen]);

  // The auto-play loop: tick the simulation forward until a decision or finish.
  useEffect(() => {
    if (!started) return undefined;
    const id = setInterval(() => {
      if (paused || eventActiveRef.current || helpRef.current) return;
      const outcome = tickRef.current();
      if (outcome.event) {
        eventActiveRef.current = true;
        const tempState: GameState = {
          ...stateRef.current,
          progress: outcome.progress,
          condition: outcome.condition,
          weather: outcome.weather,
        };
        setActiveVmg(vmgPreview(tempState, outcome.event));
        setActiveRead(tacticalRead(tempState));
        // Instruments + this-leg trend, to inform the call.
        const wf = stateRef.current.windField;
        if (wf && race) {
          const fleetSz = raceDivision(race, stateRef.current.selectedDivision).fleetSize;
          const outlook = weatherOutlook(
            wf,
            outcome.progress.lat,
            outcome.progress.lon,
            outcome.progress.elapsedHours
          );
          setActiveInstruments(
            buildInstrumentReport(outcome.progress, outcome.condition, fleetSz, outlook)
          );
        }
        setActiveEvent(outcome.event);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
      if (outcome.finished || outcome.retired) {
        clearInterval(id);
        goToResults();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [started, paused, goToResults]);

  const handleChoice = useCallback(
    (choice: TacticalChoice) => {
      setActiveEvent(null);
      setActiveVmg(null);
      setActiveInstruments(null);
      setActiveRead(null);
      eventActiveRef.current = false;
      const outcome = decide(choice);
      if (outcome.finished || outcome.retired) {
        goToResults();
      }
    },
    [decide, goToResults]
  );

  const confirmRetire = useCallback(() => {
    Alert.alert('Retire from Race', 'Abandon the race and head for port?', [
      { text: 'Keep Racing', style: 'cancel' },
      {
        text: 'Retire',
        style: 'destructive',
        onPress: () => {
          retireRace();
          goToResults();
        },
      },
    ]);
  }, [retireRace, goToResults]);

  if (!race || !boat || !state.progress || !state.weather) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Preparing the race…</Text>
      </View>
    );
  }

  // Responsive layout: centre the content in a max-width column on wide
  // screens, and size the chart to the course's shape and the viewport so it
  // fills the space instead of sitting in a fixed letterbox.
  const CONTENT_MAX = 760;
  const columnWidth = Math.min(width - spacing.lg * 2, CONTENT_MAX);
  const mapWidth = columnWidth - spacing.sm * 2;
  const mapAspect = Math.max(0.55, Math.min(courseAspect(race.waypoints), 1.3));
  const mapHeight = Math.max(
    300,
    Math.min(Math.round(mapWidth * mapAspect), Math.round(height * 0.6))
  );

  const { progress, condition, weather } = state;
  const total = progress.totalDistanceNm;
  const covered = progress.distanceCoveredNm;
  const remaining = Math.max(total - covered, 0);
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  const fleetSize = raceDivision(race, state.selectedDivision).fleetSize;
  const speed = currentSpeed(state);
  const currentVmg = speedMadeGood(state);
  const etaHours = remaining / Math.max(currentVmg, 0.2);
  const recentLog = state.eventLog.slice(-4).reverse();
  const strategy = state.strategy;
  const hint =
    state.windField !== undefined
      ? pressureHint(state.windField, progress.lat, progress.lon, progress.elapsedHours)
      : null;
  // What the breeze is about to do — drives the on-chart weather warning.
  const outlook =
    state.windField !== undefined
      ? weatherOutlook(state.windField, progress.lat, progress.lon, progress.elapsedHours)
      : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}
      >
        <View style={{ width: columnWidth }}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.raceName}>{race.name}</Text>
            <Text style={styles.boatName}>aboard {boat.name}</Text>
          </View>
          <View style={styles.positionBox}>
            <Text style={styles.positionValue}>{progress.position}</Text>
            <Text style={styles.positionLabel}>of {fleetSize}</Text>
          </View>
        </View>

        {outlook?.warn ? (
          <View
            style={[
              styles.weatherWarning,
              outlook.peakKn >= 34 && styles.weatherWarningSevere,
            ]}
          >
            <Text style={styles.weatherWarningText}>
              ⚠ {outlook.headline} · {Math.round(outlook.peakKn)} kn
              {outlook.trend === 'building' ? ` within ${outlook.lookaheadH}h` : ''}
            </Text>
          </View>
        ) : null}

        <RouteMap
          waypoints={race.waypoints}
          route={progress.route}
          trail={progress.trail}
          boat={{ lat: progress.lat, lon: progress.lon }}
          competitors={state.fleet ? competitorPoints(state.fleet, race) : []}
          wind={windArrows}
          heat={windHeat}
          heatCols={heatCols}
          heatRows={heatRows}
          windFeature={
            state.windField ? featureState(state.windField, progress.elapsedHours) : undefined
          }
          nextMarkIndex={progress.nextMarkIndex}
          land={LANDMASSES[race.id]}
          width={mapWidth}
          height={mapHeight}
        />
        <View style={{ width: mapWidth, alignSelf: 'center' }}>
          <WindScaleLegend />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>

        <View style={styles.metricsRow}>
          <Metric label="Sailed" value={`${Math.round(covered)} nm`} />
          <Metric label="To go" value={`${Math.round(remaining)} nm`} />
          <Metric label="Done" value={`${pct}%`} />
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Elapsed" value={formatDuration(progress.elapsedHours)} />
          <Metric label="Speed" value={`${speed.toFixed(1)} kn`} />
          <Metric label="ETA" value={remaining <= 0 ? '—' : formatDuration(etaHours)} />
        </View>

        <View style={styles.panel}>
          <View style={styles.windRow}>
            <WindIndicator weather={weather} size={110} />
            <View style={styles.windInfo}>
              <Text style={styles.nextLeg}>Point of sail</Text>
              <Text style={styles.pointOfSail}>{progress.pointOfSail}</Text>
              <Text style={styles.vmgLine}>VMG {currentVmg.toFixed(1)} kn</Text>
              <Text style={styles.weatherDesc}>{weather.description}</Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.tacticsHeader}>
            <Text style={styles.panelTitle}>Tactics</Text>
            {hint ? (
              <Text style={styles.hint}>
                {hint.strong ? 'More breeze' : 'Slightly more breeze'} to the {hint.compass}
              </Text>
            ) : null}
          </View>

          <Text style={styles.tacticsLabel}>Effort</Text>
          <Segmented<EffortMode>
            value={strategy.effort}
            options={[
              { value: 'conserve', label: 'Conserve' },
              { value: 'cruise', label: 'Cruise' },
              { value: 'push', label: 'Push' },
            ]}
            onSelect={(effort) => setStrategy({ effort })}
          />

          <Text style={[styles.tacticsLabel, { marginTop: spacing.sm }]}>Routing</Text>
          <Segmented<RoutingBias>
            value={strategy.bias}
            options={[
              { value: -1, label: 'Bank Left' },
              { value: 0, label: 'Optimal' },
              { value: 1, label: 'Bank Right' },
            ]}
            onSelect={(bias) => setStrategy({ bias })}
          />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Boat & Crew</Text>
          <StatBar label="Hull Integrity" value={condition.hullIntegrity} />
          <StatBar label="Crew Stamina" value={condition.crewStamina} />
          <StatBar label="Crew Morale" value={condition.crewMorale} />
        </View>

        {recentLog.length > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Ship's Log</Text>
            {recentLog.map((entry, i) => (
              <Text key={`${entry}-${i}`} style={styles.logEntry}>
                • {entry}
              </Text>
            ))}
          </View>
        ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <NauticalButton
          label={paused ? 'Resume' : 'Pause'}
          variant={paused ? 'primary' : 'secondary'}
          onPress={() => setPaused((p) => !p)}
        />
        <View style={styles.footerRow}>
          <View style={{ flex: 1 }}>
            <NauticalButton label="How to Race" variant="ghost" onPress={() => setShowHelp(true)} />
          </View>
          <View style={{ flex: 1 }}>
            <NauticalButton label="Retire" variant="ghost" onPress={confirmRetire} />
          </View>
        </View>
      </View>

      <TutorialOverlay visible={showHelp} onClose={closeHelp} />

      <TacticalDecisionModal
        visible={!!activeEvent}
        event={activeEvent}
        vmg={activeVmg}
        instruments={activeInstruments}
        read={activeRead}
        onSelect={handleChoice}
      />
    </View>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

interface SegmentedProps<T> {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
}

function Segmented<T extends string | number>({ value, options, onSelect }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onSelect(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.abyss,
  },
  loadingText: {
    color: colors.mist,
    fontSize: fontSize.md,
  },
  content: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  raceName: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  boatName: {
    color: colors.mist,
    fontSize: fontSize.sm,
  },
  positionBox: {
    alignItems: 'center',
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  positionValue: {
    color: colors.brassLight,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  positionLabel: {
    color: colors.mist,
    fontSize: fontSize.xs,
  },
  weatherWarning: {
    backgroundColor: 'rgba(201, 162, 39, 0.18)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  weatherWarningSevere: {
    backgroundColor: 'rgba(215, 38, 61, 0.18)',
    borderColor: colors.signalRed,
  },
  weatherWarningText: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.brassLight,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  metricValue: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  metricLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  panelTitle: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  windRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  windInfo: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  nextLeg: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pointOfSail: {
    color: colors.brassLight,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  vmgLine: {
    color: colors.signalGreen,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: 2,
  },
  weatherDesc: {
    color: colors.mist,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  logEntry: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  tacticsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  hint: {
    color: colors.signalGreen,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  tacticsLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: colors.hull,
  },
  segmentLabel: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  segmentLabelActive: {
    color: colors.brassLight,
    fontWeight: fontWeight.bold,
  },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
  footerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});

export default RaceMapScreen;
