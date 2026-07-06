/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

// A minimal react-native stand-in for node-environment render tests. Runtime
// only — TypeScript still checks components against the REAL react-native
// types (moduleNameMapper swaps modules at jest runtime, not compile time).
// Host components render as string-typed elements so tests can walk the tree
// by type ('ScrollView', 'Modal', …).

type AnyProps = Record<string, any> & { children?: React.ReactNode };

function host(name: string): React.FC<AnyProps> {
  const C: React.FC<AnyProps> = ({ children, ...props }) =>
    React.createElement(name, props, children as React.ReactNode);
  C.displayName = name;
  return C;
}

export const View = host('View');
export const Text = host('Text');
export const ScrollView = host('ScrollView');
export const ActivityIndicator = host('ActivityIndicator');
export const TextInput = host('TextInput');
export const TouchableOpacity = host('TouchableOpacity');

// Pressable: resolve the RN function-style and function-children forms so the
// rendered tree carries plain values.
export const Pressable: React.FC<AnyProps> = ({ children, style, ...props }) => {
  const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
  const kids = typeof children === 'function' ? (children as any)({ pressed: false }) : children;
  return React.createElement('Pressable', { ...props, style: resolved }, kids as React.ReactNode);
};

// Modal renders a 'Modal' host node only when visible — so "no Modal during
// racing" can be asserted as findAllByType('Modal').length === 0.
export const Modal: React.FC<AnyProps & { visible?: boolean }> = ({ visible = true, children, ...props }) =>
  visible ? React.createElement('Modal', props, children as React.ReactNode) : null;

export const StyleSheet = {
  create: <T,>(styles: T): T => styles,
  flatten: (style: any): any => {
    if (Array.isArray(style)) {
      return style.reduce((acc, s) => ({ ...acc, ...StyleSheet.flatten(s) }), {});
    }
    return style ?? {};
  },
  hairlineWidth: 1,
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
};

// Animated: values hold numbers, animations complete synchronously — motion is
// asserted through tokens (lib/motion), not frames.
class AnimatedValue {
  constructor(private v: number) {}
  setValue(v: number): void {
    this.v = v;
  }
  interpolate(): AnimatedValue {
    return this;
  }
}
const animation = { start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }), stop: () => undefined };
export const Animated = {
  Value: AnimatedValue,
  View: host('AnimatedView'),
  Text: host('AnimatedText'),
  ScrollView: host('AnimatedScrollView'),
  timing: () => ({ ...animation }),
  spring: () => ({ ...animation }),
  sequence: () => ({ ...animation }),
  parallel: () => ({ ...animation }),
  delay: () => ({ ...animation }),
  loop: () => ({ start: () => undefined, stop: () => undefined }),
};

export const Easing = {
  linear: (t: number) => t,
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  out: (f: (t: number) => number) => f,
  in: (f: (t: number) => number) => f,
  inOut: (f: (t: number) => number) => f,
};

export const Platform = {
  OS: 'web' as const,
  select: <T,>(options: { web?: T; default?: T; ios?: T; android?: T }): T | undefined =>
    options.web ?? options.default,
};

export const AccessibilityInfo = {
  isReduceMotionEnabled: (): Promise<boolean> => Promise.resolve(false),
  addEventListener: (): { remove: () => void } => ({ remove: () => undefined }),
};

export const AppState = {
  currentState: 'active',
  addEventListener: (): { remove: () => void } => ({ remove: () => undefined }),
};

let dims = { width: 375, height: 667, scale: 2, fontScale: 1 };
// Tests set the viewport under test through this (same module instance as the
// mapped 'react-native').
export function setMockWindowDimensions(width: number, height: number): void {
  dims = { ...dims, width, height };
}
export function useWindowDimensions(): typeof dims {
  return dims;
}
export const Dimensions = {
  get: (): typeof dims => dims,
  addEventListener: (): { remove: () => void } => ({ remove: () => undefined }),
};

export const Alert = { alert: (): void => undefined };
export const Linking = { openURL: (): Promise<void> => Promise.resolve() };
