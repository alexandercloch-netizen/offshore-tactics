import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing, status } from '../../theme';
import { REGION_BOUNDS, REGION_LAND, WORLD_BOUNDS, WORLD_LAND } from '../../data/worldmap';
import { BoardConditions } from '../../engine/sailNow';
import { LiveFlowGrid, seasonalWorldFlow } from '../../services/weather';
import WorldChart, { WorldPin } from '../WorldChart';
import WindScaleLegend from '../WindScaleLegend';
import { windHeatColor } from '../windScale';
import { blendWindGrid, courseWindPoints, regionBlendAllowed } from './windBlend';
import { regionWorldWash } from './worldField';
import { REGION_KEYS, REGION_META, RegionKey, regionRaces, shortRaceName } from './regions';
import { liveProvenance, seasonalWorldProvenance, SEASONAL_INDICATIVE } from './provenance';

// The blended field's grid (shared with the hero): coarse cols, finer rows.
const FLOW_COLS = 14;
const FLOW_ROWS = 22;

// §2 The world chart — tap the planet to go racing, over a painted world
// ocean. The wash is the 10° world lattice: live ECMWF (with the particle
// swarm — motion means live) or the baked monthly ERA5 climatology (wash and
// vanes only, holding still). Tapping a station re-projects the chart to that
// region, which climbs its own ladder: the live per-region lattice → the
// blended course samples behind the 500 km honesty gate → vanes-only. Every
// painted chart carries its provenance chip. Tapping a course enters the
// existing race-entry flow; the back arrow returns to the world.

interface WorldSectionProps {
  conditions: BoardConditions;
  now: number; // the dashboard's clock — picks the climatology month
  worldFlow?: LiveFlowGrid | null; // the live world lattice (HomeScreen owns the fetch)
  regionFlows?: Partial<Record<RegionKey, LiveFlowGrid>>;
  onRegionView?: (region: RegionKey) => void; // ask the screen to fetch a region's lattice
  onEnterRace: (raceId: string) => void;
  isUnlocked: (raceId: string) => boolean;
  width: number;
  worldHeight?: number; // desktop panes ask for taller charts than the phone defaults
  regionHeight?: number;
}

export const WorldSection: React.FC<WorldSectionProps> = ({
  conditions,
  now,
  worldFlow,
  regionFlows,
  onRegionView,
  onEnterRace,
  isUnlocked,
  width,
  worldHeight = 200,
  regionHeight = 230,
}) => {
  const [region, setRegion] = useState<RegionKey | null>(null);

  // A drill-in is the screen's cue to fetch that region's live lattice (lazy,
  // session-cached up there) — the chart shows the blended rung meanwhile and
  // the swarm survives the swap-in.
  useEffect(() => {
    if (region) onRegionView?.(region);
  }, [region, onRegionView]);

  // The world's field: the live lattice when it's fresh, else this month's
  // baked climatology — same 36×13 grid, so the chart can't tell the shapes
  // apart, only the labels and the motion differ.
  const month = new Date(now).getMonth();
  const seasonalWorld = useMemo(() => seasonalWorldFlow(month), [month]);
  const worldField = worldFlow ?? seasonalWorld;
  const worldLive = !!worldFlow;

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
  const worldPins: WorldPin[] = worldStations.map(({ key, meanKn, anchor }) => {
    // The vane is the anchor course's OWN reading (the pin sits in its
    // harbour) — never a direction averaged across a whole region.
    const s = conditions.samples[anchor.id] ?? anchor.prevailingWind;
    return {
      id: key,
      lat: anchor.waypoints[0].lat,
      lon: anchor.waypoints[0].lon,
      color: windHeatColor(meanKn),
      fromDeg: s.fromDeg,
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
          fromDeg: s.fromDeg,
        };
      })
    : [];

  // The zoomed region's field, up the ladder — memoised so re-renders keep
  // the cells' identity and the swarm never reseeds mid-flight.
  const regionField = useMemo(() => {
    if (!region) return null;
    const lattice = regionFlows?.[region];
    if (lattice) {
      return { flow: lattice, motion: true, provenance: liveProvenance(lattice.fetchedAt) };
    }
    const live = conditions.source === 'live' && conditions.fetchedAt != null;
    // Ocean-sized region: paint the world field clipped to the box rather than
    // a blank sea (see worldField / ConditionsHero — the same honest rung).
    if (!regionBlendAllowed(region)) return regionWorldWash(region, worldFlow, month);
    const provenance = live ? liveProvenance(conditions.fetchedAt as number) : SEASONAL_INDICATIVE;
    return {
      flow: {
        cells: blendWindGrid(
          courseWindPoints(regionRaces(region), conditions.samples),
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
  }, [region, regionFlows, conditions, worldFlow, month]);

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
        <>
          <WorldChart
            bounds={REGION_BOUNDS[region]}
            land={REGION_LAND[region] ?? []}
            pins={regionPins}
            onPinPress={(id) => {
              if (isUnlocked(id)) onEnterRace(id);
            }}
            width={width}
            height={regionHeight}
            flow={regionField?.flow}
            flowMotion={regionField?.motion}
            provenance={regionField?.provenance}
            testID="region-chart"
          />
          <WindScaleLegend layer="wind" />
        </>
      ) : (
        <>
          <WorldChart
            bounds={WORLD_BOUNDS}
            land={WORLD_LAND}
            pins={worldPins}
            onPinPress={(id) => setRegion(id as RegionKey)}
            width={width}
            height={worldHeight}
            flow={worldField}
            flowMotion={worldLive}
            washOpacity={0.55}
            provenance={
              worldLive
                ? liveProvenance((worldFlow as LiveFlowGrid).fetchedAt)
                : seasonalWorldProvenance(month)
            }
            testID="world-chart"
          />
          <WindScaleLegend layer="wind" />
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
