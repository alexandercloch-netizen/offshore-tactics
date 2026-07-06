import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, numeric, spacing, status } from '../../theme';
import { MOTION } from '../../lib/motion';
import { CellSpec } from './cells';

// One instrument. Tabular lining numerals, right-aligned into a reserved width
// so a changing value never reflows its neighbours; the uppercase micro-label
// sits under the number in the contrast-lifted panel-label tint.
const InstrumentCell: React.FC<{ cell: CellSpec; reducedMotion?: boolean }> = ({
  cell,
  reducedMotion,
}) => {
  // The ⇄N badge pops once when the count changes — the cockpit acknowledging
  // a committed change. Reduced motion snaps.
  const pop = useRef(new Animated.Value(1)).current;
  const prevBadge = useRef(cell.badge);
  useEffect(() => {
    if (cell.badge === prevBadge.current) return;
    prevBadge.current = cell.badge;
    if (reducedMotion) return;
    pop.setValue(1.45);
    Animated.timing(pop, {
      toValue: 1,
      duration: MOTION.counterPop,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [cell.badge, pop, reducedMotion]);

  return (
    <View style={styles.cell} testID="instrument-cell" accessibilityLabel={cell.a11y}>
      <View style={styles.valueRow}>
        <Text
          style={[styles.value, { minWidth: cell.minWidth }, cell.tint ? { color: cell.tint } : null]}
          numberOfLines={1}
        >
          {cell.value}
        </Text>
        {cell.badge ? (
          <Animated.Text
            style={[styles.badge, { transform: [{ scale: pop }] }]}
            testID="sail-change-count"
          >
            {cell.badge}
          </Animated.Text>
        ) : null}
      </View>
      <Text style={styles.label}>{cell.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  cell: {
    alignItems: 'flex-start',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  value: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    textAlign: 'right',
    ...numeric,
  },
  badge: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    ...numeric,
  },
  label: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});

export default InstrumentCell;
