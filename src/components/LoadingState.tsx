import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, spacing } from '../theme';

// The app-wide "hold on" screen: the auth splash, the briefing's benchmark
// run, a leaderboard fetch. A brass spinner and, when a line helps, what the
// crew is waiting for.

interface LoadingStateProps {
  title?: string;
  testID?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({ title, testID }) => (
  <View style={styles.fill} testID={testID}>
    <ActivityIndicator color={colors.brassLight} />
    {title ? <Text style={styles.title}>{title}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.abyss,
  },
  title: {
    color: colors.mist,
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
});

export default LoadingState;
