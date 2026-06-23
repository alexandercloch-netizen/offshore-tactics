import React from 'react';
import { GestureResponderEvent, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, fontSize, fontWeight } from '../theme';
import { windHeatColor } from './windScale';

export interface ForecastPoint {
  hour: number;
  speedKn: number;
  fromDeg: number;
  confidence: number; // 0–1, fades the trace as it grows uncertain
}

interface ForecastGraphProps {
  series: ForecastPoint[];
  hour: number; // the scrubbed hour, drawn as a cursor
  maxHour: number;
  width: number;
  onScrub?: (hour: number) => void;
}

const HEIGHT = 132;
const PAD_L = 28;
const PAD_R = 10;
const PAD_T = 20; // room for the direction arrows along the top
const PAD_B = 18; // room for the hour axis

// A meteogram for the course: wind strength over the forecast window, with the
// breeze direction along the top and a cursor tied to the timeline. The trace
// fades as the forecast grows less certain (see the Navigator's confidence).
export const ForecastGraph: React.FC<ForecastGraphProps> = ({ series, hour, maxHour, width, onScrub }) => {
  const [w, setW] = React.useState(width);
  const plotW = Math.max(1, w - PAD_L - PAD_R);
  const plotH = HEIGHT - PAD_T - PAD_B;
  const yMax = Math.max(20, Math.ceil(Math.max(...series.map((p) => p.speedKn), 0) / 5) * 5);

  const x = (h: number) => PAD_L + (maxHour > 0 ? h / maxHour : 0) * plotW;
  const y = (s: number) => PAD_T + plotH - (s / yMax) * plotH;

  const line = series
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.hour).toFixed(1)} ${y(p.speedKn).toFixed(1)}`)
    .join(' ');
  const area =
    series.length > 1
      ? `${line} L ${x(series[series.length - 1].hour).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} ` +
        `L ${x(series[0].hour).toFixed(1)} ${(PAD_T + plotH).toFixed(1)} Z`
      : '';

  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);
  const onPress = (e: GestureResponderEvent) => {
    if (!onScrub) return;
    const px = e.nativeEvent.locationX - PAD_L;
    onScrub(Math.max(0, Math.min(maxHour, Math.round((px / plotW) * maxHour))));
  };

  // Direction arrows along the top: thinned so they don't crowd.
  const arrowEvery = Math.max(1, Math.round(series.length / 9));

  return (
    <Pressable onLayout={onLayout} onPress={onPress}>
      <Svg width={w} height={HEIGHT}>
        {/* Y gridlines + labels at 0 and yMax (flat children — react-native-svg
            on web does not handle Fragment children inside <Svg>). */}
        {[0, yMax].map((s) => (
          <Line key={`g${s}`} x1={PAD_L} y1={y(s)} x2={w - PAD_R} y2={y(s)} stroke={colors.hull} strokeWidth={1} />
        ))}
        {[0, yMax].map((s) => (
          <SvgText key={`gl${s}`} x={PAD_L - 5} y={y(s) + 3} fill={colors.slate} fontSize="9" textAnchor="end">
            {s}
          </SvgText>
        ))}

        {/* Strength trace. */}
        {area ? <Path d={area} fill={colors.brass} opacity={0.1} /> : null}
        {series.length > 1 ? <Path d={line} stroke={colors.steel} strokeWidth={1.5} fill="none" /> : null}

        {/* Per-sample dots, coloured by strength and faded by confidence. */}
        {series.map((p) => (
          <Circle
            key={`d${p.hour}`}
            cx={x(p.hour)}
            cy={y(p.speedKn)}
            r={2.6}
            fill={windHeatColor(p.speedKn)}
            opacity={0.4 + 0.6 * p.confidence}
          />
        ))}

        {/* Wind direction arrows along the top (pointing the way it blows TO). */}
        {series
          .filter((_, i) => i % arrowEvery === 0)
          .map((p) => {
            const toDeg = p.fromDeg + 180;
            const a = (toDeg * Math.PI) / 180;
            const cx = x(p.hour);
            const cy = 9;
            const dx = Math.sin(a) * 4;
            const dy = -Math.cos(a) * 4;
            return (
              <Line
                key={`a${p.hour}`}
                x1={cx - dx}
                y1={cy - dy}
                x2={cx + dx}
                y2={cy + dy}
                stroke={colors.mist}
                strokeWidth={1.3}
                strokeLinecap="round"
                opacity={0.35 + 0.65 * p.confidence}
              />
            );
          })}

        {/* Cursor at the scrubbed hour. */}
        <Line x1={x(hour)} y1={PAD_T - 6} x2={x(hour)} y2={PAD_T + plotH} stroke={colors.brassLight} strokeWidth={1.5} strokeDasharray="3 3" />

        {/* Hour axis: now and the end of the window. */}
        <SvgText x={PAD_L} y={HEIGHT - 5} fill={colors.slate} fontSize="9" textAnchor="start">
          now
        </SvgText>
        <SvgText x={w - PAD_R} y={HEIGHT - 5} fill={colors.slate} fontSize="9" textAnchor="end">
          +{maxHour}h
        </SvgText>
      </Svg>
    </Pressable>
  );
};

interface LegendProps {
  point?: ForecastPoint;
}

// A small readout of the wind at the cursor, paired with the graph.
export const ForecastGraphReadout: React.FC<LegendProps> = ({ point }) => {
  if (!point) return null;
  return (
    <View style={styles.readout}>
      <Text style={styles.readoutMain}>
        {Math.round(point.speedKn)} kn · {compass(point.fromDeg)}
      </Text>
      <Text style={styles.readoutSub}>
        {point.hour === 0 ? 'at the start' : `+${point.hour}h`}
      </Text>
    </View>
  );
};

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg: number): string => COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  readoutMain: { color: colors.foam, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  readoutSub: { color: colors.slate, fontSize: fontSize.xs },
});

export default ForecastGraph;
