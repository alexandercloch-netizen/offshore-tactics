import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing, status, surface } from '../theme';

// The app-wide segmented control: one exclusive choice, laid flat. Matches the
// racing ControlDock's dial language (navy trough, hull-filled active segment,
// brass label) so the briefing plan, the boat builder and the profile toggle
// read as the same instrument — but with the app-standard 44pt tap target,
// which is why the height-budgeted cockpit keeps its own tighter copy.

export interface SegmentedOption<T> {
  value: T;
  label: string;
  // Optional per-segment testID (the control-level testID names the whole row).
  testID?: string;
}

interface SegmentedProps<T> {
  value: T;
  options: SegmentedOption<T>[];
  onSelect: (value: T) => void;
  // Segments share the row by default; off, each hugs its label (a compact
  // toggle sitting beside other content, e.g. the currency switch).
  stretch?: boolean;
  testID?: string;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onSelect,
  stretch = true,
  testID,
}: SegmentedProps<T>): React.ReactElement {
  return (
    <View style={[styles.track, !stretch && styles.trackHug]} testID={testID}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onSelect(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            testID={opt.testID}
            style={[styles.segment, stretch && styles.segmentStretch, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: surface.panel,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: surface.hairline,
    overflow: 'hidden',
  },
  trackHug: {
    alignSelf: 'flex-start',
  },
  segment: {
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentStretch: {
    flex: 1,
  },
  segmentActive: {
    backgroundColor: colors.hull,
  },
  label: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  labelActive: {
    color: status.selected,
    fontWeight: fontWeight.bold,
  },
});

export default Segmented;
