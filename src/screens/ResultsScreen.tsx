import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RaceResult, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { getRaceById } from '../data';
import { LANDMASSES } from '../data/landmasses';
import { useGame } from '../store/GameContext';
import { formatDuration, formatGap } from '../engine/gameEngine';
import { courseAspect } from '../engine/geo';
import NauticalButton from '../components/NauticalButton';
import RouteMap from '../components/RouteMap';

// A corrected gap this tight (seconds) is a photo finish — rare by design — and
// earns the extra suspense beat before the corrected result is shown.
const PHOTO_FINISH_SECONDS = 10;

type Props = NativeStackScreenProps<RootStackParamList, 'Results'>;

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export const ResultsScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, prepareNextRace, money } = useGame();
  const result = state.lastResult;
  // The staged finish reveal plays once over the results, then reveals the full
  // debrief. A finisher gets the staged sequence; a retirement/DNF skips it.
  const [revealDone, setRevealDone] = useState(!result?.finished);

  const goHome = () => {
    prepareNextRace();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const raceAgain = () => {
    prepareNextRace();
    navigation.reset({ index: 0, routes: [{ name: 'Main' }, { name: 'RaceSelect' }] });
  };

  if (!result) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No race result to show.</Text>
        <NauticalButton label="Back to Harbour" onPress={goHome} />
      </View>
    );
  }

  const podium = result.finished && result.position <= 3;
  const won = result.finished && result.position === 1;

  // The facts-only finish line: who took line honours on corrected time, and how
  // the player fared against their nearest neighbour. Only true facts about THIS
  // race — never invented tactics or reasons.
  const finishLine = finishDebriefLine(result);
  const headline = result.retired
    ? 'RETIRED'
    : won
      ? 'LINE HONOURS'
      : podium
        ? 'PODIUM'
        : 'FINISHED';
  const headlineColor = result.retired
    ? colors.signalRed
    : won
      ? colors.brassLight
      : podium
        ? colors.signalGreen
        : colors.foam;

  return (
    <View style={styles.screen} testID="results-reveal">
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={[styles.headline, { color: headlineColor }]}>{headline}</Text>
      <Text style={styles.raceName}>
        {result.raceName}
        {result.division
          ? ` • ${result.division === 'pro' ? 'Pro' : 'Corinthian'} Division`
          : ''}
      </Text>

      <View style={styles.positionCard}>
        {result.retired ? (
          <Text style={styles.retiredText}>Did not finish</Text>
        ) : (
          <>
            <Text style={styles.positionValue}>{ordinal(result.position)}</Text>
            <Text style={styles.positionSub}>of {result.fleetSize} on corrected time</Text>
            {result.onWaterPosition && result.onWaterPosition !== result.position ? (
              <Text style={styles.positionSwing}>
                {ordinal(result.onWaterPosition)} across the line
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>
            {result.retired ? '—' : formatDuration(result.elapsedHours)}
          </Text>
          <Text style={styles.statLabel}>Elapsed (on the water)</Text>
        </View>
        {!result.retired && result.correctedHours ? (
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDuration(result.correctedHours)}</Text>
            <Text style={styles.statLabel}>Corrected Time</Text>
          </View>
        ) : null}
        <View style={styles.statCard}>
          <Text
            style={[
              styles.statValue,
              { color: result.prizeMoney > 0 ? colors.signalGreen : colors.mist },
            ]}
          >
            {money(result.prizeMoney)}
          </Text>
          <Text style={styles.statLabel}>Prize Money</Text>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.summary}>{result.summary}</Text>
      </View>

      {finishLine ? (
        <View style={styles.finishLineCard} testID="finish-debrief-line">
          <Text style={styles.finishLineText}>{finishLine}</Text>
        </View>
      ) : null}

      {result.storyDebrief ? (
        <View style={styles.summaryCard} testID="results-debrief">
          <Text style={styles.storyTitle}>The Story of the Race</Text>
          <Text style={styles.summary}>{result.storyDebrief}</Text>
        </View>
      ) : null}

      <Debrief result={result} width={width} />

      <View style={styles.fundsCard}>
        <Text style={styles.fundsLabel}>Campaign Funds</Text>
        <Text style={styles.fundsValue}>{money(state.funds)}</Text>
      </View>

      {state.eventLog.length > 0 ? (
        <View style={styles.logCard}>
          <Text style={styles.logTitle}>Race Log</Text>
          {state.eventLog.map((entry, i) => (
            <Text key={`${entry}-${i}`} style={styles.logEntry}>
              • {entry}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <NauticalButton label="Enter Another Race" onPress={raceAgain} />
        <NauticalButton label="Back to Harbour" variant="secondary" onPress={goHome} />
      </View>
    </ScrollView>
      {!revealDone ? (
        <FinishReveal result={result} insets={insets} onDone={() => setRevealDone(true)} />
      ) : null}
    </View>
  );
};

// The staged finish reveal: a short, restrained sequence that lands the handicap
// drama. Stage 1 shows the line-honours placing + elapsed, Stage 2 holds while
// the handicap is applied (with a rare photo-finish beat first), then it lifts to
// reveal the full results underneath. Tap anywhere to skip straight through — so
// replays and e2e are never gated on the animation. Pure setTimeout timers, so it
// runs identically on iOS, Android and web.
type RevealStage = 'crossed' | 'photo' | 'correcting';

const FinishReveal: React.FC<{
  result: RaceResult;
  insets: { top: number; bottom: number };
  onDone: () => void;
}> = ({ result, insets, onDone }) => {
  const isPhotoFinish =
    result.nearestCorrectedGapSeconds != null &&
    result.nearestCorrectedGapSeconds <= PHOTO_FINISH_SECONDS;
  const [stage, setStage] = useState<RevealStage>('crossed');
  // Guard against a double-fire (a skip tap racing the final timer).
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Stage 1 → (photo) → correcting → done.
    timers.push(setTimeout(() => setStage(isPhotoFinish ? 'photo' : 'correcting'), 1000));
    if (isPhotoFinish) {
      timers.push(setTimeout(() => setStage('correcting'), 1000 + 1500));
    }
    const correctingAt = 1000 + (isPhotoFinish ? 1500 : 0);
    timers.push(setTimeout(finish, correctingAt + 1800));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhotoFinish]);

  const onWater = result.onWaterPosition ?? result.position;

  return (
    <Pressable
      style={[styles.revealOverlay, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      onPress={finish}
      testID="finish-reveal-overlay"
    >
      {stage === 'crossed' ? (
        <View style={styles.revealStage}>
          <Text style={styles.revealKicker}>CROSSED THE LINE</Text>
          <Text style={styles.revealPlace}>{ordinal(onWater)}</Text>
          <Text style={styles.revealSub}>on the water</Text>
          <Text style={styles.revealTime}>{formatDuration(result.elapsedHours)} elapsed</Text>
        </View>
      ) : stage === 'photo' ? (
        <View style={styles.revealStage}>
          <Text style={styles.revealKicker}>PHOTO FINISH</Text>
          <Text style={styles.revealCorrecting}>Analyzing the line…</Text>
        </View>
      ) : (
        <View style={styles.revealStage}>
          <Text style={styles.revealKicker}>CORRECTING TIME…</Text>
          <Text style={styles.revealCorrecting}>Applying the handicap</Text>
        </View>
      )}
      <Text style={styles.revealSkip}>Tap to skip</Text>
    </Pressable>
  );
};

// The facts-only finish line: line honours on corrected time + the player's
// nearest neighbour and the margin between them. Strictly true facts captured at
// the finish — never a reason a boat won, never invented rivalry.
function finishDebriefLine(result: RaceResult): string | null {
  if (!result.finished || result.retired) return null;
  const parts: string[] = [];
  if (result.correctedWinnerName) {
    parts.push(`Line honours to ${result.correctedWinnerName} on corrected time.`);
  }
  if (result.nearestRivalName && result.nearestCorrectedGapSeconds != null) {
    const margin = formatGap(result.nearestCorrectedGapSeconds);
    // Truthful framing of the margin: if the nearest boat beat the player on
    // corrected time the player chased it; otherwise the player held it off.
    if (result.nearestRivalAhead) {
      parts.push(`${result.nearestRivalName} edged you by ${margin} on corrected time.`);
    } else {
      parts.push(`You held off ${result.nearestRivalName} by ${margin} on corrected time.`);
    }
  }
  return parts.length ? parts.join(' ') : null;
}

// The tactician's debrief: the line you sailed (solid) against the weather-optimal
// line (green dashed), and how your time compared with a clean run on it.
const Debrief: React.FC<{ result: NonNullable<ReturnType<typeof useGame>['state']['lastResult']>; width: number }> = ({
  result,
  width,
}) => {
  const race = getRaceById(result.raceId);
  if (!result.finished || !race || !result.trail || result.trail.length < 2) return null;

  const mapWidth = Math.min(width - spacing.lg * 2, 720);
  const mapHeight = Math.max(220, Math.min(Math.round(mapWidth * courseAspect(race.waypoints)), 420));
  const delta = result.optimalHours != null ? result.elapsedHours - result.optimalHours : null;

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.debriefTitle}>Tactician's Debrief</Text>
      <Text style={styles.debriefSub}>Your line (solid) vs the weather-optimal route (dashed)</Text>
      <View style={{ alignItems: 'center', marginVertical: spacing.sm }}>
        <RouteMap
          waypoints={race.waypoints}
          trail={result.trail}
          altRoute={result.optimalRoute}
          land={LANDMASSES[race.id]}
          width={mapWidth}
          height={mapHeight}
        />
      </View>
      {delta != null ? (
        <Text style={styles.debriefLine}>
          Sailed {formatDuration(result.elapsedHours)} · optimal line ≈{' '}
          {formatDuration(result.optimalHours!)} ·{' '}
          {delta > 0.02
            ? `${formatDuration(delta)} left on the table`
            : 'you matched the optimal line'}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  content: {
    padding: spacing.xl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.abyss,
  },
  emptyText: {
    color: colors.mist,
    fontSize: fontSize.md,
  },
  headline: {
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
    letterSpacing: 4,
    textAlign: 'center',
  },
  raceName: {
    color: colors.mist,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  positionCard: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  positionValue: {
    color: colors.foam,
    fontSize: 64,
    fontWeight: fontWeight.bold,
  },
  positionSub: {
    color: colors.mist,
    fontSize: fontSize.md,
  },
  positionSwing: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  retiredText: {
    color: colors.signalRed,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  statValue: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  summary: {
    color: colors.foam,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  storyTitle: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  debriefTitle: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  debriefSub: {
    color: colors.mist,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  debriefLine: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  fundsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  fundsLabel: {
    color: colors.mist,
    fontSize: fontSize.sm,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fundsValue: {
    color: colors.brassLight,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  logCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  logTitle: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  logEntry: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.md,
  },
  finishLineCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.brass,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  finishLineText: {
    color: colors.foam,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  revealOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.abyss,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  revealStage: {
    alignItems: 'center',
  },
  revealKicker: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  revealPlace: {
    color: colors.foam,
    fontSize: 72,
    fontWeight: fontWeight.bold,
  },
  revealSub: {
    color: colors.mist,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  revealTime: {
    color: colors.brassLight,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginTop: spacing.md,
  },
  revealCorrecting: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
  revealSkip: {
    position: 'absolute',
    bottom: spacing.xxl,
    color: colors.slate,
    fontSize: fontSize.xs,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default ResultsScreen;
