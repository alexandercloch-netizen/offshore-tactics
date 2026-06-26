import React from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { getRaceById } from '../data';
import { LANDMASSES } from '../data/landmasses';
import { useGame } from '../store/GameContext';
import { formatDuration } from '../engine/gameEngine';
import { courseAspect } from '../engine/geo';
import NauticalButton from '../components/NauticalButton';
import RouteMap from '../components/RouteMap';

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
  );
};

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
});

export default ResultsScreen;
