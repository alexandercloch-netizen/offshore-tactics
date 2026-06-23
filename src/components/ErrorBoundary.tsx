import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  label?: string; // what failed, for the fallback line
}

interface State {
  failed: boolean;
}

// Contains a render failure to one panel rather than blanking the whole screen.
// A misbehaving optional widget (e.g. a chart) must never take down the briefing
// and strand the player with no "Start Racing" button.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Surface it in dev tools without crashing the tree.
    console.warn('Panel failed to render:', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.text}>{this.props.label ?? 'This panel could not be shown.'}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
  },
  text: { color: colors.slate, fontSize: fontSize.sm },
});

export default ErrorBoundary;
