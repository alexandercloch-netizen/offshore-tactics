import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EffortMode, RootStackParamList, RoutingBias, SailMode, WeatherScenario } from '../types';
import { colors, fontSize, fontWeight, radius, spacing, status } from '../theme';
import { getCrewById, getRaceById, storylineForRace } from '../data';
import { LANDMASSES } from '../data/landmasses';
import { useGame } from '../store/GameContext';
import {
  EFFORT_SPEED,
  crewSkillAverage,
  crewSkillFactor,
  estimateRouteHours,
  formatDuration,
  navigatorSkill,
  raceDivision,
  raceWindBandTws,
  ratingTccFor,
  resolveBoatById,
} from '../engine/gameEngine';
import { planRoute, WindSampler } from '../engine/router';
import { courseAspect } from '../engine/geo';
import {
  featureState,
  featureStates,
  forecastConfidence,
  gustRatioFor,
  pressureHint,
  sampleForecast,
  sampleForecastGrid,
  sampleForecastSpreadGrid,
  weatherOutlook,
} from '../engine/wind';
import { sampleTideField } from '../engine/current';
import RouteMap, { chartViewportBounds, clampChartToCoverage, FlowField } from '../components/RouteMap';
import { FlowLayer, windCells, tideCells, gustCells, fieldResolution } from '../components/flowField';
import MapLayerToggle, { MapLayerOption } from '../components/MapLayerToggle';
import WindIndicator from '../components/WindIndicator';
import NauticalButton from '../components/NauticalButton';
import ForecastScrubber from '../components/ForecastScrubber';
import WindScaleLegend from '../components/WindScaleLegend';
import ForecastGraph, { ForecastGraphReadout, ForecastPoint } from '../components/ForecastGraph';
import ErrorBoundary from '../components/ErrorBoundary';
import LoadingState from '../components/LoadingState';
import Segmented from '../components/Segmented';
import { divisionName } from '../lib/labels';
import { fetchCourseSnapshot, liveWeatherEnabled } from '../services/weather';
import { editionsForRace } from '../data/weatherEditions';

type Props = NativeStackScreenProps<RootStackParamList, 'Briefing'>;

// Which conditions the race sails: the seasonal default, today's real forecast
// (behind the EXPO_PUBLIC_LIVE_WEATHER flag; falls back to seasonal), or a
// curated historic edition from the Archive (bundled data — no flag, no
// network, works for guests). `edition:<year>` keys the race's edition list.
type ConditionsMode = 'seasonal' | 'live' | `edition:${number}`;
type SnapshotState = 'idle' | 'fetching' | 'ready' | 'failed';

// The pre-start briefing: a calm beat before the gun to read the course and the
// conditions, and to set the plan (effort + which side to favour) you'll sail
// off the line. Mirrors how a real crew prepares before racing.
export const BriefingScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { state, beginRace, reseedWeather, setStrategy } = useGame();
  // Forecast offset (hours from the start) the player is scrubbing through.
  const [forecastHour, setForecastHour] = useState(0);
  // Which overlay the chart shows — the breeze, its gusts, the stream where the
  // course runs a tide, or the forecast-spread envelope. A segment only appears
  // when its layer is live for the course.
  const [mapLayer, setMapLayer] = useState<FlowLayer>('wind');
  // Live-weather conditions (flag-gated). The snapshot resolves in the
  // background while the briefing is read; picking "Today's forecast" reseeds
  // the race world from the already-resolved scenario — never awaiting network.
  const liveEnabled = liveWeatherEnabled();
  const [conditions, setConditions] = useState<ConditionsMode>('seasonal');
  const [snapshot, setSnapshot] = useState<WeatherScenario | null>(null);
  const [snapState, setSnapState] = useState<SnapshotState>('idle');

  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  // The race's Archive: curated historic editions, if any are baked for it.
  // Bundled data, so this is a plain lookup — no fetch, no flag, guests too.
  const editions = editionsForRace(race?.id);
  const selectedEdition = conditions.startsWith('edition:')
    ? editions.find((e) => `edition:${e.year}` === conditions) ?? null
    : null;
  // The race's storyline, if one is authored (text-only briefing additions).
  const story = storylineForRace(state.selectedRaceId);
  const briefingBeat = story?.beats.find((b) => b.kind === 'briefing');
  // Everything the player sees is the crew's *believed* forecast, read through
  // their Navigator: routes and ETAs are estimated on it, so a weak Navigator
  // plans on a fuzzier picture (and can back the wrong side). The race itself
  // still sails the true field.
  const navSkill = navigatorSkill(state.selectedCrewIds);
  const forecastSampler: WindSampler = (f, lat, lon, h) => sampleForecast(f, lat, lon, h, navSkill);

  // Weather-route each side option (left / optimal / right) once, so the plan
  // panel can compare finish ETAs. Routes depend on the wind & start, not the
  // selected bias or effort, so this survives effort toggles and forecast scrubs.
  const planRoutes = useMemo(() => {
    if (!race || !boat || !state.windField || !state.progress) return null;
    const from = { lat: state.progress.lat, lon: state.progress.lon };
    const sampler: WindSampler = (f, lat, lon, h) => sampleForecast(f, lat, lon, h, navSkill);
    return ([-1, 0, 1] as RoutingBias[]).map((bias) => ({
      bias,
      route: planRoute(
        boat,
        state.windField!,
        from,
        race.waypoints,
        state.progress!.nextMarkIndex,
        0,
        bias,
        LANDMASSES[race.id],
        sampler
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race, boat, state.windField, navSkill, state.progress?.lat, state.progress?.lon, state.progress?.nextMarkIndex]);

  // Commit the race here (funds + wind/tide field + fleet + the benchmark sim) —
  // in this effect, which runs *after* the loading state below has painted, so a
  // long course's benchmark runs behind the spinner instead of freezing the tap
  // that left provisioning.
  useEffect(() => {
    if (!state.progress && race && boat && state.selectedCrewIds.length > 0) {
      beginRace();
    }
  }, [state.progress, race, boat, state.selectedCrewIds.length, beginRace]);

  // Resolve today's forecast in the background as the briefing opens (flag on
  // only). Any failure quietly resolves to null — the seasonal game is intact.
  const raceId = race?.id;
  useEffect(() => {
    if (!liveEnabled || !race) return undefined;
    let mounted = true;
    setSnapState('fetching');
    fetchCourseSnapshot(race).then((s) => {
      if (!mounted) return;
      setSnapshot(s);
      setSnapState(s ? 'ready' : 'failed');
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEnabled, raceId]);

  // Apply the chosen conditions once both the race world and the scenario
  // exist (an edition is bundled, so it's ready the moment it's picked; the
  // live snapshot waits for its fetch). Idempotent on the state's scenario
  // stamp, and RESEED_WEATHER swaps the world atomically — `progress` is never
  // nulled, so the beginRace mount effect above can't re-fire. Only while this
  // screen is focused: the Briefing stays mounted under the pushed
  // StartSequence, and a slow fetch must never swap the conditions out from
  // under the start (applyReseed also locks once the start outcome is baked in).
  const isFocused = useIsFocused();
  const scenarioActive = !!state.scenario;
  const scenarioStampKey = state.scenario ? `${state.scenario.kind}|${state.scenario.label}|${state.scenario.year ?? ''}` : '';
  useEffect(() => {
    if (!isFocused || !state.progress) return;
    if (selectedEdition) {
      const key = `historic|${selectedEdition.label}|${selectedEdition.year ?? ''}`;
      if (scenarioStampKey !== key) reseedWeather(selectedEdition);
      return;
    }
    if (conditions === 'live') {
      if (liveEnabled && snapState === 'ready' && snapshot && state.scenario?.kind !== 'live') {
        reseedWeather(snapshot);
      }
      return;
    }
    if (scenarioActive) reseedWeather(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveEnabled, isFocused, conditions, selectedEdition, snapState, snapshot, scenarioActive, scenarioStampKey, !!state.progress, reseedWeather]);

  if (!race || !boat || !state.progress || !state.weather || !state.windField) {
    return <LoadingState title="Reading the conditions…" />;
  }

  const { progress, weather, windField } = state;
  const fleetSize = raceDivision(race, state.selectedDivision).fleetSize;
  const outlook = weatherOutlook(windField, progress.lat, progress.lon, 0);
  const hint = pressureHint(windField, progress.lat, progress.lon, 0);

  // Wind-band ("Triple Number") handicap: what THIS boat rates in the conditions
  // this passage is likely to sail, versus its medium-air certificate. A stiff
  // heavy-air hull gets a break in a drifter and owes time in a blow; a tender
  // one is the reverse. The exact same band scores the finish — so this is an
  // honest preview of the handicap the player will be judged on, and makes
  // choosing a boat for the weather a real call. See `windBandMultiplier`.
  const bandTws = raceWindBandTws(windField, race);
  const nominalTcc = ratingTccFor(boat);
  const bandedTcc = ratingTccFor(boat, bandTws);
  const bandDelta = bandedTcc - nominalTcc;
  const bandNote =
    bandDelta < -0.004
      ? `a break in these conditions (owes less than its ${nominalTcc.toFixed(2)} certificate)`
      : bandDelta > 0.004
        ? `owes time in these conditions (above its ${nominalTcc.toFixed(2)} certificate)`
        : `on its ${nominalTcc.toFixed(2)} certificate here`;

  // Map sized to the course, centred in a max-width column (as in the race).
  const CONTENT_MAX = 760;
  const columnWidth = Math.min(width - spacing.lg * 2, CONTENT_MAX);
  const rawMapWidth = columnWidth - spacing.sm * 2;
  const mapAspect = Math.max(0.55, Math.min(courseAspect(race.waypoints), 1.3));
  const rawMapHeight = Math.max(
    280,
    Math.min(Math.round(rawMapWidth * mapAspect), Math.round(height * 0.5))
  );
  // The aspect clamps above can stretch the viewport past the baked coastline
  // box (a tall course on a capped-height chart), and unmapped land would show
  // as open water — letterbox to the covered box instead.
  const { width: mapWidth, height: mapHeight } = clampChartToCoverage(
    race.waypoints,
    rawMapWidth,
    rawMapHeight
  );

  // The wind chart reflects the scrubbed forecast hour: arrows for direction, a
  // dense grid for the speed heatmap, and the drifting pressure feature. (Plain
  // calls — they must sit after the loading guard, so no hooks here.) The grids
  // are sampled to the whole chart viewport, not just the course box, so the
  // weather fills the map rather than sitting short of the edges.
  const bounds = chartViewportBounds(race.waypoints, mapWidth, mapHeight);
  // Density sized to the chart pixels so the heatmap stays a smooth gradient even
  // on a long passage (a coarse fixed grid tiles on Sydney–Hobart-scale courses).
  const { cols: fieldCols, rows: fieldRows } = fieldResolution(mapWidth, mapHeight);
  // The chart shows the crew's *forecast*, not ground truth: it grows fuzzier the
  // further out you scrub, and a sharp Navigator keeps it trustworthy for longer.
  const confidence = forecastConfidence(navSkill, forecastHour);
  // One dense field drives both the smooth colour map and the flow animation.
  // Wind is the believed forecast (blurred by Navigator skill); tide is known
  // from the tables, so it's sampled true.
  const hasTide =
    !!state.tidalField && (state.tidalField.peakRateKn > 0 || state.tidalField.driftKn > 0);
  const activeLayer: FlowLayer = mapLayer === 'tide' && !hasTide ? 'wind' : mapLayer;
  const layerOptions: MapLayerOption[] = [
    { key: 'wind', label: 'Wind' },
    { key: 'gust', label: 'Gust' },
    ...(hasTide ? [{ key: 'tide' as FlowLayer, label: 'Tide' }] : []),
    // Opt-in: how far the forecast could be wrong, growing with the lookahead.
    { key: 'spread', label: 'Spread' },
  ];
  // The course's gust character — the scenario's own gusts when one is sailing,
  // else the baked climatology. One capped multiplier over the mean field.
  const gustRatio = gustRatioFor(windField, race.id);
  const flowField: FlowField =
    activeLayer === 'tide' && state.tidalField
      ? {
          cells: tideCells(sampleTideField(state.tidalField, bounds, fieldCols, fieldRows, forecastHour)),
          cols: fieldCols,
          rows: fieldRows,
        }
      : activeLayer === 'spread'
        ? {
            cells: windCells(
              sampleForecastSpreadGrid(windField, bounds, fieldCols, fieldRows, forecastHour, navSkill)
            ),
            cols: fieldCols,
            rows: fieldRows,
          }
        : (() => {
            const grid = sampleForecastGrid(windField, bounds, fieldCols, fieldRows, forecastHour, navSkill);
            return {
              cells: activeLayer === 'gust' ? gustCells(grid, gustRatio) : windCells(grid),
              cols: fieldCols,
              rows: fieldRows,
            };
          })();
  const feature = featureState(windField, forecastHour);
  const otherFeatures = featureStates(windField, forecastHour).slice(1);
  const navigator = state.selectedCrewIds
    .map((id) => getCrewById(id))
    .find((c) => c?.role === 'Navigator');

  // A planning window scaled to the race, capped so the slider stays useful.
  // (Declared before the meteogram series below, which reads it synchronously.)
  const maxForecastHour = Math.min(48, Math.max(8, Math.ceil(race.recordTimeHours)));

  // Meteogram series: the forecast wind at the start over the planning window,
  // and the exact sample under the scrubber cursor.
  const GRAPH_SAMPLES = 25;
  const forecastSeries: ForecastPoint[] = Array.from({ length: GRAPH_SAMPLES }, (_, i) => {
    const h = (i / (GRAPH_SAMPLES - 1)) * maxForecastHour;
    const s = sampleForecast(windField, progress.lat, progress.lon, h, navSkill);
    return {
      hour: h,
      speedKn: s.speedKn,
      fromDeg: s.fromDeg,
      confidence: forecastConfidence(navSkill, h),
      // The gust envelope over the passage, from the same gust character the
      // chart's Gust layer shows.
      gustKn: s.speedKn * gustRatio,
    };
  });
  const cursorSample = sampleForecast(windField, progress.lat, progress.lon, forecastHour, navSkill);
  const cursorPoint: ForecastPoint = {
    hour: forecastHour,
    speedKn: cursorSample.speedKn,
    fromDeg: cursorSample.fromDeg,
    confidence: confidence,
  };

  // Finish ETA for each side at the player's current effort & crew, and how the
  // chosen plan stacks up against the fastest line.
  const effortMul = EFFORT_SPEED[state.strategy.effort];
  const skillMul = crewSkillFactor(crewSkillAverage(state.selectedCrewIds));
  const etas = (planRoutes ?? []).map((r) => ({
    ...r,
    hours: estimateRouteHours(boat, state.condition, r.route, windField, 0, effortMul, skillMul, forecastSampler),
  }));
  const fastest = etas.length ? etas.reduce((a, b) => (b.hours < a.hours ? b : a), etas[0]) : null;
  const mine = etas.find((e) => e.bias === state.strategy.bias) ?? fastest;
  const saving = mine && fastest ? mine.hours - fastest.hours : 0;
  const offThePace = !!fastest && !!mine && fastest.bias !== mine.bias && saving > 0.05;

  const start = () => {
    // Out to the start line: make the pre-gun tactical calls before racing.
    navigation.navigate('StartSequence');
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}>
        <View style={{ width: columnWidth }}>
          <Text style={styles.kicker}>Skipper's Briefing</Text>
          <Text style={styles.raceName}>{race.name}</Text>
          <Text style={styles.sub}>
            {race.location} · {divisionName(state.selectedDivision)} division · {fleetSize} boats
          </Text>

          <View style={styles.mapWrap}>
            <View style={{ width: mapWidth }}>
              <RouteMap
                waypoints={race.waypoints}
                route={mine?.route ?? progress.route}
                altRoute={offThePace ? fastest!.route : undefined}
                boat={{ lat: progress.lat, lon: progress.lon }}
                field={flowField}
                layer={activeLayer}
                // The spread layer is a stillness — uncertainty doesn't flow.
                animate={activeLayer !== 'spread'}
                // The briefing is a study, not a race: a touch more streak
                // density helps the synoptic picture read at a glance.
                particleBoost={1.2}
                windFeature={feature}
                windFeatures={otherFeatures}
                land={LANDMASSES[race.id]}
                width={mapWidth}
                height={mapHeight}
              />
              <View style={styles.layerToggle}>
                <MapLayerToggle layer={activeLayer} options={layerOptions} onChange={setMapLayer} />
              </View>
            </View>
            <View style={{ width: mapWidth }}>
              <WindScaleLegend layer={activeLayer} />
              <ForecastScrubber
                hour={forecastHour}
                maxHour={maxForecastHour}
                onChange={setForecastHour}
              />
              <ConfidenceBar
                confidence={confidence}
                navName={navigator?.name}
                navSkill={navSkill}
                live={scenarioActive}
              />
            </View>
          </View>

          {liveEnabled || editions.length > 0 ? (
            <View style={styles.panel} testID="conditions-selector">
              <Text style={styles.panelTitle}>Conditions</Text>
              <Segmented<ConditionsMode>
                value={conditions}
                options={[
                  { value: 'seasonal', label: 'Seasonal' },
                  ...(liveEnabled
                    ? [{ value: 'live' as ConditionsMode, label: "Today's forecast" }]
                    : []),
                ]}
                onSelect={setConditions}
              />
              {liveEnabled && conditions === 'live' ? (
                <View testID="conditions-live-note">
                  {snapState === 'fetching' || snapState === 'idle' ? (
                    <Text style={styles.liveNote}>Fetching today's forecast…</Text>
                  ) : snapState === 'failed' || !snapshot ? (
                    <Text style={styles.liveNoteWarn}>
                      Couldn't reach the forecast — sailing the seasonal conditions instead.
                    </Text>
                  ) : (
                    <>
                      <Text style={styles.liveNote}>
                        ECMWF forecast, issued {issuedLabel(snapshot.issuedAt)}. Practice run —
                        doesn't post to the global leaderboard.
                      </Text>
                      <Text style={styles.liveDisclaimer}>Simulation — not for navigation.</Text>
                    </>
                  )}
                </View>
              ) : null}
              {editions.length > 0 ? (
                <View testID="conditions-archive" style={styles.archive}>
                  <Text style={styles.archiveLabel}>Archive</Text>
                  {editions.map((e) => {
                    const key = `edition:${e.year ?? 0}` as ConditionsMode;
                    const active = conditions === key;
                    return (
                      <Pressable
                        key={key}
                        testID={`edition-chip-${e.year}`}
                        onPress={() => setConditions(active ? 'seasonal' : key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[styles.editionChip, active && styles.editionChipActive]}
                      >
                        <Text style={[styles.editionLabel, active && styles.editionLabelActive]}>
                          {e.label}
                        </Text>
                        {e.blurb ? <Text style={styles.editionBlurb}>{e.blurb}</Text> : null}
                      </Pressable>
                    );
                  })}
                  {selectedEdition ? (
                    <Text style={styles.liveNote}>
                      Practice run — doesn't post to the global leaderboard.
                    </Text>
                  ) : null}
                  <Text style={styles.archiveNote}>Reconstructed from ERA5 reanalysis.</Text>
                  <Text style={styles.archiveNote}>
                    Editions are chosen from storied, safely-sailed races.
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.panel}>
            <View style={styles.windRow}>
              <WindIndicator weather={weather} size={108} />
              <View style={styles.windInfo}>
                <Text style={styles.panelLabel}>At the start</Text>
                <Text style={styles.bigValue}>
                  {Math.round(weather.windSpeedKts)} kn · {weather.windStrength}
                </Text>
                <Text style={styles.outlook}>
                  {outlook.trend === 'building'
                    ? `Building — ${Math.round(outlook.soonKn)} kn within ${outlook.lookaheadH}h`
                    : outlook.trend === 'easing'
                      ? 'Breeze easing over the next couple of hours'
                      : 'Holding steady for now'}
                </Text>
                <Text style={styles.hint}>
                  More pressure to the {hint.compass}
                  {hint.strong ? ' — worth chasing' : ''}
                </Text>
                <Text style={styles.firstLeg}>
                  First leg: {progress.pointOfSail.toLowerCase()}
                </Text>
                <Text style={styles.handicap} testID="briefing-windband">
                  Handicap here: {bandedTcc.toFixed(2)} TCC — {bandNote}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.panel}>
            <View style={styles.forecastHead}>
              <Text style={styles.panelTitle}>Forecast at the Start</Text>
              <ForecastGraphReadout point={cursorPoint} />
            </View>
            <ErrorBoundary label="The forecast graph could not be shown.">
              <ForecastGraph
                series={forecastSeries}
                hour={forecastHour}
                maxHour={maxForecastHour}
                width={mapWidth}
                onScrub={setForecastHour}
              />
            </ErrorBoundary>
            <Text style={styles.planHint}>
              Wind strength over the passage; arrows show direction. Tap to scrub — the
              trace fades as the forecast grows less certain.
            </Text>
          </View>

          {story ? (
            <View style={styles.panel} testID="briefing-storyline">
              <Text style={styles.panelTitle}>The Race Ahead</Text>
              <Text style={styles.storyTheme}>{story.theme}</Text>
              <Text style={styles.storyStakes}>{story.stakes}</Text>
              {briefingBeat ? (
                <Text style={styles.storyBody}>{briefingBeat.body}</Text>
              ) : null}
              <Text style={styles.storyCoached}>{story.coached}</Text>
            </View>
          ) : null}

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Signature Challenge</Text>
            <Text style={styles.hazard}>{race.signatureHazard}</Text>
            {race.tide && (race.tide.peakRateKn > 0 || (race.tide.driftKn ?? 0) > 0) ? (
              <Text style={styles.tideNote}>
                🌊{' '}
                {race.tide.peakRateKn > 0
                  ? `Tidal stream up to ${race.tide.peakRateKn.toFixed(1)} kn`
                  : `A ${(race.tide.driftKn ?? 0).toFixed(1)} kn ocean current`}
                {(race.tide.driftKn ?? 0) > 0 && race.tide.peakRateKn > 0
                  ? ` over a steady ${(race.tide.driftKn ?? 0).toFixed(1)} kn current`
                  : ''}
                {race.tide.gates && race.tide.gates.length > 0
                  ? `, running hardest at ${race.tide.gates.map((g) => g.waypoint).join(' & ')}`
                  : ''}
                . Read the stream — the fleet feels the same water you do.
              </Text>
            ) : null}
            <View style={styles.factRow}>
              <Fact label="Course" value={`${Math.round(race.distanceNm)} nm`} />
              <Fact label="Record" value={formatDuration(race.recordTimeHours)} />
              <Fact label="Difficulty" value={race.difficulty} />
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Your Plan off the Line</Text>
            <Text style={styles.planLabel}>Effort</Text>
            <Segmented<EffortMode>
              value={state.strategy.effort}
              options={[
                { value: 'conserve', label: 'Conserve' },
                { value: 'cruise', label: 'Cruise' },
                { value: 'push', label: 'Push' },
              ]}
              onSelect={(effort) => setStrategy({ effort })}
            />
            <Text style={[styles.planLabel, { marginTop: spacing.sm }]}>Favour a side</Text>
            <Segmented<RoutingBias>
              value={state.strategy.bias}
              options={[
                { value: -1, label: 'Bank Left' },
                { value: 0, label: 'Optimal' },
                { value: 1, label: 'Bank Right' },
              ]}
              onSelect={(bias) => setStrategy({ bias })}
            />
            <Text style={[styles.planLabel, { marginTop: spacing.sm }]}>Sail plan</Text>
            <Segmented<SailMode>
              testID="sail-plan-control"
              value={state.strategy.sailMode ?? 'manual'}
              options={[
                { value: 'manual', label: 'Manual' },
                { value: 'conservative', label: 'Steady' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'aggressive', label: 'Keen' },
              ]}
              onSelect={(sailMode) => setStrategy({ sailMode })}
            />
            {mine ? (
              <View style={styles.etaRow}>
                <View>
                  <Text style={styles.planLabel}>Projected finish</Text>
                  <Text style={styles.etaValue}>{formatDuration(mine.hours)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', flex: 1 }}>
                  <Text style={styles.planLabel}>vs the fast line</Text>
                  {offThePace ? (
                    <Text style={styles.etaSlower}>
                      {sideName(fastest!.bias)} is {formatDuration(saving)} quicker
                    </Text>
                  ) : (
                    <Text style={styles.etaOnPace}>You're on the fast line ✓</Text>
                  )}
                </View>
              </View>
            ) : null}
            {offThePace ? (
              <Text style={styles.etaCaption}>The green dashes mark the faster route.</Text>
            ) : null}

            <Text style={styles.planHint}>
              Estimated from the polar &amp; forecast — you can adjust both at any time during the race.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <NauticalButton label="Start Racing" onPress={start} />
      </View>
    </View>
  );
};

const sideName = (bias: RoutingBias): string =>
  bias < 0 ? 'Banking left' : bias > 0 ? 'Banking right' : 'The optimal line';

// A short, honest issue time for the live forecast note.
const issuedLabel = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 16) : d.toLocaleString();
};

// How far the forecast on screen can be trusted at the scrubbed hour — falls off
// with the lookahead, held up by a strong Navigator. Under a live scenario the
// truth is a real forecast, so the bar reads as the Navigator's own judgement.
const ConfidenceBar: React.FC<{
  confidence: number;
  navName?: string;
  navSkill: number;
  live?: boolean;
}> = ({ confidence, navName, navSkill, live }) => {
  const pct = Math.round(confidence * 100);
  const colour =
    confidence >= 0.75 ? colors.signalGreen : confidence >= 0.45 ? colors.warning : colors.signalRed;
  return (
    <View style={styles.confWrap}>
      <View style={styles.confHead}>
        <Text style={styles.confLabel}>{live ? "Navigator's read" : 'Forecast confidence'}</Text>
        <Text style={[styles.confPct, { color: colour }]}>{pct}%</Text>
      </View>
      <View style={styles.confTrack}>
        <View style={[styles.confFill, { width: `${pct}%`, backgroundColor: colour }]} />
      </View>
      <Text style={styles.confNav}>
        {navName
          ? `Navigator ${navName} (skill ${Math.round(navSkill)}) reads it this far`
          : `No navigator aboard — relying on crew nous (${Math.round(navSkill)})`}
      </Text>
    </View>
  );
};

const Fact: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.fact}>
    <Text style={styles.factValue}>{value}</Text>
    <Text style={styles.factLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg, alignItems: 'center' },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  raceName: { color: colors.foam, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  sub: { color: colors.mist, fontSize: fontSize.sm, marginTop: 2, marginBottom: spacing.md },
  mapWrap: { alignItems: 'center', marginBottom: spacing.md },
  layerToggle: { position: 'absolute', top: spacing.md, right: spacing.md },
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
  windRow: { flexDirection: 'row', alignItems: 'center' },
  windInfo: { flex: 1, marginLeft: spacing.lg },
  panelLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigValue: { color: colors.foam, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginTop: 2 },
  outlook: { color: colors.brassLight, fontSize: fontSize.sm, marginTop: spacing.xs, lineHeight: 18 },
  // A navigator's weather read, not a good-state — `info` cyan, so the teal
  // "good" keeps its meaning next door.
  hint: { color: status.info, fontSize: fontSize.sm, marginTop: spacing.xs },
  firstLeg: { color: colors.mist, fontSize: fontSize.sm, marginTop: spacing.xs },
  handicap: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
  hazard: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 20 },
  storyTheme: {
    color: colors.brassLight,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    lineHeight: 22,
  },
  storyStakes: { color: colors.foam, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
  storyBody: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
  storyCoached: {
    color: colors.signalGreen,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
  tideNote: { color: colors.tide, fontSize: fontSize.sm, lineHeight: 20, marginTop: spacing.sm },
  factRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  fact: {
    flex: 1,
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  factValue: { color: colors.foam, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  factLabel: { color: status.labelOnPanel, fontSize: fontSize.xs, textTransform: 'uppercase', marginTop: 2 },
  planLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  planHint: { color: status.labelOnPanel, fontSize: fontSize.xs, marginTop: spacing.sm },
  archive: { marginTop: spacing.md },
  archiveLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  editionChip: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  editionChipActive: { borderColor: colors.brassLight, backgroundColor: colors.hull },
  editionLabel: { color: colors.foam, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  editionLabelActive: { color: colors.brassLight },
  editionBlurb: { color: colors.mist, fontSize: fontSize.xs, lineHeight: 16, marginTop: 2 },
  archiveNote: { color: status.labelOnPanel, fontSize: fontSize.xs, marginTop: spacing.xs, fontStyle: 'italic' },
  liveNote: { color: colors.mist, fontSize: fontSize.xs, marginTop: spacing.sm, lineHeight: 16 },
  liveNoteWarn: { color: colors.warning, fontSize: fontSize.xs, marginTop: spacing.sm, lineHeight: 16 },
  liveDisclaimer: { color: status.labelOnPanel, fontSize: fontSize.xs, marginTop: spacing.xs, fontStyle: 'italic' },
  confWrap: { marginTop: spacing.sm },
  confHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  confPct: { fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  confTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
    marginTop: 4,
  },
  confFill: { height: '100%', borderRadius: radius.pill },
  confNav: { color: colors.mist, fontSize: fontSize.xs, marginTop: 4 },
  forecastHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
  },
  etaValue: { color: colors.foam, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginTop: 2 },
  etaSlower: { color: colors.brassLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginTop: 2, textAlign: 'right' },
  etaOnPace: { color: colors.signalGreen, fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginTop: 2, textAlign: 'right' },
  etaCaption: { color: colors.signalGreen, fontSize: fontSize.xs, marginTop: spacing.xs },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
});

export default BriefingScreen;
