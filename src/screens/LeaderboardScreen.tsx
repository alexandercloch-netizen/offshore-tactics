import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LeaderboardEntry, MainTabParamList, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { RACES } from '../data';
import { useAuth } from '../store/AuthContext';
import { fetchLeaderboard } from '../services/leaderboard';
import { formatDuration } from '../engine/gameEngine';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Leaderboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const LeaderboardScreen: React.FC<Props> = () => {
  const insets = useSafeAreaInsets();
  const { configured } = useAuth();
  const [raceId, setRaceId] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(false);
    try {
      const data = await fetchLeaderboard(raceId);
      setEntries(data);
    } catch {
      // A failed fetch is distinct from an empty board — show a retry, not
      // "no times yet".
      setError(true);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [configured, raceId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!configured) {
    // The guest/local build: an empty state, never an error — the game simply
    // runs without a cloud.
    return (
      <EmptyState
        fill
        title="Leaderboard unavailable"
        body="Supabase isn't configured for this build, so the global leaderboard is turned off."
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filters}
      >
        <Chip label="All Races" active={!raceId} onPress={() => setRaceId(undefined)} />
        {RACES.map((race) => (
          <Chip
            key={race.id}
            label={race.name}
            active={raceId === race.id}
            onPress={() => setRaceId(race.id)}
          />
        ))}
      </ScrollView>

      {loading ? (
        <LoadingState />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          {error ? (
            // A failed fetch is the error template: same panel, plus a retry.
            <View style={styles.stateWrap}>
              <EmptyState
                title="Couldn't load the leaderboard"
                body="Check your connection and try again."
                action={
                  <Pressable style={styles.retryBtn} onPress={load} accessibilityRole="button">
                    <Text style={styles.retryText}>Retry</Text>
                  </Pressable>
                }
              />
            </View>
          ) : entries.length === 0 ? (
            <View style={styles.stateWrap}>
              <EmptyState
                title="No times posted yet"
                body="Be the first to finish and claim the top spot!"
              />
            </View>
          ) : (
            entries.map((entry, index) => (
              <View key={entry.id ?? index} style={styles.row}>
                <Text style={styles.rank}>{index + 1}</Text>
                <View style={styles.rowMain}>
                  <Text style={styles.name}>{entry.display_name}</Text>
                  <Text style={styles.race}>
                    {entry.race_name} • {entry.position}/{entry.fleet_size}
                  </Text>
                </View>
                <Text style={styles.time}>{formatDuration(entry.elapsed_hours)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
};

const Chip: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label,
  active,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: active }}
    accessibilityLabel={label}
    style={[styles.chip, active && styles.chipActive]}
  >
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  // The bar must hug its content height — without flexGrow:0 a horizontal
  // ScrollView grows to fill the column on web, and `alignItems: center` keeps the
  // chips at their natural height instead of stretching tall (which turned the
  // pill radius into giant ovals).
  filterBar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filters: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hull,
    backgroundColor: colors.card,
    marginRight: spacing.sm,
  },
  chipActive: {
    backgroundColor: colors.brass,
    borderColor: colors.brassLight,
  },
  chipText: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  chipTextActive: {
    color: colors.abyss,
    fontWeight: fontWeight.bold,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  stateWrap: {
    marginTop: spacing.xxl,
  },
  retryBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.steel,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rank: {
    color: colors.brassLight,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    width: 32,
    textAlign: 'center',
  },
  rowMain: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  name: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  race: {
    color: colors.mist,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  time: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});

export default LeaderboardScreen;
