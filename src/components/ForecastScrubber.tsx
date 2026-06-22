import React, { useEffect, useRef, useState } from 'react';
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

interface ForecastScrubberProps {
  hour: number; // current forecast offset, in hours from the start
  maxHour: number;
  onChange: (hour: number) => void;
}

// A PredictWind-style forecast timeline: press Play to animate the wind field
// forward through the forecast, or tap the track to jump to an hour. Lets the
// player read how the breeze develops before committing to a plan.
export const ForecastScrubber: React.FC<ForecastScrubberProps> = ({ hour, maxHour, onChange }) => {
  const [playing, setPlaying] = useState(false);
  const [trackW, setTrackW] = useState(0);
  const hourRef = useRef(hour);
  hourRef.current = hour;

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      const next = hourRef.current + 1 > maxHour ? 0 : hourRef.current + 1;
      onChange(next);
    }, 450);
    return () => clearInterval(id);
  }, [playing, maxHour, onChange]);

  const onTrackLayout = (e: LayoutChangeEvent) => setTrackW(e.nativeEvent.layout.width);
  const onTrackPress = (e: GestureResponderEvent) => {
    if (trackW <= 0) return;
    const x = e.nativeEvent.locationX;
    const h = Math.round((x / trackW) * maxHour);
    onChange(Math.max(0, Math.min(maxHour, h)));
  };

  const pct = maxHour > 0 ? (hour / maxHour) * 100 : 0;
  const label = hour === 0 ? 'At the start' : `+${hour}h`;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => setPlaying((p) => !p)}
        style={({ pressed }) => [styles.playBtn, { opacity: pressed ? 0.8 : 1 }]}
        accessibilityLabel={playing ? 'Pause forecast' : 'Play forecast'}
      >
        <Text style={styles.playIcon}>{playing ? '❚❚' : '▶'}</Text>
      </Pressable>

      <Pressable style={styles.track} onLayout={onTrackLayout} onPress={onTrackPress}>
        <View style={styles.trackBase} />
        <View style={[styles.trackFill, { width: `${pct}%` }]} />
        <View style={[styles.knob, { left: `${pct}%` }]} />
      </Pressable>

      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIcon: {
    color: colors.abyss,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  track: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  trackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.hull,
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.brassLight,
  },
  knob: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: radius.pill,
    marginLeft: -7,
    backgroundColor: colors.foam,
    borderWidth: 2,
    borderColor: colors.brass,
  },
  label: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    minWidth: 64,
    textAlign: 'right',
  },
});

export default ForecastScrubber;
