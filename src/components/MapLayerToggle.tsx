import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import type { FlowLayer } from './flowField';

// The PredictWind-style layer switch that sits over the chart: flip the colour
// field + flow animation between the layers the screen offers (Wind · Gust,
// plus Tide where the course runs a stream, plus Forecast spread on the
// briefing). The screen passes only the layers that are live here, so a
// segment is never a dead control.
export interface MapLayerOption {
  key: FlowLayer;
  label: string;
}

interface MapLayerToggleProps {
  layer: FlowLayer;
  options: MapLayerOption[];
  onChange: (layer: FlowLayer) => void;
}

export const MapLayerToggle: React.FC<MapLayerToggleProps> = ({ layer, options, onChange }) => (
  <View style={styles.wrap}>
    {options.map((opt) => {
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
