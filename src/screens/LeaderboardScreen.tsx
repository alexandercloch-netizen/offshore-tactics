import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    const data = await fetchLeaderboard(raceId);
    setEntries(data);
    setLoading(false);
  }, [configured, raceId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!configured) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Leaderboard unavailable</Text>
        <Text style={styles.emptyBody}>
          Supabase isn't configured for this build, so the global leaderboard is
          turned off.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
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
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brassLight} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
        >
          {entries.length === 0 ? (
            <Text style={styles.noEntries}>
              No times posted yet. Be the first to finish and claim the top spot!
            </Text>
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
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.abyss,
  },
  emptyTitle: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    color: colors.mist,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  filters: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  noEntries: {
    color: colors.mist,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.xxl,
    lineHeight: 22,
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
