import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing, surface } from '../theme';
import { ConfirmRequest, registerConfirmPresenter } from '../lib/confirm';
import { durations } from '../lib/motion';
import { useReducedMotion } from '../lib/useReducedMotion';
import NauticalButton from './NauticalButton';

// The themed destructive confirm, mounted once at the app root. On web every
// confirmAction routes here instead of the browser's window.confirm — the one
// sanctioned modal in the app, earned by being rare, blocking and destructive
// (it never fires mid-race except through Retire). Native keeps Alert.alert,
// so this host simply stays idle there. Tapping the dimmed backdrop declines:
// backing out of a destructive act must always be the easy path.

const ConfirmHost: React.FC = () => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const reducedMotion = useReducedMotion();
  const entry = useRef(new Animated.Value(0)).current;

  // Keep the live request reachable from the stable presenter closure, so a
  // second request arriving over an open sheet can decline the first instead
  // of silently dropping its callbacks.
  const requestRef = useRef<ConfirmRequest | null>(null);
  requestRef.current = request;

  useEffect(
    () =>
      registerConfirmPresenter((next) => {
        requestRef.current?.onCancel?.();
        setRequest(next);
      }),
    []
  );

  useEffect(() => {
    if (!request) return;
    entry.setValue(0);
    Animated.timing(entry, {
      toValue: 1,
      duration: durations(reducedMotion).enter,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [request, entry, reducedMotion]);

  if (!request) return null;

  const resolve = (accepted: boolean): void => {
    setRequest(null);
    if (accepted) request.onConfirm();
    else request.onCancel?.();
  };

  const translateY = entry.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <View style={styles.overlay} testID="confirm-overlay">
      <Pressable
        style={styles.backdrop}
        onPress={() => resolve(false)}
        accessibilityRole="button"
        accessibilityLabel={request.cancelLabel}
      />
      <Animated.View
        style={[styles.sheet, { opacity: entry, transform: [{ translateY }] }]}
        testID="confirm-sheet"
      >
        <Text style={styles.title}>{request.title}</Text>
        <Text style={styles.message}>{request.message}</Text>
        <View style={styles.actions}>
          <NauticalButton
            label={request.cancelLabel}
            variant="secondary"
            onPress={() => resolve(false)}
            testID="confirm-cancel"
          />
          <NauticalButton
            label={request.confirmLabel}
            variant={request.destructive ? 'danger' : 'primary'}
            onPress={() => resolve(true)}
            testID="confirm-accept"
          />
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: surface.panel,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.accentBorder,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    // Keep the sheet a readable column on wide screens rather than a full-width
    // banner.
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  message: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  actions: {
    gap: spacing.sm,
  },
});

export default ConfirmHost;
