import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme';
import { Race } from '../../types';
import { RACES } from '../../data/races';
import { isInSeason } from '../../engine/sailNow';
import { shortRaceName } from './regions';

// §5 The season board — which classics are traditionally run THIS month
// (race.season is authored as real month names, southern hemisphere included,
// so the check is an honest name match, no hemisphere arithmetic). Locked
// races still show — the calendar is the calendar — but only unlocked ones
// enter.

interface SeasonStripProps {
  now: number;
  onEnterRace: (raceId: string) => void;
  isUnlocked: (raceId: string) => boolean;
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const SeasonStrip: React.FC<SeasonStripProps> = ({ now, onEnterRace, isUnlocked }) => {
  const month = new Date(now).getMonth();
  const inSeason: Race[] = RACES.filter((r) => isInSeason(r.season, month));

  return (
    <View style={styles.section} testID="harbour-season">
      <Text style={styles.kicker}>On the calendar — {MONTH_LABELS[month]}</Text>
      {inSeason.length === 0 ? (
        <Text style={styles.none}>No classics run this month — the fleet is fitting out.</Text>
      ) : (
        <View style={styles.strip}>
          {inSeason.map((race) => {
            const unlocked = isUnlocked(race.id);
            return (
              <Pressable
                key={race.id}
                onPress={() => {
                  if (unlocked) onEnterRace(race.id);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${race.name}, in season`}
                accessibilityState={{ disabled: !unlocked }}
                testID={`season-chip-${race.id}`}
                style={({ pressed }) => [
                  styles.chip,
                  !unlocked && styles.chipLocked,
                  pressed && unlocked && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipText, !unlocked && styles.chipTextLocked]}>
                  {unlocked ? shortRaceName(race) : `${shortRaceName(race)} 🔒`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
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
  none: {
    color: colors.mist,
    fontSize: fontSize.sm,
  },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.hull,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.steel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  chipPressed: {
    opacity: 0.8,
  },
  chipLocked: {
    opacity: 0.5,
  },
  chipText: {
    color: colors.foam,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  chipTextLocked: {
    color: colors.mist,
  },
});

export default SeasonStrip;
