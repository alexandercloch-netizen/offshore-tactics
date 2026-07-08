import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { PlayerProfile, RaceResult } from '../../types';
import { RACES } from '../../data/races';
import { isRaceUnlocked } from '../../engine/gameEngine';
import { BoardConditions, rankRaces } from '../../engine/sailNow';
import { logbookStats } from '../../engine/logbook';
import { spacing } from '../../theme';
import ConditionsHero from './ConditionsHero';
import WorldSection from './WorldSection';
import SailTodayBoard from './SailTodayBoard';
import LogbookPanel from './LogbookPanel';
import SeasonStrip from './SeasonStrip';
import { homeRegion } from './regions';

// The Harbour — the home screen's analytics dashboard. Display-only and
// props-driven (no navigation, no game context), so the render test can mount
// it with plain fixtures. The screen owns the CTAs (Resume / Browse) and the
// race-entry side effects.
//
// Two layouts, one content set. A phone (or any narrow window) reads as a
// single column in priority order. A desktop-wide stage becomes a chart
// table: the LEFT pane carries the two charts at sizes worth the pixels
// (your waters above the racing world), the RIGHT pane carries the numbers
// (CTAs, the where-to-sail board, the logbook, the calendar) — the whole
// dashboard in one glance instead of a phone column adrift in a void.

interface HarbourDashboardProps {
  player?: PlayerProfile;
  history: RaceResult[];
  conditions: BoardConditions;
  now: number; // the dashboard's clock, injected so the ranker stays pure
  recommendedId?: string; // recommend.ts's pick — feeds the ranker's ladder fit
  onEnterRace: (raceId: string) => void;
  width: number; // chart width: the full column (phone) or the left pane (two-pane)
  twoPane?: boolean; // desktop chart-table layout (the screen owns the breakpoint)
  rightWidth?: number; // the numbers pane's width, two-pane only
  children?: React.ReactNode; // the screen's CTA block (under the world chart / top of the right pane)
}

export const HarbourDashboard: React.FC<HarbourDashboardProps> = ({
  player,
  history,
  conditions,
  now,
  recommendedId,
  onEnterRace,
  width,
  twoPane = false,
  rightWidth,
  children,
}) => {
  const isUnlocked = useMemo(() => {
    const unlocked = new Set(
      RACES.filter((r) => isRaceUnlocked(r, history)).map((r) => r.id)
    );
    return (raceId: string) => unlocked.has(raceId);
  }, [history]);

  const board = useMemo(
    () => rankRaces({ conditions, history, now, recommendedId }),
    [conditions, history, now, recommendedId]
  );
  const stats = useMemo(() => logbookStats(history), [history]);
  const region = homeRegion(player?.region, recommendedId);

  // Desktop panes earn desktop charts: heights scale with the pane so the
  // hero reads as a real chart, not the phone's 200px stamp. The charts
  // letterbox themselves to their baked coverage, so bigger is free.
  const heroHeight = twoPane ? Math.round(Math.min(Math.max(width * 0.58, 300), 460)) : 200;
  const worldHeight = twoPane ? Math.round(Math.min(Math.max(width * 0.42, 240), 360)) : 200;
  const regionHeight = twoPane ? Math.round(Math.min(Math.max(width * 0.58, 300), 460)) : 230;

  const charts = (
    <>
      <ConditionsHero
        region={region}
        conditions={conditions}
        onEnterRace={onEnterRace}
        isUnlocked={isUnlocked}
        width={width}
        chartHeight={heroHeight}
      />
      <WorldSection
        conditions={conditions}
        onEnterRace={onEnterRace}
        isUnlocked={isUnlocked}
        width={width}
        worldHeight={worldHeight}
        regionHeight={regionHeight}
      />
    </>
  );
  const numbers = (
    <>
      {children}
      <SailTodayBoard board={board} source={conditions.source} onEnterRace={onEnterRace} />
      <LogbookPanel stats={stats} />
      <SeasonStrip now={now} onEnterRace={onEnterRace} isUnlocked={isUnlocked} />
    </>
  );

  if (twoPane) {
    return (
      <View style={styles.paneRow} testID="harbour-dashboard">
        <View style={{ width }} testID="harbour-charts-pane">
          {charts}
        </View>
        <View style={[styles.rightPane, rightWidth ? { width: rightWidth } : null]} testID="harbour-numbers-pane">
          {numbers}
        </View>
      </View>
    );
  }

  return (
    <View testID="harbour-dashboard">
      {charts}
      {numbers}
    </View>
  );
};

const styles = StyleSheet.create({
  paneRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  rightPane: {
    flex: 1,
  },
});

export default HarbourDashboard;
