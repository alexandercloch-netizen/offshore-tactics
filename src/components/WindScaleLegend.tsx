import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../theme';
import { tideHeatColor, windHeatColor } from './windScale';
import type { FlowLayer } from './flowField';

// A compact key for the chart's colour field: a colour bar with a few marks, so
// the colours are readable at a glance. Switches scale with the active layer —
// wind speed (to ~40 kn) or tidal stream rate (to ~4 kn).
const WIND = { ticks: [5, 10, 15, 20, 25, 30, 40], max: 45, color: windHeatColor };
const TIDE = { ticks: [0.5, 1, 1.5, 2, 2.5, 3], max: 4, color: tideHeatColor };

interface WindScaleLegendProps {
  layer?: FlowLayer;
}

export const WindScaleLegend: React.FC<WindScaleLegendProps> = ({ layer = 'wind' }) => {
  const scale = layer === 'tide' ? TIDE : WIND;
  const swatches = Array.from({ length: 24 }, (_, i) => {
    const v = (i / 23) * scale.max;
    return <View key={i} style={[styles.swatch, { backgroundColor: scale.color(v) }]} />;
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>{swatches}</View>
      <View style={styles.ticks}>
        {scale.ticks.map((t) => (
          <Text key={t} style={[styles.tick, { left: `${(t / scale.max) * 100}%` }]}>
            {t}
          </Text>
        ))}
        <Text style={styles.unit}>{layer === 'tide' ? 'kn' : 'kts'}</Text>
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
