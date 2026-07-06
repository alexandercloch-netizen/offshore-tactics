import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, numeric, spacing } from '../../theme';

// The fixed ~44px read-only header: race (dim, truncated) · elapsed · the
// corrected standing with the live gap to the nearest rival — the honest
// handicap-racing readout, computed by the screen on the calm standings beat.
interface Props {
  raceName: string;
  elapsed: string; // formatDuration(elapsedHours)
  standing?: string; // e.g. "3rd · +0:42 to Wild Rose"
}

export const RIBBON_HEIGHT = 44;

const StatusRibbon: React.FC<Props> = ({ raceName, elapsed, standing }) => (
  <View style={styles.ribbon} testID="status-ribbon">
    <Text style={styles.race} numberOfLines={1}>
      {raceName}
    </Text>
    <Text style={styles.elapsed} testID="ribbon-elapsed">
      {elapsed}
    </Text>
    {standing ? (
      <Text style={styles.standing} numberOfLines={1} testID="ribbon-standing">
        {standing}
      </Text>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  ribbon: {
    height: RIBBON_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.deepSea,
    borderBottomWidth: 1,
    borderBottomColor: colors.hull,
  },
  race: {
    flex: 1,
    color: colors.slate,
    fontSize: fontSize.sm,
  },
  elapsed: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    ...numeric,
  },
  standing: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    maxWidth: 180,
    ...numeric,
  },
});

export default StatusRibbon;
