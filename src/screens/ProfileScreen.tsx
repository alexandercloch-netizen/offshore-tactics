import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabParamList, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import { useAuth } from '../store/AuthContext';
import { formatDuration } from '../engine/gameEngine';
import NauticalButton from '../components/NauticalButton';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, resetCampaign } = useGame();
  const { configured, user, displayName } = useAuth();
  const best = state.history.find((r) => r.finished && r.position === 1);
  const wins = state.history.filter((r) => r.finished && r.position === 1).length;

  const confirmReset = () => {
    Alert.alert(
      'Reset Campaign',
      'This wipes your funds, fleet history and progress. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => resetCampaign() },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      {configured ? (
        <View style={styles.accountBar}>
          <Text style={styles.accountText}>
            {user ? `Signed in as ${displayName}` : 'Playing as guest'}
          </Text>
          <Text style={styles.accountAction} onPress={() => navigation.navigate('Auth')}>
            {user ? 'Account' : 'Sign in'}
          </Text>
        </View>
      ) : null}

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
          <Text style={styles.bestTime}>1st place • {formatDuration(best.elapsedHours)}</Text>
        </View>
      ) : null}

      {state.history.length > 0 ? (
        <View style={styles.logbook}>
          <Text style={styles.logbookTitle}>Logbook</Text>
          {state.history.slice(0, 8).map((r) => (
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
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No races sailed yet.</Text>
          <Text style={styles.emptySub}>Your results and best finishes will appear here.</Text>
        </View>
      )}

      <View style={styles.actions}>
        <NauticalButton
          label="Edit Preferences"
          variant="secondary"
          onPress={() => navigation.navigate('Onboarding')}
        />
        {state.history.length > 0 ? (
          <NauticalButton label="Reset Campaign" variant="ghost" onPress={confirmReset} />
        ) : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
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
  accountText: { color: colors.mist, fontSize: fontSize.sm },
  accountAction: { color: colors.brassLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: { color: colors.brassLight, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
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
  bestRace: { color: colors.foam, fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginTop: spacing.xs },
  bestTime: { color: colors.mist, fontSize: fontSize.sm, marginTop: 2 },
  logbook: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.lg,
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
  logRace: { color: colors.mist, fontSize: fontSize.sm, flex: 1 },
  logResult: { fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  empty: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyText: { color: colors.foam, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  emptySub: { color: colors.slate, fontSize: fontSize.sm, marginTop: spacing.xs, textAlign: 'center' },
  actions: { gap: spacing.md },
});

export default ProfileScreen;
