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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EffortMode, RootStackParamList, RoutingBias } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { getCrewById, getRaceById } from '../data';
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
  resolveBoatById,
} from '../engine/gameEngine';
import { planRoute, WindSampler } from '../engine/router';
import { courseAspect, courseBounds } from '../engine/geo';
import {
  featureState,
  forecastConfidence,
  pressureHint,
  sampleForecast,
  sampleForecastGrid,
  weatherOutlook,
} from '../engine/wind';
import RouteMap from '../components/RouteMap';
import WindIndicator from '../components/WindIndicator';
import NauticalButton from '../components/NauticalButton';
import ForecastScrubber from '../components/ForecastScrubber';
import WindScaleLegend from '../components/WindScaleLegend';
import ForecastGraph, { ForecastGraphReadout, ForecastPoint } from '../components/ForecastGraph';
import ErrorBoundary from '../components/ErrorBoundary';

type Props = NativeStackScreenProps<RootStackParamList, 'Briefing'>;

// The pre-start briefing: a calm beat before the gun to read the course and the
// conditions, and to set the plan (effort + which side to favour) you'll sail
// off the line. Mirrors how a real crew prepares before racing.
export const BriefingScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { state, beginRace, setStrategy } = useGame();
  // Forecast offset (hours from the start) the player is scrubbing through.
  const [forecastHour, setForecastHour] = useState(0);

  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
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

  // The race is normally committed (funds + wind field + fleet) when leaving
  // provisioning; begin it here as a fallback if we somehow arrived unstarted.
  useEffect(() => {
    if (!state.progress && race && boat && state.selectedCrewIds.length > 0) {
      beginRace();
    }
  }, [state.progress, race, boat, state.selectedCrewIds.length, beginRace]);

  if (!race || !boat || !state.progress || !state.weather || !state.windField) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Reading the conditions…</Text>
      </View>
    );
  }

  const { progress, weather, windField } = state;
  const divisionName = state.selectedDivision === 'pro' ? 'Pro' : 'Corinthian';
  const fleetSize = raceDivision(race, state.selectedDivision).fleetSize;
  const outlook = weatherOutlook(windField, progress.lat, progress.lon, 0);
  const hint = pressureHint(windField, progress.lat, progress.lon, 0);

  // Map sized to the course, centred in a max-width column (as in the race).
  const CONTENT_MAX = 760;
  const columnWidth = Math.min(width - spacing.lg * 2, CONTENT_MAX);
  const mapWidth = columnWidth - spacing.sm * 2;
  const mapAspect = Math.max(0.55, Math.min(courseAspect(race.waypoints), 1.3));
  const mapHeight = Math.max(280, Math.min(Math.round(mapWidth * mapAspect), Math.round(height * 0.5)));

  // The wind chart reflects the scrubbed forecast hour: arrows for direction, a
  // dense grid for the speed heatmap, and the drifting pressure feature. (Plain
  // calls — they must sit after the loading guard, so no hooks here.)
  const bounds = courseBounds(race.waypoints);
  const heatCols = 22;
  const heatRows = Math.max(10, Math.min(30, Math.round(heatCols * courseAspect(race.waypoints))));
  // The chart shows the crew's *forecast*, not ground truth: it grows fuzzier the
  // further out you scrub, and a sharp Navigator keeps it trustworthy for longer.
  const confidence = forecastConfidence(navSkill, forecastHour);
  const windArrows = sampleForecastGrid(windField, bounds, 7, 6, forecastHour, navSkill);
  const heat = sampleForecastGrid(windField, bounds, heatCols, heatRows, forecastHour, navSkill);
  const feature = featureState(windField, forecastHour);
  const navigator = state.selectedCrewIds
    .map((id) => getCrewById(id))
    .find((c) => c?.role === 'Navigator');

  // Meteogram series: the forecast wind at the start over the planning window,
  // and the exact sample under the scrubber cursor.
  const GRAPH_SAMPLES = 25;
  const forecastSeries: ForecastPoint[] = Array.from({ length: GRAPH_SAMPLES }, (_, i) => {
    const h = (i / (GRAPH_SAMPLES - 1)) * maxForecastHour;
    const s = sampleForecast(windField, progress.lat, progress.lon, h, navSkill);
    return { hour: h, speedKn: s.speedKn, fromDeg: s.fromDeg, confidence: forecastConfidence(navSkill, h) };
  });
  const cursorSample = sampleForecast(windField, progress.lat, progress.lon, forecastHour, navSkill);
  const cursorPoint: ForecastPoint = {
    hour: forecastHour,
    speedKn: cursorSample.speedKn,
    fromDeg: cursorSample.fromDeg,
    confidence: confidence,
  };
  // A planning window scaled to the race, capped so the slider stays useful.
  const maxForecastHour = Math.min(48, Math.max(8, Math.ceil(race.recordTimeHours)));

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
    navigation.reset({ index: 0, routes: [{ name: 'RaceMap' }] });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}>
        <View style={{ width: columnWidth }}>
          <Text style={styles.kicker}>Skipper's Briefing</Text>
          <Text style={styles.raceName}>{race.name}</Text>
          <Text style={styles.sub}>
            {race.location} · {divisionName} division · {fleetSize} boats
          </Text>

          <View style={styles.mapWrap}>
            <RouteMap
              waypoints={race.waypoints}
              route={mine?.route ?? progress.route}
              altRoute={offThePace ? fastest!.route : undefined}
              boat={{ lat: progress.lat, lon: progress.lon }}
              wind={windArrows}
              heat={heat}
              heatCols={heatCols}
              heatRows={heatRows}
              windFeature={feature}
              land={LANDMASSES[race.id]}
              width={mapWidth}
              height={mapHeight}
            />
            <View style={{ width: mapWidth }}>
              <WindScaleLegend />
              <ForecastScrubber
                hour={forecastHour}
                maxHour={maxForecastHour}
                onChange={setForecastHour}
              />
              <ConfidenceBar
                confidence={confidence}
                navName={navigator?.name}
                navSkill={navSkill}
              />
            </View>
          </View>

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

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Signature Challenge</Text>
            <Text style={styles.hazard}>{race.signatureHazard}</Text>
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

// How far the forecast on screen can be trusted at the scrubbed hour — falls off
// with the lookahead, held up by a strong Navigator.
const ConfidenceBar: React.FC<{ confidence: number; navName?: string; navSkill: number }> = ({
  confidence,
  navName,
  navSkill,
}) => {
  const pct = Math.round(confidence * 100);
  const colour =
    confidence >= 0.75 ? colors.signalGreen : confidence >= 0.45 ? colors.warning : colors.signalRed;
  return (
    <View style={styles.confWrap}>
      <View style={styles.confHead}>
        <Text style={styles.confLabel}>Forecast confidence</Text>
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

interface SegProps<T> {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
}
function Segmented<T extends string | number>({ value, options, onSelect }: SegProps<T>) {
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
  screen: { flex: 1, backgroundColor: colors.abyss },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.abyss },
  loadingText: { color: colors.mist, fontSize: fontSize.md },
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
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bigValue: { color: colors.foam, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginTop: 2 },
  outlook: { color: colors.brassLight, fontSize: fontSize.sm, marginTop: spacing.xs, lineHeight: 18 },
  hint: { color: colors.signalGreen, fontSize: fontSize.sm, marginTop: spacing.xs },
  firstLeg: { color: colors.mist, fontSize: fontSize.sm, marginTop: spacing.xs },
  hazard: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 20 },
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
  factLabel: { color: colors.slate, fontSize: fontSize.xs, textTransform: 'uppercase', marginTop: 2 },
  planLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  planHint: { color: colors.slate, fontSize: fontSize.xs, marginTop: spacing.sm },
  confWrap: { marginTop: spacing.sm },
  confHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confLabel: {
    color: colors.slate,
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
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.hull },
  segmentLabel: { color: colors.mist, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  segmentLabelActive: { color: colors.brassLight, fontWeight: fontWeight.bold },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
});

export default BriefingScreen;
