import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

// The pre-commit funnel's whereabouts: four 4px dots under a hairline — race,
// boat, crew, provisions. Deliberately not a labelled banner; the screen
// titles already name the step, the pips only say how far along the dock walk
// is (and that walking BACK is safe — nothing before the briefing is
// committed). The briefing itself is past the point of commitment, so it
// carries no pip row.

export type FunnelStage = 'race' | 'boat' | 'crew' | 'provisions';

const STAGES: FunnelStage[] = ['race', 'boat', 'crew', 'provisions'];
const STAGE_NAME: Record<FunnelStage, string> = {
  race: 'choose the race',
  boat: 'choose your boat',
  crew: 'sign your crew',
  provisions: 'provision the boat',
};

export const FunnelSteps: React.FC<{ stage: FunnelStage }> = ({ stage }) => {
  const index = STAGES.indexOf(stage);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`Step ${index + 1} of ${STAGES.length}: ${STAGE_NAME[stage]}`}
      testID="funnel-steps"
    >
      {STAGES.map((s, i) => (
        <View key={s} style={[styles.pip, i <= index && styles.pipDone, i === index && styles.pipCurrent]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
  pip: {
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.hull,
  },
  pipDone: {
    backgroundColor: colors.brass,
  },
  pipCurrent: {
    backgroundColor: colors.brassLight,
    // The live pip stretches to a short dash so "where am I" reads without
    // colour vision.
    width: 16,
  },
});

export default FunnelSteps;
