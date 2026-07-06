import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

// The app-wide "nothing here" panel: an empty locker, an unposted leaderboard,
// a leg of the funnel with no result to show. One quiet template — title
// always, one line of body only when it earns its place, an action only when
// there is a real next step (which is also how the error+retry state renders:
// same panel, a retry action). `fill` centres it on a bare route instead of
// sitting as a card in a list.

interface EmptyStateProps {
  title: string;
  body?: string;
  action?: React.ReactNode;
  fill?: boolean;
  testID?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, body, action, fill, testID }) => (
  <View style={[styles.panel, fill && styles.fill]} testID={testID}>
    <Text style={styles.title}>{title}</Text>
    {body ? <Text style={styles.body}>{body}</Text> : null}
    {action ? <View style={styles.action}>{action}</View> : null}
  </View>
);

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.xl,
    alignItems: 'center',
  },
  fill: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.abyss,
    borderWidth: 0,
    borderRadius: 0,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  body: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
});

export default EmptyState;
