import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, spacing } from '../../theme';
import { SailNowScore, breezeBand, windReadout } from '../../engine/sailNow';
import SelectableCard from '../SelectableCard';
import { windHeatColor } from '../windScale';

// §3 "Where to sail today" — the top of the pure ranker's board as three
// tappable cards: the race, its breeze right now, and the WHY in one plain
// sentence assembled from the actual scoring parts.

interface SailTodayBoardProps {
  board: SailNowScore[];
  source: 'live' | 'seasonal';
  onEnterRace: (raceId: string) => void;
}

const BOARD_SIZE = 3;

export const SailTodayBoard: React.FC<SailTodayBoardProps> = ({ board, source, onEnterRace }) => {
  const top = board.slice(0, BOARD_SIZE);
  if (top.length === 0) return null;
  return (
    <View style={styles.section} testID="harbour-board">
      <Text style={styles.kicker}>
        Where to sail today{source === 'seasonal' ? ' — seasonal outlook' : ''}
      </Text>
      {top.map((entry, i) => (
        <SelectableCard
          key={entry.race.id}
          onPress={() => onEnterRace(entry.race.id)}
          accessibilityLabel={`Sail the ${entry.race.name}`}
          testID={`sail-today-card-${i}`}
          style={styles.card}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.raceName}>{entry.race.name}</Text>
            <View style={styles.windTag}>
              <View
                style={[styles.windDot, { backgroundColor: windHeatColor(entry.sample.speedKn) }]}
              />
              <Text style={styles.windText}>{windReadout(entry.sample)}</Text>
            </View>
          </View>
          <Text style={styles.band}>
            {entry.race.location} · {breezeBand(entry.sample.speedKn)} air
          </Text>
          <Text style={styles.why}>{entry.why}</Text>
        </SelectableCard>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  card: {
    marginBottom: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  raceName: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    flex: 1,
  },
  windTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  windDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  windText: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  band: {
    color: colors.mist,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  why: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 19,
    marginTop: spacing.xs,
  },
});

export default SailTodayBoard;
