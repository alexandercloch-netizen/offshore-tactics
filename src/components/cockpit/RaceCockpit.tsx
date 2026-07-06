import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme';
import { RIBBON_HEIGHT } from './StatusRibbon';

// The fixed cockpit frame. No screen-level scrolling, ever: one permanently
// mounted chart stage wrapped by the status ribbon, the single instrument
// band, and the bottom control/decision region. The chart takes the slack
// (flex) and SNAPS between its idle and docked heights — its dimensions are
// never animated; only the dock's own transform moves.

// The flex contract's hard floor: the chart never gives up more than this,
// whatever wants the space.
export const CHART_MIN_DOCKED = 260;
export const CHART_MIN_IDLE = 300;

// Approximate fixed heights the dock budget subtracts (the band measures
// itself, but the budget only needs to be conservative, not exact).
const BAND_APPROX = 56;

export interface CockpitLayout {
  rail: boolean; // chart left, controls/dock in a right rail
  chartMin: number;
  dockMaxHeight: number;
  railWidth: number;
}

// The 2-D breakpoint rule. Width alone lies: an 844×390 landscape phone and a
// short desktop window would both stack into less height than the chart floor,
// so height gets a veto — rail whenever the window is wide OR short.
export function cockpitLayout(
  width: number,
  usableHeight: number,
  docked: boolean
): CockpitLayout {
  const rail = width >= 900 || usableHeight < 640;
  const chartMin = docked ? CHART_MIN_DOCKED : CHART_MIN_IDLE;
  // What the dock may take before the chart floor would crack. In rail mode
  // the dock owns the rail's full height instead.
  const dockMaxHeight = rail
    ? usableHeight
    : Math.max(usableHeight - RIBBON_HEIGHT - BAND_APPROX - chartMin, 160);
  const railWidth = Math.max(320, Math.min(Math.min(width * 0.34, 420), 440));
  return { rail, chartMin, dockMaxHeight, railWidth };
}

interface RaceCockpitProps {
  layout: CockpitLayout;
  ribbon: React.ReactNode;
  // The single chart, drawn to the measured stage size. The stage never
  // scrolls and never animates its dimensions.
  chart: (w: number, h: number) => React.ReactNode;
  // Absolutely-positioned chart companions (standings, layer toggle, banner,
  // legend, HELD pill) — rendered inside the stage, over the chart.
  chartOverlays?: React.ReactNode;
  band: React.ReactNode;
  controls: React.ReactNode;
  // The docked lane (decision / sail picker / debrief). When present it
  // REPLACES the controls; the chart snaps to its docked floor.
  dock?: React.ReactNode;
  // The overflow sheet, absolutely positioned over the bottom region only.
  sheet?: React.ReactNode;
  progressPct: number; // the 3px hairline along the chart's bottom edge
  held: boolean; // sim held (any dock open) — shows the HELD pill
}

const RaceCockpit: React.FC<RaceCockpitProps> = ({
  layout,
  ribbon,
  chart,
  chartOverlays,
  band,
  controls,
  dock,
  sheet,
  progressPct,
  held,
}) => {
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const onStageLayout = (e: LayoutChangeEvent): void => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setStage((prev) => (Math.abs(prev.w - w) > 1 || Math.abs(prev.h - h) > 1 ? { w, h } : prev));
  };

  const stageBody = (
    <View
      style={[styles.stage, { minHeight: layout.chartMin }]}
      onLayout={onStageLayout}
      testID="chart-stage"
    >
      {stage.w > 1 && stage.h > 1 ? chart(stage.w, stage.h) : null}
      {chartOverlays}
      {held ? (
        <View style={styles.heldPill} testID="held-pill" accessibilityLabel="Race held, your call">
          <Text style={styles.heldText}>HELD — your call</Text>
        </View>
      ) : null}
      <View style={styles.hairlineTrack} testID="progress-hairline">
        <View style={[styles.hairlineFill, { width: `${Math.min(Math.max(progressPct, 0), 100)}%` }]} />
      </View>
    </View>
  );

  if (layout.rail) {
    return (
      <View style={styles.screenRow} testID="race-cockpit">
        <View style={styles.leftPane}>
          {ribbon}
          {band}
          {stageBody}
        </View>
        <View style={[styles.rail, { width: layout.railWidth }]}>
          <View style={{ flex: 1 }}>{dock ?? controls}</View>
          {sheet}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screenCol} testID="race-cockpit">
      {ribbon}
      {stageBody}
      {band}
      <View style={styles.bottomRegion}>
        {dock ?? controls}
        {sheet}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screenCol: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  screenRow: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.abyss,
  },
  leftPane: {
    flex: 1,
  },
  rail: {
    borderLeftWidth: 1,
    borderLeftColor: colors.hull,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bottomRegion: {
    // Anchors the overflow sheet: it may cover the dock region, never the chart.
    position: 'relative',
  },
  heldPill: {
    // Bottom-centre, clear of the standings strip and layer toggle that own the
    // top edge (they collide with a centred pill on a phone), and next to the
    // docked cards the held sim is waiting on.
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    backgroundColor: colors.overlay,
    borderColor: colors.brassLight,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  heldText: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  hairlineTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.navy,
  },
  hairlineFill: {
    height: 3,
    backgroundColor: colors.brassLight,
  },
});

export default RaceCockpit;
