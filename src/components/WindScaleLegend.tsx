import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../theme';
import { tideHeatColor, windHeatColor } from './windScale';
import type { FlowLayer } from './flowField';

// A compact key for the chart's colour field: a colour bar with a few marks, so
// the colours are readable at a glance. Switches scale with the active layer —
// wind speed (to ~40 kn), gusts (the same honest kn ramp, labelled so), tidal
// stream rate (to ~4 kn), or the forecast-spread envelope (a few kn wide).
const WIND = { ticks: [5, 10, 15, 20, 25, 30, 40], max: 45, color: windHeatColor, unit: 'kts', caption: undefined as string | undefined };
const GUST = { ...WIND, caption: 'Gusts' };
const TIDE = { ticks: [0.5, 1, 1.5, 2, 2.5, 3], max: 4, color: tideHeatColor, unit: 'kn', caption: undefined };
// The spread reads on the same absolute kn→colour ramp the map paints it with,
// zoomed to its own small range so the ticks are legible.
const SPREAD = { ticks: [2, 4, 6, 8, 10], max: 12, color: windHeatColor, unit: '± kn', caption: 'Forecast spread' };

interface WindScaleLegendProps {
  layer?: FlowLayer;
}

export const WindScaleLegend: React.FC<WindScaleLegendProps> = ({ layer = 'wind' }) => {
  const scale =
    layer === 'tide' ? TIDE : layer === 'gust' ? GUST : layer === 'spread' ? SPREAD : WIND;
  const swatches = Array.from({ length: 24 }, (_, i) => {
    const v = (i / 23) * scale.max;
    return <View key={i} style={[styles.swatch, { backgroundColor: scale.color(v) }]} />;
  });

  return (
    <View style={styles.wrap}>
      {scale.caption ? <Text style={styles.caption}>{scale.caption}</Text> : null}
      <View style={styles.bar}>{swatches}</View>
      <View style={styles.ticks}>
        {scale.ticks.map((t) => (
          <Text key={t} style={[styles.tick, { left: `${(t / scale.max) * 100}%` }]}>
            {t}
          </Text>
        ))}
        <Text style={styles.unit}>{scale.unit}</Text>
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
  caption: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  unit: {
    position: 'absolute',
    right: 0,
    color: colors.slate,
    fontSize: fontSize.xs,
  },
});

export default WindScaleLegend;
