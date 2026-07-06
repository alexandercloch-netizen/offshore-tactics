import React from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import { radius, spacing, status, surface } from '../theme';

// The app-wide pick-one-of-these card: boats on the dock, sailors on the quay,
// onboarding answers, builder classes. One border language everywhere —
// `cardBorder` (the brass-tinted accent) for content cards, `hull` only for
// hairline rules — and selection announced through the border, the a11y state
// and the caller's own "Selected/Signed" tag, never a layout-jumping border
// width.

interface SelectableCardProps {
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  // Dim the whole card (unaffordable boat, full crew) without disabling the
  // press feedback contract.
  dimmed?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  style?: ViewStyle | ViewStyle[];
  children: React.ReactNode;
}

export const SelectableCard: React.FC<SelectableCardProps> = ({
  onPress,
  selected = false,
  disabled = false,
  dimmed = false,
  accessibilityLabel,
  testID,
  style,
  children,
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ selected, disabled }}
    accessibilityLabel={accessibilityLabel}
    testID={testID}
    style={({ pressed }) => [
      styles.card,
      selected && styles.cardSelected,
      { opacity: dimmed ? 0.5 : pressed ? 0.92 : 1 },
      style,
    ]}
  >
    {children}
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.accentBorder,
    padding: spacing.lg,
    minHeight: 44,
  },
  cardSelected: {
    borderColor: status.selected,
    backgroundColor: surface.panel,
  },
});

export default SelectableCard;
