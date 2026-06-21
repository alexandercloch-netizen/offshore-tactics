import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface NauticalButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  subtitle?: string;
  style?: ViewStyle;
}

const VARIANT_STYLES: Record<
  ButtonVariant,
  { bg: string; border: string; text: string }
> = {
  primary: { bg: colors.brass, border: colors.brassLight, text: colors.abyss },
  secondary: { bg: colors.hull, border: colors.steel, text: colors.foam },
  danger: { bg: colors.signalRed, border: '#F05163', text: colors.white },
  ghost: { bg: 'transparent', border: colors.steel, text: colors.mist },
};

export const NauticalButton: React.FC<NauticalButtonProps> = ({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  subtitle,
  style,
}) => {
  const palette = VARIANT_STYLES[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <View>
          <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: palette.text }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    marginTop: 2,
    opacity: 0.85,
  },
});

export default NauticalButton;
