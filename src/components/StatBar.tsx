import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

interface StatBarProps {
  label: string;
  value: number; // 0-100
  max?: number;
  color?: string;
  showValue?: boolean;
  unit?: string;
}

function colorForValue(value: number): string {
  if (value >= 66) return colors.signalGreen;
  if (value >= 33) return colors.warning;
  return colors.signalRed;
}

export const StatBar: React.FC<StatBarProps> = ({
  label,
  value,
  max = 100,
  color,
  showValue = true,
  unit = '%',
}) => {
  const pct = Math.max(0, Math.min(1, value / max));
  const barColor = color ?? colorForValue(pct * 100);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        {showValue ? (
          <Text style={styles.value}>
            {Math.round(value)}
            {unit}
          </Text>
        ) : null}
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct * 100}%`, backgroundColor: barColor },
          ]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  track: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.abyss,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.hull,
  },
  fill: {
    height: '100%',
    borderRadius: radius.pill,
  },
});

export default StatBar;
