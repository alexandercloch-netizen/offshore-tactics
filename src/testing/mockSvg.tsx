/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

// react-native-svg stand-in: every element renders as a string-typed host node
// so the chart's structure is walkable in render tests.
type AnyProps = Record<string, any> & { children?: React.ReactNode };

function host(name: string): React.FC<AnyProps> {
  const C: React.FC<AnyProps> = ({ children, ...props }) =>
    React.createElement(name, props, children as React.ReactNode);
  C.displayName = name;
  return C;
}

const Svg = host('Svg');
export default Svg;
export const Circle = host('Circle');
export const ClipPath = host('ClipPath');
export const Defs = host('Defs');
export const G = host('G');
export const Line = host('Line');
export const LinearGradient = host('LinearGradient');
export const Path = host('Path');
export const Polygon = host('Polygon');
export const Polyline = host('Polyline');
export const Rect = host('Rect');
export const Stop = host('Stop');
export const Text = host('SvgText');
