import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, numeric, radius, spacing, status } from '../../theme';
import { BoatCondition } from '../../types';
import StatBar from '../StatBar';
import NauticalButton from '../NauticalButton';

// The "⋯" sheet: everything demoted off the primary band, over the dock only —
// the chart above stays untouched. Boat & Crew condition, the ship's log, the
// secondary numbers (each living ONLY here — one home per number), Pause and
// Retire. Not a Modal: an absolutely-positioned layer inside the cockpit's
// bottom region.

export interface SecondaryMetric {
  label: string;
  value: string;
  testID?: string;
}

interface OverflowSheetProps {
  condition: BoatCondition;
  metrics: SecondaryMetric[];
  log: string[]; // newest first
  paused: boolean;
  onPause: () => void;
  onRetire: () => void;
  onClose: () => void;
  maxHeight: number;
}

const OverflowSheet: React.FC<OverflowSheetProps> = ({
  condition,
  metrics,
  log,
  paused,
  onPause,
  onRetire,
  onClose,
  maxHeight,
}) => (
  <View style={[styles.sheet, { maxHeight }]} testID="overflow-sheet">
    <View style={styles.header}>
      <Text style={styles.title}>Nav Station</Text>
      <Pressable
        onPress={onClose}
        testID="overflow-close"
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.closeButton}
      >
        <Text style={styles.closeLabel}>✕</Text>
      </Pressable>
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.metricsGrid}>
        {metrics.map((m) => (
          <View key={m.label} style={styles.metric} testID={m.testID}>
            <Text style={styles.metricValue}>{m.value}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Boat & Crew</Text>
      <StatBar label="Hull Integrity" value={condition.hullIntegrity} />
      <StatBar label="Crew Stamina" value={condition.crewStamina} />
      <StatBar label="Crew Morale" value={condition.crewMorale} />

      {log.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Ship's Log</Text>
          {log.map((entry, i) => (
            <Text key={`${entry}-${i}`} style={styles.logEntry}>
              • {entry}
            </Text>
          ))}
        </>
      ) : null}

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <NauticalButton
            label={paused ? 'Resume' : 'Pause'}
            variant={paused ? 'primary' : 'secondary'}
            onPress={onPause}
            testID="pause-button"
          />
        </View>
        <View style={{ flex: 1 }}>
          <NauticalButton label="Retire" variant="ghost" onPress={onRetire} testID="retire-button" />
        </View>
      </View>
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.deepSea,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  closeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    color: colors.mist,
    fontSize: fontSize.md,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  metric: {
    minWidth: 88,
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  metricValue: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    ...numeric,
  },
  metricLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: colors.foam,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  logEntry: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});

export default OverflowSheet;
