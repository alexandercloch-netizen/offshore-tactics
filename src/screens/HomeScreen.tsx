import React from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import { useAuth } from '../store/AuthContext';
import { formatDuration } from '../engine/gameEngine';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, prepareNextRace, resetCampaign } = useGame();
  const { configured, user, displayName } = useAuth();
  const raceInProgress = !!state.progress;
  const best = state.history.find((r) => r.finished && r.position === 1);
  const wins = state.history.filter((r) => r.finished && r.position === 1).length;

  const startNewCampaign = () => {
    prepareNextRace();
    navigation.navigate('RaceSelect');
  };

  const confirmReset = () => {
    Alert.alert(
      'Reset Campaign',
      'This wipes your funds, fleet history and progress. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => resetCampaign(),
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      {configured ? (
        <View style={styles.accountBar}>
          <Text style={styles.accountText}>
            {user ? `Signed in as ${displayName}` : 'Playing as guest'}
          </Text>
          <Text
            style={styles.accountAction}
            onPress={() => navigation.navigate('Auth')}
          >
            {user ? 'Account' : 'Sign in'}
          </Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.kicker}>A Sailing Strategy Game</Text>
        <Text style={styles.title}>OFFSHORE</Text>
        <Text style={styles.title}>TACTICS</Text>
        <Text style={styles.tagline}>
          Pick your race, charter a boat, sign a crew and outwit the weather to
          take line honours.
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>£{state.funds.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Funds</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{wins}</Text>
          <Text style={styles.statLabel}>Wins</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{state.history.length}</Text>
          <Text style={styles.statLabel}>Races</Text>
        </View>
      </View>

      {best ? (
        <View style={styles.bestCard}>
          <Text style={styles.bestLabel}>Best Result</Text>
          <Text style={styles.bestRace}>{best.raceName}</Text>
          <Text style={styles.bestTime}>
            1st place • {formatDuration(best.elapsedHours)}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {raceInProgress ? (
          <NauticalButton
            label="Resume Race"
            subtitle="You have a race underway"
            onPress={() => navigation.navigate('RaceMap')}
          />
        ) : null}
        <NauticalButton
          label={raceInProgress ? 'New Race' : 'Start Racing'}
          variant={raceInProgress ? 'secondary' : 'primary'}
          onPress={startNewCampaign}
        />
        <NauticalButton
          label="My Fleet"
          subtitle={
            state.profile.fleet.length > 0
              ? `${state.profile.fleet.length} custom boat${state.profile.fleet.length > 1 ? 's' : ''}`
              : 'Build a custom boat'
          }
          variant="secondary"
          onPress={() => navigation.navigate('Fleet')}
        />
        {configured ? (
          <NauticalButton
            label="Leaderboard"
            variant="secondary"
            onPress={() => navigation.navigate('Leaderboard')}
          />
        ) : null}
        {state.history.length > 0 ? (
          <NauticalButton
            label="Reset Campaign"
            variant="ghost"
            onPress={confirmReset}
          />
        ) : null}
      </View>

      {state.history.length > 0 ? (
        <View style={styles.logbook}>
          <Text style={styles.logbookTitle}>Logbook</Text>
          {state.history.slice(0, 5).map((r) => (
            <View key={r.timestamp} style={styles.logRow}>
              <Text style={styles.logRace}>{r.raceName}</Text>
              <Text
                style={[
                  styles.logResult,
                  { color: r.retired ? colors.signalRed : colors.foam },
                ]}
              >
                {r.retired
                  ? 'Retired'
                  : `${r.position}/${r.fleetSize} • ${formatDuration(r.elapsedHours)}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  content: {
    paddingHorizontal: spacing.xl,
  },
  accountBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  accountText: {
    color: colors.mist,
    fontSize: fontSize.sm,
  },
  accountAction: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  hero: {
    marginBottom: spacing.xl,
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
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    letterSpacing: 4,
    lineHeight: 40,
  },
  tagline: {
    color: colors.mist,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.md,
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
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: {
    color: colors.brassLight,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    color: colors.mist,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  bestCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bestLabel: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bestRace: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  bestTime: {
    color: colors.mist,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  actions: {
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  logbook: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
  },
  logbookTitle: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
  },
  logRace: {
    color: colors.mist,
    fontSize: fontSize.sm,
    flex: 1,
  },
  logResult: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});

export default HomeScreen;
