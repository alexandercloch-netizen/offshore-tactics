import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing, status } from '../../theme';
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
  worldHeight?: number; // desktop panes ask for taller charts than the phone defaults
  regionHeight?: number;
}

export const WorldSection: React.FC<WorldSectionProps> = ({
  conditions,
  onEnterRace,
  isUnlocked,
  width,
  worldHeight = 200,
  regionHeight = 230,
}) => {
  const [region, setRegion] = useState<RegionKey | null>(null);

  // World-view stations carry NO captions: seven labelled stations cannot pack
  // honestly onto a 124px-tall strip (the declutter turns into a lottery), so
  // the dots stay pure visual anchors and the chip row below carries the names.
  const worldStations = REGION_KEYS.map((key) => {
    const races = regionRaces(key);
    const anchor = races[0];
    const meanKn =
      races.reduce(
        (s, r) => s + (conditions.samples[r.id]?.speedKn ?? r.prevailingWind.speedKn),
        0
      ) / Math.max(1, races.length);
    return { key, races, meanKn, anchor };
  });
  const worldPins: WorldPin[] = worldStations.map(({ key, meanKn, anchor }) => ({
    id: key,
    lat: anchor.waypoints[0].lat,
    lon: anchor.waypoints[0].lon,
    color: windHeatColor(meanKn),
  }));

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
          height={regionHeight}
          testID="region-chart"
        />
      ) : (
        <>
          <WorldChart
            bounds={WORLD_BOUNDS}
            land={WORLD_LAND}
            pins={worldPins}
            onPinPress={(id) => setRegion(id as RegionKey)}
            width={width}
            height={worldHeight}
            testID="world-chart"
          />
          <View style={styles.chipRow}>
            {worldStations.map(({ key, races, meanKn }) => (
              <Pressable
                key={key}
                onPress={() => setRegion(key)}
                accessibilityRole="button"
                accessibilityLabel={`${REGION_META[key].short}, ${races.length} courses`}
                testID={`world-region-chip-${key}`}
                style={styles.chip}
              >
                <View style={[styles.chipDot, { backgroundColor: windHeatColor(meanKn) }]} />
                <Text style={styles.chipLabel}>{REGION_META[key].short}</Text>
                <Text style={styles.chipCount}>{races.length}</Text>
              </Pressable>
            ))}
          </View>
        </>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    minHeight: 32,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipLabel: {
    color: colors.foam,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  chipCount: {
    color: colors.slate,
    fontSize: fontSize.xs,
  },
});

export default WorldSection;
