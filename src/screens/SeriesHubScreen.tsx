import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing, status } from '../theme';
import { getRaceById } from '../data';
import { getSeriesById } from '../data/series';
import { seriesStandings } from '../engine/series';
import { useGame } from '../store/GameContext';
import NauticalButton from '../components/NauticalButton';
import EmptyState from '../components/EmptyState';

type Props = NativeStackScreenProps<RootStackParamList, 'SeriesHub'>;

// The regatta hub: the week at a glance — days sailed, the live points table,
// and the next day's start. Pure display over series data + stored results; the
// setup funnel from here on is the ordinary race flow.
export const SeriesHubScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { state, selectRace, enterSeries, money } = useGame();
  const series = getSeriesById(route.params.seriesId);

  if (!series) {
    return <EmptyState fill title="No such regatta." />;
  }

  const active = state.seriesProgress?.seriesId === series.id;
  const sailed = new Set(active ? state.seriesProgress!.sailedRaceIds : []);
  const rows = seriesStandings(series, state.history);
  const nextDayId = series.memberRaceIds.find((id) => !sailed.has(id));
  const nextRace = getRaceById(nextDayId);
  const canAffordEntry = state.freeSailing || state.funds >= series.entryFee;

  const sailNext = () => {
    if (!nextRace) return;
    selectRace(nextRace.id, state.selectedDivision ?? 'corinthian');
    navigation.navigate('BoatSelect');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      testID="series-hub"
    >
      <Text style={styles.name}>{series.name}</Text>
      <Text style={styles.location}>{series.location} • {series.season}</Text>
      <Text style={styles.description}>{series.description}</Text>

      <View style={styles.daysCard}>
        <Text style={styles.kicker}>The Week</Text>
        {series.memberRaceIds.map((id, i) => {
          const race = getRaceById(id);
          const done = sailed.has(id);
          const isNext = active && id === nextDayId;
          return (
            <View key={id} style={styles.dayRow}>
              <Text style={[styles.dayName, done && styles.dayDone]}>
                {race?.name.replace(`${series.name} — `, '') ?? id}
              </Text>
              <Text style={[styles.dayState, done ? styles.dayDone : isNext ? styles.dayNext : undefined]}>
                {done ? 'Sailed' : isNext ? 'Next' : `Day ${i + 1}`}
              </Text>
            </View>
          );
        })}
      </View>

      {rows.length > 0 ? (
        <View style={styles.tableCard} testID="series-standings">
          <Text style={styles.kicker}>Series Standings</Text>
          {rows.slice(0, 10).map((r) => (
            <View key={r.name} style={styles.standRow}>
              <Text style={[styles.standRank, r.isPlayer && styles.standPlayer]}>{r.rank}</Text>
              <Text style={[styles.standName, r.isPlayer && styles.standPlayer]} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={[styles.standPts, r.isPlayer && styles.standPlayer]}>
                {r.points}
                {r.discarded != null ? ` (−${r.discarded})` : ''} pts
              </Text>
            </View>
          ))}
          <Text style={styles.tableNote}>
            Low-point scoring: day rank = points; a missed or retired day scores fleet + 1; one
            discard once every day is sailed.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {!active ? (
          <NauticalButton
            label={
              state.freeSailing
                ? 'Enter the Week'
                : `Enter the Week — ${money(series.entryFee)}`
            }
            onPress={() => enterSeries(series.id)}
            disabled={!canAffordEntry}
          />
        ) : nextRace ? (
          <NauticalButton
            label={`Sail ${nextRace.name.replace(`${series.name} — `, '')}`}
            onPress={sailNext}
          />
        ) : null}
        {!state.freeSailing && !active ? (
          <Text style={styles.feeNote}>
            One entry covers the week; the overall winner takes {money(series.prizeMoney)}.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
  name: { color: colors.foam, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  location: { color: colors.mist, fontSize: fontSize.sm, marginTop: 2 },
  description: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 20, marginVertical: spacing.md },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: spacing.sm,
  },
  daysCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  dayName: { color: colors.foam, fontSize: fontSize.sm, flex: 1, marginRight: spacing.md },
  dayState: { color: status.labelOnPanel, fontSize: fontSize.xs, textTransform: 'uppercase' },
  dayDone: { color: colors.signalGreen },
  dayNext: { color: colors.brassLight, fontWeight: fontWeight.bold },
  tableCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  standRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  standRank: { color: colors.mist, width: 26, fontSize: fontSize.sm, fontVariant: ['tabular-nums'] },
  standName: { color: colors.foam, flex: 1, fontSize: fontSize.sm },
  standPts: { color: colors.mist, fontSize: fontSize.sm, fontVariant: ['tabular-nums'] },
  standPlayer: { color: colors.brassLight, fontWeight: fontWeight.bold },
  tableNote: { color: colors.slate, fontSize: fontSize.xs, lineHeight: 16, marginTop: spacing.sm },
  actions: { gap: spacing.sm },
  feeNote: { color: colors.mist, fontSize: fontSize.xs, textAlign: 'center' },
});

export default SeriesHubScreen;
