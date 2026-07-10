import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, numeric, spacing } from '../../theme';
import { WindSample } from '../../types';
import { WEATHER_CLIMATOLOGY } from '../../data/weatherClimatology';
import { REGION_BOUNDS, REGION_LAND } from '../../data/worldmap';
import { BoardConditions, compassPoint, harbourRead } from '../../engine/sailNow';
import { LiveFlowGrid } from '../../services/weather';
import WorldChart, { WorldPin } from '../WorldChart';
import WindScaleLegend from '../WindScaleLegend';
import { windHeatColor } from '../windScale';
import { blendWindGrid, courseWindPoints, regionBlendAllowed } from './windBlend';
import { RegionKey, REGION_META, regionRaces, shortRaceName } from './regions';
import { liveProvenance, SEASONAL_INDICATIVE } from './provenance';

// The blended field's grid: coarse cols (the strips interpolate), finer rows.
const FLOW_COLS = 14;
const FLOW_ROWS = 22;

// §1 Conditions hero — "your waters right now": the player's home region as a
// compact chart with the breeze painted on it, plus the headline readout and a
// sailor's one-line read generated from the numbers. Display-only; tapping a
// pin routes through the same entry the world chart uses.
//
// The chart climbs the same ladder as a region drill-in: the live per-region
// lattice when it has landed → the blended course samples (moving only when
// the samples are live — motion means live) behind the 500 km honesty gate →
// vanes-only. The provenance chip names whichever rung is painting.

interface ConditionsHeroProps {
  region: RegionKey;
  conditions: BoardConditions;
  liveFlow?: LiveFlowGrid | null; // the home region's live lattice, if fetched
  onEnterRace: (raceId: string) => void;
  isUnlocked: (raceId: string) => boolean;
  width: number;
  chartHeight?: number; // desktop panes ask for a taller chart than the phone's 200
}

export const ConditionsHero: React.FC<ConditionsHeroProps> = ({
  region,
  conditions,
  liveFlow,
  onEnterRace,
  isUnlocked,
  width,
  chartHeight = 200,
}) => {
  const races = useMemo(() => regionRaces(region), [region]);

  // The region's field, up the ladder — memoised so a parent re-render keeps
  // the cells' identity and the swarm never reseeds mid-flight.
  const field = useMemo(() => {
    if (liveFlow) {
      return { flow: liveFlow, motion: true, provenance: liveProvenance(liveFlow.fetchedAt) };
    }
    const live = conditions.source === 'live' && conditions.fetchedAt != null;
    const provenance = live ? liveProvenance(conditions.fetchedAt as number) : SEASONAL_INDICATIVE;
    if (!regionBlendAllowed(region)) return { flow: undefined, motion: false, provenance };
    return {
      flow: {
        cells: blendWindGrid(
          courseWindPoints(races, conditions.samples),
          REGION_BOUNDS[region],
          FLOW_COLS,
          FLOW_ROWS
        ),
        cols: FLOW_COLS,
        rows: FLOW_ROWS,
      },
      motion: live,
      provenance,
    };
  }, [liveFlow, conditions, region, races]);

  const lead = races[0];
  if (!lead) return null;

  // The home-port classic's breeze headlines the region.
  const sample: WindSample = conditions.samples[lead.id] ?? { ...lead.prevailingWind };
  const climate = WEATHER_CLIMATOLOGY[lead.id];
  const meta = REGION_META[region];

  const pins: WorldPin[] = races.map((race) => {
    const s = conditions.samples[race.id] ?? race.prevailingWind;
    return {
      id: race.id,
      lat: race.waypoints[0].lat,
      lon: race.waypoints[0].lon,
      color: windHeatColor(s.speedKn),
      label: shortRaceName(race),
      locked: !isUnlocked(race.id),
      // Each pin's own course reading — under a painted field the vanes step
      // back; on the vanes-only rung they ARE the weather.
      fromDeg: s.fromDeg,
    };
  });

  return (
    <View style={styles.section} testID="harbour-hero">
      <Text style={styles.kicker}>
        {conditions.source === 'live' ? 'Your waters right now' : 'Your waters — seasonal outlook'}
      </Text>
      <View style={styles.readoutRow}>
        <Text style={[styles.readout, numeric]}>{Math.round(sample.speedKn)}</Text>
        <View style={styles.readoutMeta}>
          <Text style={styles.readoutUnit}>kn {compassPoint(sample.fromDeg)}</Text>
          <Text style={styles.readoutWaters}>{meta.waters}</Text>
        </View>
      </View>
      <Text style={styles.read}>{harbourRead(sample, meta.waters, climate)}</Text>
      <WorldChart
        bounds={REGION_BOUNDS[region]}
        land={REGION_LAND[region] ?? []}
        pins={pins}
        onPinPress={onEnterRace}
        windWash={field.flow ? sample : undefined}
        flow={field.flow}
        flowMotion={field.motion}
        provenance={field.provenance}
        width={width}
        height={chartHeight}
        testID="hero-chart"
      />
      <WindScaleLegend layer="wind" />
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  readoutRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  readout: {
    color: colors.foam,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    lineHeight: 40,
  },
  readoutMeta: {
    paddingBottom: 2,
  },
  readoutUnit: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  readoutWaters: {
    color: colors.mist,
    fontSize: fontSize.xs,
  },
  read: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
});

export default ConditionsHero;
