import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import type { FlowLayer } from './flowField';

// The PredictWind-style layer switch that sits over the chart: flip the colour
// field + flow animation between the breeze and the tidal stream. Only mounted
// when the course actually has a running tide, so it's never a dead control.
interface MapLayerToggleProps {
  layer: FlowLayer;
  onChange: (layer: FlowLayer) => void;
}

const OPTIONS: { key: FlowLayer; label: string }[] = [
  { key: 'wind', label: 'Wind' },
  { key: 'tide', label: 'Tide' },
];

export const MapLayerToggle: React.FC<MapLayerToggleProps> = ({ layer, onChange }) => (
  <View style={styles.wrap}>
    {OPTIONS.map((opt) => {
      const active = opt.key === layer;
      return (
        <Pressable
          key={opt.key}
          onPress={() => onChange(opt.key)}
          style={[styles.seg, active && styles.segActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`Show ${opt.label}`}
        >
          <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
        </Pressable>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.overlay,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 2,
  },
  seg: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  segActive: {
    backgroundColor: colors.brass,
  },
  label: {
    color: colors.mist,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  labelActive: {
    color: colors.abyss,
  },
});

export default MapLayerToggle;
