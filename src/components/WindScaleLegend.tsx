import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../theme';
import { windHeatColor } from './windScale';

// A compact key for the wind-speed heatmap: a colour bar with a few knot marks,
// so the chart's colours are readable at a glance.
const TICKS = [5, 10, 15, 20, 25, 30, 40];
const BAR_MAX = 45; // kn spanned by the bar

export const WindScaleLegend: React.FC = () => {
  const swatches = Array.from({ length: 24 }, (_, i) => {
    const kn = (i / 23) * BAR_MAX;
    return <View key={i} style={[styles.swatch, { backgroundColor: windHeatColor(kn) }]} />;
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>{swatches}</View>
      <View style={styles.ticks}>
        {TICKS.map((t) => (
          <Text key={t} style={[styles.tick, { left: `${(t / BAR_MAX) * 100}%` }]}>
            {t}
          </Text>
        ))}
        <Text style={styles.unit}>kts</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
  },
  bar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  swatch: {
    flex: 1,
    height: '100%',
  },
  ticks: {
    height: 14,
    marginTop: 2,
  },
  tick: {
    position: 'absolute',
    color: colors.slate,
    fontSize: fontSize.xs,
    marginLeft: -5,
  },
  unit: {
    position: 'absolute',
    right: 0,
    color: colors.slate,
    fontSize: fontSize.xs,
  },
});

export default WindScaleLegend;
