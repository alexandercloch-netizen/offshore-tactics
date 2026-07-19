import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme';
import { EffortMode, PlayerStrategy, RoutingBias, SailMode } from '../../types';
import NauticalButton from '../NauticalButton';

// The bottom control console — the thumb zone. Everything a racing hand needs
// mid-passage: the effort and routing dials, the sail-change call, the coach
// strip's "?" reopen, and the "⋯" overflow (Boat & Crew, log, secondary
// numbers, Pause, Retire) as a sheet over the dock only — never the chart.

interface SegmentedProps<T> {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
  testID?: string;
}

function Segmented<T extends string | number>({ value, options, onSelect, testID }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented} testID={testID}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface ControlDockProps {
  strategy: PlayerStrategy;
  onStrategy: (partial: Partial<PlayerStrategy>) => void;
  onCallSailChange: () => void;
  onHelp: () => void;
  onOverflow: () => void;
  // The ambient composite health chip: worst of hull/crew/morale drives one
  // amber/red dot on the overflow button; tap opens Boat & Crew in the sheet.
  healthTint?: string;
  // Stack the sail button full-width above the dials (phone portrait) or lay
  // the console out as one row set (rail/sidebar).
  compact: boolean;
}

const ControlDock: React.FC<ControlDockProps> = ({
  strategy,
  onStrategy,
  onCallSailChange,
  onHelp,
  onOverflow,
  healthTint,
  compact,
}) => (
  <View style={[styles.dock, !compact && styles.dockWide]} testID="control-dock">
    <View style={styles.sailRow}>
      <View style={{ flex: 1 }}>
        <NauticalButton
          label="Call Sail Change"
          variant="secondary"
          onPress={onCallSailChange}
          testID="call-sail-change"
        />
      </View>
      <Pressable
        onPress={onHelp}
        testID="help-button"
        accessibilityRole="button"
        accessibilityLabel="How to race"
        style={styles.iconButton}
      >
        <Text style={styles.iconLabel}>?</Text>
      </Pressable>
      <Pressable
        onPress={onOverflow}
        testID="overflow-button"
        accessibilityRole="button"
        accessibilityLabel={`More: boat and crew, ship's log, retire${
          healthTint ? '. Attention: boat or crew condition is low' : ''
        }`}
        style={styles.iconButton}
      >
        <Text style={styles.iconLabel}>⋯</Text>
        {healthTint ? <View style={[styles.healthDot, { backgroundColor: healthTint }]} /> : null}
      </Pressable>
    </View>
    <View style={styles.dialRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.dialLabel}>Effort</Text>
        <Segmented<EffortMode>
          value={strategy.effort}
          options={[
            { value: 'conserve', label: 'Conserve' },
            { value: 'cruise', label: 'Cruise' },
            { value: 'push', label: 'Push' },
          ]}
          onSelect={(effort) => onStrategy({ effort })}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.dialLabel}>Routing</Text>
        <Segmented<RoutingBias>
          value={strategy.bias}
          options={[
            { value: -1, label: 'Left' },
            { value: 0, label: 'Optimal' },
            { value: 1, label: 'Right' },
          ]}
          onSelect={(bias) => onStrategy({ bias })}
        />
      </View>
    </View>
    <View>
      <Text style={styles.dialLabel}>Sail Plan</Text>
      <Segmented<SailMode>
        testID="sail-plan-control"
        value={strategy.sailMode ?? 'manual'}
        options={[
          { value: 'manual', label: 'Manual' },
          { value: 'conservative', label: 'Conserv.' },
          { value: 'balanced', label: 'Balanced' },
          { value: 'aggressive', label: 'Aggress.' },
        ]}
        onSelect={(sailMode) => onStrategy({ sailMode })}
      />
    </View>
  </View>
);

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.deepSea,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  dockWide: {
    borderTopWidth: 0,
  },
  sailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    backgroundColor: colors.navy,
  },
  iconLabel: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  healthDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dialRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  dialLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: {
    backgroundColor: colors.hull,
  },
  segmentLabel: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  segmentLabelActive: {
    color: colors.brassLight,
    fontWeight: fontWeight.bold,
  },
});

export default ControlDock;
