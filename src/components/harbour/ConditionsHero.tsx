import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, numeric, spacing } from '../../theme';
import { WindSample } from '../../types';
import { WEATHER_CLIMATOLOGY } from '../../data/weatherClimatology';
import { REGION_BOUNDS, REGION_LAND } from '../../data/worldmap';
import { BoardConditions, compassPoint, harbourRead } from '../../engine/sailNow';
import WorldChart, { WorldPin } from '../WorldChart';
import { windHeatColor } from '../windScale';
import { RegionKey, REGION_META, regionRaces, shortRaceName } from './regions';

// §1 Conditions hero — "your waters right now": the player's home region as a
// compact chart with the breeze painted on it, plus the headline readout and a
// sailor's one-line read generated from the numbers. Display-only; tapping a
// pin routes through the same entry the world chart uses.

interface ConditionsHeroProps {
  region: RegionKey;
  conditions: BoardConditions;
  onEnterRace: (raceId: string) => void;
  isUnlocked: (raceId: string) => boolean;
  width: number;
}

export const ConditionsHero: React.FC<ConditionsHeroProps> = ({
  region,
  conditions,
  onEnterRace,
  isUnlocked,
  width,
}) => {
  const races = regionRaces(region);
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
        windWash={sample}
        width={width}
        height={200}
        testID="hero-chart"
      />
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
