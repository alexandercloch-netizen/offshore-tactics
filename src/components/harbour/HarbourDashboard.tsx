import React, { useMemo } from 'react';
import { View } from 'react-native';
import { PlayerProfile, RaceResult } from '../../types';
import { RACES } from '../../data/races';
import { isRaceUnlocked } from '../../engine/gameEngine';
import { BoardConditions, rankRaces } from '../../engine/sailNow';
import { logbookStats } from '../../engine/logbook';
import ConditionsHero from './ConditionsHero';
import WorldSection from './WorldSection';
import SailTodayBoard from './SailTodayBoard';
import LogbookPanel from './LogbookPanel';
import SeasonStrip from './SeasonStrip';
import { homeRegion } from './regions';

// The Harbour — the home screen's analytics dashboard, all five sections in
// reading order. Display-only and props-driven (no navigation, no game
// context), so the render test can mount it with plain fixtures. The screen
// owns the CTAs (Resume / Browse) and the race-entry side effects.

interface HarbourDashboardProps {
  player?: PlayerProfile;
  history: RaceResult[];
  conditions: BoardConditions;
  now: number; // the dashboard's clock, injected so the ranker stays pure
  recommendedId?: string; // recommend.ts's pick — feeds the ranker's ladder fit
  onEnterRace: (raceId: string) => void;
  width: number; // drawable chart width (screen minus the page padding)
  children?: React.ReactNode; // the screen's CTA block, slotted under the world chart
}

export const HarbourDashboard: React.FC<HarbourDashboardProps> = ({
  player,
  history,
  conditions,
  now,
  recommendedId,
  onEnterRace,
  width,
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

  return (
    <View testID="harbour-dashboard">
      <ConditionsHero
        region={region}
        conditions={conditions}
        onEnterRace={onEnterRace}
        isUnlocked={isUnlocked}
        width={width}
      />
      <WorldSection
        conditions={conditions}
        onEnterRace={onEnterRace}
        isUnlocked={isUnlocked}
        width={width}
      />
      {children}
      <SailTodayBoard board={board} source={conditions.source} onEnterRace={onEnterRace} />
      <LogbookPanel stats={stats} />
      <SeasonStrip now={now} onEnterRace={onEnterRace} isUnlocked={isUnlocked} />
    </View>
  );
};

export default HarbourDashboard;
