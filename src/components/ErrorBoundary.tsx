import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  label?: string; // what failed, for the fallback line
  // Change this value to clear a caught error and re-attempt the render — e.g. the
  // active route key, so navigating away from a screen that threw recovers instead
  // of latching the fallback forever.
  resetKey?: string | number;
}

interface State {
  failed: boolean;
  resetKey?: string | number;
}

// Contains a render failure to one panel rather than blanking the whole screen.
// A misbehaving optional widget (e.g. a chart) must never take down the briefing
// and strand the player with no "Start Racing" button. When `resetKey` changes it
// drops the failed state and tries rendering its children again, so the boundary
// can recover rather than staying broken for the rest of the session.
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.resetKey) {
      return { failed: false, resetKey: props.resetKey };
    }
    return null;
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
