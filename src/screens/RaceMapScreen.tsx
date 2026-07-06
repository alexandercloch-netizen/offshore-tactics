import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameEvent, GameState, GeoPoint, RootStackParamList, TacticalChoice, VmgPreview } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { getRaceById } from '../data';
import { LANDMASSES } from '../data/landmasses';
import { storylineForRace, signatureBeat } from '../data/storylines';
import { useGame } from '../store/GameContext';
import {
  availableWardrobe,
  currentSpeed,
  flownSpecialist,
  formatDuration,
  formatGap,
  laylines,
  polarTargetSpeed,
  raceDivision,
  ratingTccFor,
  recommendedSail,
  resolveBoatById,
  sailChangeMinutes,
  sailCoverageAtMark,
  sailReadout,
  speedMadeGood,
  tacticalRead,
  tideRead,
  vmgPreview,
} from '../engine/gameEngine';
import type { TacticalRead } from '../engine/gameEngine';
import { competitorPoints, correctedStandings } from '../engine/fleet';
import { bearing, haversineNm } from '../engine/geo';
import { featureState, featureStates, gustRatioFor, sampleWindGrid, weatherOutlook } from '../engine/wind';
import { sampleTideField } from '../engine/current';
import { buildInstrumentReport } from '../engine/instruments';
import RouteMap, { chartViewportBounds, FlowField } from '../components/RouteMap';
import { FlowLayer, windCells, tideCells, gustCells, fieldResolution } from '../components/flowField';
import MapLayerToggle, { MapLayerOption } from '../components/MapLayerToggle';
import WindScaleLegend from '../components/WindScaleLegend';
import TutorialOverlay from '../components/TutorialOverlay';
import LiveStandings from '../components/LiveStandings';
import RaceCockpit, { cockpitLayout } from '../components/cockpit/RaceCockpit';
import StatusRibbon from '../components/cockpit/StatusRibbon';
import InstrumentBand from '../components/cockpit/InstrumentBand';
import ControlDock from '../components/cockpit/ControlDock';
import OverflowSheet, { SecondaryMetric } from '../components/cockpit/OverflowSheet';
import DecisionDock, { DebriefInfo, DockMode, SailOption } from '../components/cockpit/DecisionDock';
import { buildPrimaryCells, healthTint } from '../components/cockpit/cells';
import { WarningIcon } from '../components/icons';
import { useReducedMotion } from '../lib/useReducedMotion';
import { confirmAction } from '../lib/confirm';

type Props = NativeStackScreenProps<RootStackParamList, 'RaceMap'>;

const TICK_MS = 150;
// RouteMap draws its own padded, bordered frame; reserve it so the chart lands
// flush inside the measured stage.
const MAP_FRAME = 18;
// How long the colour-scale legend lingers after the layer toggle is touched.
const LEGEND_MS = 4000;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const RaceMapScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { state, beginRace, tick, decide, changeSail, retireRace, setStrategy, markTutorialSeen } =
    useGame();

  // The one docked lane's state machine: what the bottom region shows beyond
  // the control console. While ANY mode is open the sim is held (eventActiveRef).
  const [dockMode, setDockMode] = useState<DockMode | null>(null);
  const [activeEvent, setActiveEvent] = useState<GameEvent | null>(null);
  const [activeVmg, setActiveVmg] = useState<VmgPreview | null>(null);
  const [activeRead, setActiveRead] = useState<TacticalRead | null>(null);
  const [debrief, setDebrief] = useState<DebriefInfo | null>(null);
  const [mobPos, setMobPos] = useState<GeoPoint | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [legendUntil, setLegendUntil] = useState(0);
  // The live-standings strip and the ribbon's corrected gap update on a calm
  // cadence (~2s), not every 150ms tick — a navigator's glance, not a ticker.
  const [standingsBeat, setStandingsBeat] = useState(0);

  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);

  const windField = state.windField;
  const tidalField = state.tidalField;
  const hasTide = !!tidalField && (tidalField.peakRateKn > 0 || tidalField.driftKn > 0);
  const [mapLayer, setMapLayer] = useState<FlowLayer>('wind');
  const activeLayer: FlowLayer =
    (mapLayer === 'tide' && !hasTide) || mapLayer === 'spread' ? 'wind' : mapLayer;
  const layerOptions: MapLayerOption[] = [
    { key: 'wind', label: 'Wind' },
    { key: 'gust', label: 'Gust' },
    ...(hasTide ? [{ key: 'tide' as FlowLayer, label: 'Tide' }] : []),
  ];
  const gustRatio = windField ? gustRatioFor(windField, race?.id) : 1;
  const elapsedHourBucket = state.progress ? Math.floor(state.progress.elapsedHours) : 0;

  const competitors = useMemo(
    () => (race && state.fleet ? competitorPoints(state.fleet, race) : []),
    [race, state.fleet]
  );

  // If we landed here without an active race but with a full loadout, start it.
  useEffect(() => {
    if (!state.progress && race && boat && state.selectedCrewIds.length > 0) {
      beginRace();
    }
  }, [state.progress, race, boat, state.selectedCrewIds.length, beginRace]);

  // Keep imperative helpers fresh for the auto-play interval.
  const tickRef = useRef(tick);
  tickRef.current = tick;
  const stateRef = useRef<GameState>(state);
  stateRef.current = state;
  const eventActiveRef = useRef(false);
  const helpRef = useRef(false);
  helpRef.current = showHelp;
  const standingsTickRef = useRef(0);
  // The position when the current interruption docked, so the debrief ribbon
  // can report places gained/lost across the call.
  const positionBeforeRef = useRef(0);
  // The single chart's field cache: the swarm reseeds if the cells array
  // identity changes, so rebuild only when size/layer/hour actually move.
  const fieldCache = useRef<{ key: string; field: FlowField } | null>(null);

  const goToResults = useCallback(() => {
    navigation.reset({ index: 0, routes: [{ name: 'Results' }] });
  }, [navigation]);

  const started = !!state.progress;

  // Show the coaching strip automatically on the player's first race.
  useEffect(() => {
    if (started && !state.tutorialSeen) setShowHelp(true);
  }, [started, state.tutorialSeen]);

  const closeHelp = useCallback(() => {
    setShowHelp(false);
    if (!stateRef.current.tutorialSeen) markTutorialSeen();
  }, [markTutorialSeen]);

  // The auto-play loop: tick the simulation forward until a decision or finish.
  // Held while any dock is open (eventActiveRef), while the coach strip shows
  // (helpRef) and while paused — exactly the pre-cockpit semantics.
  useEffect(() => {
    if (!started) return undefined;
    const id = setInterval(() => {
      if (paused || eventActiveRef.current || helpRef.current) return;
      const outcome = tickRef.current();
      standingsTickRef.current += 1;
      if (standingsTickRef.current % 13 === 0) setStandingsBeat((b) => b + 1);
      if (outcome.event) {
        eventActiveRef.current = true;
        positionBeforeRef.current = outcome.progress.position;
        const tempState: GameState = {
          ...stateRef.current,
          progress: outcome.progress,
          condition: outcome.condition,
          weather: outcome.weather,
        };
        setActiveVmg(vmgPreview(tempState, outcome.event));
        setActiveRead(tacticalRead(tempState));
        if (outcome.event.kind === 'mob') {
          // Drop the swimmer a trail-point astern: the boat swept past before
          // the shout went up, so the steer-to read is a real turn-back.
          const trail = outcome.progress.trail;
          const p = trail.length > 1 ? trail[trail.length - 2] : trail[trail.length - 1];
          setMobPos(p ? { lat: p.lat, lon: p.lon } : null);
        }
        setActiveEvent(outcome.event);
        setDockMode('decision');
      }
      if (outcome.finished || outcome.retired) {
        clearInterval(id);
        goToResults();
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [started, paused, goToResults]);

  // Everything docked is resolved or dismissed through here: the lane closes,
  // the hold lifts, the race sails on.
  const closeDock = useCallback(() => {
    setDockMode(null);
    setActiveEvent(null);
    setActiveVmg(null);
    setActiveRead(null);
    setDebrief(null);
    setMobPos(null);
    eventActiveRef.current = false;
  }, []);

  const handleChoice = useCallback(
    (choice: TacticalChoice) => {
      const outcome = decide(choice);
      if (outcome.finished || outcome.retired) {
        // Retirement / hull-zero skips the ribbon and hands straight to the
        // Results ceremony.
        closeDock();
        goToResults();
        return;
      }
      // The dock morphs into the debrief ribbon; the sim stays held until the
      // ribbon is acknowledged (tap, or its independent timeout).
      setActiveEvent(null);
      setActiveVmg(null);
      setActiveRead(null);
      const res = outcome.resolution;
      setDebrief(
        res
          ? {
              summary: res.summary,
              glyph: res.bungled ? '✕' : res.paidOff === false ? '~' : '✓',
              placesDelta: positionBeforeRef.current - outcome.progress.position,
              lostMinutes: res.lostHours >= 1 / 60 ? Math.round(res.lostHours * 60) : undefined,
            }
          : null
      );
      setDockMode('debrief');
    },
    [decide, closeDock, goToResults]
  );

  const openSailPicker = useCallback(() => {
    if (eventActiveRef.current || !stateRef.current.progress) return;
    eventActiveRef.current = true;
    positionBeforeRef.current = stateRef.current.progress.position;
    setOverflowOpen(false);
    setDockMode('sail');
  }, []);

  const handleSailPick = useCallback(
    (sailId: string) => {
      const outcome = changeSail(sailId);
      if (!outcome) {
        // A no-op (same sail / blown) — retract, nothing happened, no draw.
        closeDock();
        return;
      }
      const res = outcome.resolution!;
      setDebrief({
        summary: res.summary,
        glyph: res.bungled ? '✕' : '✓',
        placesDelta: positionBeforeRef.current - outcome.progress.position,
        lostMinutes: Math.round(res.lostHours * 60),
      });
      setDockMode('debrief');
    },
    [changeSail, closeDock]
  );

  const confirmRetire = useCallback(() => {
    confirmAction({
      title: 'Retire from Race',
      message: 'Abandon the race and head for port?',
      confirmLabel: 'Retire',
      cancelLabel: 'Keep Racing',
      onConfirm: () => {
        retireRace();
        goToResults();
      },
    });
  }, [retireRace, goToResults]);

  const touchLayer = useCallback((layer: FlowLayer) => {
    setMapLayer(layer);
    setLegendUntil(Date.now() + LEGEND_MS);
  }, []);
  // Let the legend's linger expire (wall-clock, presentation only).
  const [, forceLegendTick] = useState(0);
  useEffect(() => {
    if (legendUntil <= Date.now()) return undefined;
    const id = setTimeout(() => forceLegendTick((n) => n + 1), legendUntil - Date.now() + 20);
    return () => clearTimeout(id);
  }, [legendUntil]);

  // %TGT is smoothed over the last few ticks so the hero number reads as a
  // trend, not a strobe. Keyed to elapsed time so a held sim holds the number.
  const pctWindow = useRef<number[]>([]);
  const progressElapsed = state.progress?.elapsedHours;
  useEffect(() => {
    if (progressElapsed === undefined) return;
    const target = polarTargetSpeed(stateRef.current);
    const speed = currentSpeed(stateRef.current);
    if (target > 0) {
      pctWindow.current.push((speed / target) * 100);
      if (pctWindow.current.length > 8) pctWindow.current.shift();
    }
  }, [progressElapsed]);

  // The ribbon's corrected standing + gap to the nearest rival, on the calm
  // standings cadence — the honest handicap readout, top of screen. Hooks stay
  // above the loading guard; the memo simply returns undefined pre-race.
  const standingLabel = useMemo(() => {
    const current = stateRef.current;
    const r = getRaceById(current.selectedRaceId);
    const b = resolveBoatById(current, current.selectedBoatId);
    if (!r || !b || !current.progress || !current.fleet || current.fleet.length === 0) {
      return undefined;
    }
    const rows = correctedStandings(
      current.fleet,
      r.distanceNm,
      current.progress.elapsedHours,
      ratingTccFor(b),
      b.name
    );
    const idx = rows.findIndex((row) => row.isPlayer);
    if (idx < 0) return undefined;
    const mine = rows[idx].correctedHours;
    let best: { name: string; gap: number; ahead: boolean } | undefined;
    rows.forEach((row, i) => {
      if (i === idx) return;
      const gap = Math.abs(row.correctedHours - mine);
      if (!best || gap < best.gap) best = { name: row.name, gap, ahead: row.correctedHours < mine };
    });
    const place = ordinal(idx + 1);
    if (!best) return place;
    const sign = best.ahead ? '+' : '−';
    return `${place} · ${sign}${formatGap(best.gap * 3600)} to ${best.name}`;
    // The cadence key IS the dependency: recompute on the calm beat only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingsBeat, started]);

  if (!race || !boat || !state.progress || !state.weather) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.brassLight} style={{ marginBottom: spacing.md }} />
        <Text style={styles.loadingText}>Preparing the race…</Text>
      </View>
    );
  }

  const { progress, condition } = state;
  const total = progress.totalDistanceNm;
  const covered = progress.distanceCoveredNm;
  const remaining = Math.max(total - covered, 0);
  const pct = total > 0 ? (covered / total) * 100 : 0;
  const fleetSize = raceDivision(race, state.selectedDivision).fleetSize;
  const vmc = speedMadeGood(state);
  const etaHours = remaining / Math.max(vmc, 0.2);
  const target = polarTargetSpeed(state);
  const tide = tideRead(state);
  const sail = sailReadout(state);
  const lay = laylines(state);
  const layPaths = lay ? [[lay.mark, lay.ends[0]], [lay.mark, lay.ends[1]]] : undefined;
  const outlook =
    windField !== undefined
      ? weatherOutlook(windField, progress.lat, progress.lon, progress.elapsedHours)
      : null;

  // The band: exactly six cells, one home per number, identical idle & docked.
  const report = buildInstrumentReport(
    progress,
    condition,
    fleetSize,
    outlook ?? {
      nowKn: progress.windSpeedKn,
      soonKn: progress.windSpeedKn,
      peakKn: progress.windSpeedKn,
      trend: 'steady',
      warn: false,
      headline: '',
      lookaheadH: 2,
    },
    { targetKn: target, vmcKn: vmc, tide, activeSail: sail }
  );
  const smoothedPct =
    pctWindow.current.length > 0
      ? pctWindow.current.reduce((a, b) => a + b, 0) / pctWindow.current.length
      : report.now.polarPct;
  const cells = buildPrimaryCells(report, smoothedPct);
  const health = healthTint(condition.hullIntegrity, condition.crewStamina, condition.crewMorale);

  // The single live chart, drawn to the measured stage. The colour/flow field
  // is cached by its inputs so a layout pass doesn't reseed the particle swarm.
  const renderChart = (w: number, h: number): React.ReactNode => {
    const innerW = Math.max(w - MAP_FRAME, 50);
    const innerH = Math.max(h - MAP_FRAME, 50);
    const { cols, rows } = fieldResolution(innerW, innerH);
    const cacheKey = `${innerW}x${innerH}|${cols}x${rows}|${activeLayer}|${elapsedHourBucket}|${gustRatio}`;
    let field: FlowField | undefined;
    if (fieldCache.current?.key === cacheKey) {
      field = fieldCache.current.field;
    } else {
      const bounds = chartViewportBounds(race.waypoints, innerW, innerH);
      if (activeLayer === 'tide' && tidalField) {
        field = {
          cells: tideCells(sampleTideField(tidalField, bounds, cols, rows, elapsedHourBucket)),
          cols,
          rows,
        };
      } else if (windField) {
        const grid = sampleWindGrid(windField, bounds, cols, rows, elapsedHourBucket);
        field = {
          cells: activeLayer === 'gust' ? gustCells(grid, gustRatio) : windCells(grid),
          cols,
          rows,
        };
      }
      if (field) fieldCache.current = { key: cacheKey, field };
    }
    return (
      <RouteMap
        waypoints={race.waypoints}
        route={progress.route}
        trail={progress.trail}
        boat={{ lat: progress.lat, lon: progress.lon }}
        competitors={competitors}
        laylines={layPaths}
        field={field}
        layer={activeLayer}
        windFeature={windField ? featureState(windField, progress.elapsedHours) : undefined}
        windFeatures={
          windField ? featureStates(windField, progress.elapsedHours).slice(1) : undefined
        }
        nextMarkIndex={progress.nextMarkIndex}
        land={LANDMASSES[race.id]}
        mobMarker={mobPos ?? undefined}
        testID="race-chart"
        width={innerW}
        height={innerH}
      />
    );
  };

  const chartOverlays = (
    <>
      {state.fleet && state.fleet.length > 0 ? (
        <View style={styles.standingsOverlay}>
          <LiveStandings
            fleet={state.fleet}
            totalNm={race.distanceNm}
            playerElapsedHours={progress.elapsedHours}
            playerTcc={ratingTccFor(boat)}
            playerName={boat.name}
            cadenceKey={standingsBeat}
          />
        </View>
      ) : null}
      <View style={styles.layerToggle}>
        <MapLayerToggle layer={activeLayer} options={layerOptions} onChange={touchLayer} />
      </View>
      {outlook?.warn && dockMode === null ? (
        <View
          style={[styles.weatherBanner, outlook.peakKn >= 34 && styles.weatherBannerSevere]}
          testID="weather-banner"
        >
          <WarningIcon size={14} color={outlook.peakKn >= 34 ? colors.signalRed : colors.warning} />
          <Text style={styles.weatherBannerText} numberOfLines={1}>
            {outlook.headline} · {Math.round(outlook.peakKn)} kn
            {outlook.trend === 'building' ? ` within ${outlook.lookaheadH}h` : ''}
          </Text>
        </View>
      ) : null}
      {legendUntil > Date.now() ? (
        <View style={styles.legendOverlay}>
          <WindScaleLegend layer={activeLayer} />
        </View>
      ) : null}
    </>
  );

  // The sail picker's rows: the Navigator's call first, then the rest of the
  // wardrobe by category, working fallbacks in place — never bare-headed.
  const buildSailOptions = (): SailOption[] => {
    const rec = recommendedSail(state);
    const flying = flownSpecialist(progress);
    const order: Record<string, number> = { headsail: 0, reacher: 1, spinnaker: 2, stormsail: 3 };
    const rows = availableWardrobe(state).map((s) => ({
      sail: s,
      current: s.boost > 0 ? s.id === flying?.id : !flying && s.id === 'working-jib',
      recommended: rec?.id === s.id,
      coverage: sailCoverageAtMark(state, s),
      minutes: sailChangeMinutes(s.boost > 0 ? s : undefined),
    }));
    rows.sort(
      (a, b) =>
        Number(b.recommended) - Number(a.recommended) ||
        (order[a.sail.category] ?? 9) - (order[b.sail.category] ?? 9) ||
        Number(b.sail.boost > 0) - Number(a.sail.boost > 0)
    );
    return rows;
  };

  // The signature decision's narrative framing, when this event carries one.
  const story = activeEvent?.storyBeat ? storylineForRace(race.id) : undefined;
  const beatBody = story ? signatureBeat(story)?.body : undefined;

  // MOB steer-to read: bearing + range from the held boat to the swimmer.
  const mobInfo = mobPos
    ? {
        bearingDeg: bearing(progress.lat, progress.lon, mobPos.lat, mobPos.lon),
        rangeNm: haversineNm(progress.lat, progress.lon, mobPos.lat, mobPos.lon),
      }
    : undefined;

  const usableHeight = Math.max(height - insets.top - insets.bottom, 320);
  const docked = dockMode !== null;
  const layout = cockpitLayout(width, usableHeight, docked);

  const secondaryMetrics: SecondaryMetric[] = [
    { label: 'HDG', value: `${Math.round(progress.heading)}°` },
    { label: 'TWD', value: `${Math.round(progress.windDir)}°` },
    { label: 'To go', value: `${Math.round(remaining)} nm` },
    { label: 'Sailed', value: `${Math.round(covered)} nm` },
    { label: 'ETA', value: remaining <= 0 ? '—' : formatDuration(etaHours) },
    ...(tide
      ? [
          {
            label: 'Tide',
            value: `${tide.rateKn.toFixed(1)} kn ${
              Math.abs(tide.along) < 0.1 ? 'across' : tide.along > 0 ? 'fair' : 'foul'
            }`,
          },
        ]
      : []),
  ];

  const controls = (
    <View>
      <TutorialOverlay visible={showHelp} onClose={closeHelp} />
      <ControlDock
        strategy={state.strategy}
        onStrategy={setStrategy}
        onCallSailChange={openSailPicker}
        onHelp={() => setShowHelp(true)}
        onOverflow={() => setOverflowOpen(true)}
        healthTint={health}
        compact={!layout.rail}
      />
      <View style={{ height: insets.bottom + spacing.sm, backgroundColor: colors.deepSea }} />
    </View>
  );

  const dock = docked ? (
    <View>
      <DecisionDock
        mode={dockMode!}
        hold
        reducedMotion={reducedMotion}
        maxHeight={layout.dockMaxHeight}
        event={activeEvent}
        vmg={activeVmg}
        read={activeRead}
        storyBeat={beatBody}
        mobInfo={mobInfo}
        onChoice={handleChoice}
        sailOptions={dockMode === 'sail' ? buildSailOptions() : undefined}
        onSailPick={handleSailPick}
        debrief={debrief ?? undefined}
        onDismiss={dockMode === 'decision' ? undefined : closeDock}
      />
      <View style={{ height: insets.bottom + spacing.sm, backgroundColor: colors.deepSea }} />
    </View>
  ) : undefined;

  const sheet = overflowOpen ? (
    <OverflowSheet
      condition={condition}
      metrics={secondaryMetrics}
      log={state.eventLog.slice(-6).reverse()}
      paused={paused}
      onPause={() => setPaused((p) => !p)}
      onRetire={confirmRetire}
      onClose={() => setOverflowOpen(false)}
      maxHeight={layout.dockMaxHeight + 120}
    />
  ) : undefined;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <RaceCockpit
        layout={layout}
        ribbon={
          <StatusRibbon
            raceName={race.name}
            elapsed={formatDuration(progress.elapsedHours)}
            standing={standingLabel}
          />
        }
        chart={renderChart}
        chartOverlays={chartOverlays}
        band={<InstrumentBand cells={cells} onSailPress={openSailPicker} reducedMotion={reducedMotion} />}
        controls={controls}
        dock={dock}
        sheet={sheet}
        progressPct={pct}
        held={docked}
      />
    </View>
  );
};

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
  standingsOverlay: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    maxWidth: 240,
  },
  layerToggle: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  weatherBanner: {
    position: 'absolute',
    top: spacing.sm + 44,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(201, 162, 39, 0.18)',
    borderColor: colors.warning,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    maxWidth: '80%',
  },
  weatherBannerSevere: {
    backgroundColor: 'rgba(215, 38, 61, 0.18)',
    borderColor: colors.signalRed,
  },
  weatherBannerText: {
    color: colors.foam,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  legendOverlay: {
    position: 'absolute',
    bottom: spacing.sm + 3,
    alignSelf: 'center',
  },
});

export default RaceMapScreen;
