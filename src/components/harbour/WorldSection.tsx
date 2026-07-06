import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, spacing, status } from '../../theme';
import { REGION_BOUNDS, REGION_LAND, WORLD_BOUNDS, WORLD_LAND } from '../../data/worldmap';
import { BoardConditions } from '../../engine/sailNow';
import WorldChart, { WorldPin } from '../WorldChart';
import { windHeatColor } from '../windScale';
import { REGION_KEYS, REGION_META, RegionKey, regionRaces, shortRaceName } from './regions';

// §2 The world chart — tap the planet to go racing. World view shows one
// station pin per sailing region (anchored on its home-port classic, so the
// pin sits in a real harbour, not a mid-continent centroid); tapping a station
// re-projects the chart to that region with each course pinned individually,
// coloured by its current wind band; tapping a course enters the existing
// race-entry flow. The back arrow returns to the world.

interface WorldSectionProps {
  conditions: BoardConditions;
  onEnterRace: (raceId: string) => void;
  isUnlocked: (raceId: string) => boolean;
  width: number;
}

export const WorldSection: React.FC<WorldSectionProps> = ({
  conditions,
  onEnterRace,
  isUnlocked,
  width,
}) => {
  const [region, setRegion] = useState<RegionKey | null>(null);

  const worldPins: WorldPin[] = REGION_KEYS.map((key) => {
    const races = regionRaces(key);
    const anchor = races[0];
    const meanKn =
      races.reduce(
        (s, r) => s + (conditions.samples[r.id]?.speedKn ?? r.prevailingWind.speedKn),
        0
      ) / Math.max(1, races.length);
    return {
      id: key,
      lat: anchor.waypoints[0].lat,
      lon: anchor.waypoints[0].lon,
      color: windHeatColor(meanKn),
      label: REGION_META[key].short,
      sublabel: `${races.length} ${races.length === 1 ? 'course' : 'courses'}`,
    };
  });

  const regionPins: WorldPin[] = region
    ? regionRaces(region).map((race) => {
        const s = conditions.samples[race.id] ?? race.prevailingWind;
        return {
          id: race.id,
          lat: race.waypoints[0].lat,
          lon: race.waypoints[0].lon,
          color: windHeatColor(s.speedKn),
          label: shortRaceName(race),
          sublabel: `${Math.round(s.speedKn)} kn`,
          locked: !isUnlocked(race.id),
        };
      })
    : [];

  return (
    <View style={styles.section} testID="harbour-world">
      <View style={styles.headerRow}>
        {region ? (
          <Pressable
            onPress={() => setRegion(null)}
            accessibilityRole="button"
            accessibilityLabel="Back to world chart"
            testID="world-back"
            hitSlop={8}
          >
            <Text style={styles.back}>‹ World</Text>
          </Pressable>
        ) : (
          <Text style={styles.kicker}>The racing world</Text>
        )}
        {region ? <Text style={styles.regionTitle}>{REGION_META[region].short}</Text> : null}
      </View>
      {region ? (
        <WorldChart
          bounds={REGION_BOUNDS[region]}
          land={REGION_LAND[region] ?? []}
          pins={regionPins}
          onPinPress={(id) => {
            if (isUnlocked(id)) onEnterRace(id);
          }}
          width={width}
          height={230}
          testID="region-chart"
        />
      ) : (
        <WorldChart
          bounds={WORLD_BOUNDS}
          land={WORLD_LAND}
          pins={worldPins}
          onPinPress={(id) => setRegion(id as RegionKey)}
          width={width}
          height={200}
          testID="world-chart"
        />
      )}
      <Text style={styles.hint}>
        {region
          ? 'Tap a course to enter it — dim pins are still locked.'
          : 'Tap a station to see its courses.'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    minHeight: 22,
  },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  back: {
    color: status.info,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  regionTitle: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  hint: {
    color: colors.slate,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
});

export default WorldSection;
