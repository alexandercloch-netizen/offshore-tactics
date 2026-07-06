import React from 'react';

// react-native-safe-area-context stand-in: zero insets, passthrough provider.
export interface EdgeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function useSafeAreaInsets(): EdgeInsets {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

export const SafeAreaProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export const SafeAreaView: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  React.createElement('SafeAreaView', null, children);
