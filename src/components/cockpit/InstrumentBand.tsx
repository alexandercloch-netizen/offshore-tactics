import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme';
import { CellSpec } from './cells';
import InstrumentCell from './InstrumentCell';

// The single non-wrapping instrument line: exactly six cells, identical slots
// idle and docked. The SAIL cell is the one tappable instrument — it opens the
// sail picker (the same lane a decision docks into).
interface Props {
  cells: CellSpec[];
  onSailPress?: () => void;
  reducedMotion?: boolean;
}

const InstrumentBand: React.FC<Props> = ({ cells, onSailPress, reducedMotion }) => (
  <View style={styles.band} testID="instrument-band">
    {cells.map((cell) =>
      cell.id === 'sail' ? (
        <Pressable
          key={cell.id}
          onPress={onSailPress}
          testID="sail-cell"
          accessibilityRole="button"
          accessibilityLabel={cell.a11y}
          style={({ pressed }) => [styles.sailPress, pressed && styles.sailPressed]}
        >
          <InstrumentCell cell={cell} reducedMotion={reducedMotion} />
        </Pressable>
      ) : (
        <InstrumentCell key={cell.id} cell={cell} reducedMotion={reducedMotion} />
      )
    )}
  </View>
);

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.navy,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  // The tap target earns its 44pt without inflating the band's visual height.
  sailPress: {
    minHeight: 44,
    justifyContent: 'center',
    marginVertical: -spacing.sm,
    paddingVertical: spacing.sm,
  },
  sailPressed: {
    opacity: 0.7,
  },
});

export default InstrumentBand;
