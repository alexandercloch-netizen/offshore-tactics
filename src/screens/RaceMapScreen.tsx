import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GameEvent, RootStackParamList, TacticalChoice } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { getBoatById, getRaceById } from '../data';
import { useGame } from '../store/GameContext';
import { formatDuration, pointOfSailForLeg } from '../engine/gameEngine';
import RouteMap from '../components/RouteMap';
import WindIndicator from '../components/WindIndicator';
import StatBar from '../components/StatBar';
import NauticalButton from '../components/NauticalButton';
import TacticalDecisionModal from '../components/TacticalDecisionModal';

type Props = NativeStackScreenProps<RootStackParamList, 'RaceMap'>;

export const RaceMapScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, beginRace, sailLeg, resolveLeg, retireRace } = useGame();
  const [activeEvent, setActiveEvent] = useState<GameEvent | null>(null);

  const race = getRaceById(state.selectedRaceId);
  const boat = getBoatById(state.selectedBoatId);

  // If we landed here without an active race but with a full loadout, start it.
  useEffect(() => {
    if (!state.progress && race && boat && state.selectedCrewIds.length > 0) {
      beginRace();
    }
  }, [state.progress, race, boat, state.selectedCrewIds.length, beginRace]);

  const finishIfDone = useCallback(
    (finished: boolean, retired: boolean) => {
      if (finished || retired) {
        navigation.reset({ index: 0, routes: [{ name: 'Results' }] });
      }
    },
    [navigation]
  );

  const handleSail = useCallback(() => {
    const event = sailLeg();
    if (event) {
      setActiveEvent(event);
      return;
    }
    const outcome = resolveLeg(null);
    finishIfDone(outcome.finished, outcome.retired);
  }, [sailLeg, resolveLeg, finishIfDone]);

  const handleChoice = useCallback(
    (choice: TacticalChoice) => {
      setActiveEvent(null);
      const outcome = resolveLeg(choice);
      finishIfDone(outcome.finished, outcome.retired);
    },
    [resolveLeg, finishIfDone]
  );

  const confirmRetire = useCallback(() => {
    Alert.alert('Retire from Race', 'Abandon the race and head for port?', [
      { text: 'Keep Racing', style: 'cancel' },
      {
        text: 'Retire',
        style: 'destructive',
        onPress: () => {
          retireRace();
          navigation.reset({ index: 0, routes: [{ name: 'Results' }] });
        },
      },
    ]);
  }, [retireRace, navigation]);

  if (!race || !boat || !state.progress || !state.weather) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Preparing the race…</Text>
      </View>
    );
  }

  const { progress, condition, weather } = state;
  const nextPointOfSail = pointOfSailForLeg(progress.currentLeg);
  const recentLog = state.eventLog.slice(-4).reverse();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.raceName}>{race.name}</Text>
            <Text style={styles.boatName}>aboard {boat.name}</Text>
          </View>
          <View style={styles.positionBox}>
            <Text style={styles.positionValue}>{progress.position}</Text>
            <Text style={styles.positionLabel}>of {race.fleetSize}</Text>
          </View>
        </View>

        <RouteMap
          totalLegs={race.totalLegs}
          currentLeg={progress.currentLeg}
          width={width - spacing.lg * 2 - spacing.sm * 2}
        />

        <View style={styles.metricsRow}>
          <Metric
            label="Leg"
            value={`${Math.min(progress.currentLeg + 1, race.totalLegs)}/${race.totalLegs}`}
          />
          <Metric label="Elapsed" value={formatDuration(progress.elapsedHours)} />
          <Metric
            label="Sailed"
            value={`${Math.round(progress.distanceCoveredNm)} nm`}
          />
        </View>

        <View style={styles.panel}>
          <View style={styles.windRow}>
            <WindIndicator weather={weather} size={110} />
            <View style={styles.windInfo}>
              <Text style={styles.nextLeg}>Next leg</Text>
              <Text style={styles.pointOfSail}>{nextPointOfSail}</Text>
              <Text style={styles.weatherDesc}>{weather.description}</Text>
            </View>
          </View>
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
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <NauticalButton label="Sail Next Leg" onPress={handleSail} />
        <NauticalButton label="Retire" variant="ghost" onPress={confirmRetire} />
      </View>

      <TacticalDecisionModal
        visible={!!activeEvent}
        event={activeEvent}
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
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: spacing.md,
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
    marginBottom: spacing.md,
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
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
});

export default RaceMapScreen;
