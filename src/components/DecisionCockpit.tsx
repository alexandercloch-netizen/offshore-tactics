import React, { useState } from 'react';
import {
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { GameEvent, TacticalChoice, VmgPreview } from '../types';
import { InstrumentReport } from '../engine/instruments';
import type { TacticalRead } from '../engine/gameEngine';
import Sparkline from './Sparkline';

// The race decision presented as a full-screen "nav station": the live chart is
// the hero, a wide instrument strip sits above it, and the options are comparison
// cards along the bottom — so the player reads the situation and makes the call in
// one view, instead of squinting at a card docked over a dimmed map.

interface DecisionCockpitProps {
  visible: boolean;
  event: GameEvent | null;
  vmg?: VmgPreview | null;
  instruments?: InstrumentReport | null;
  read?: TacticalRead | null;
  // The screen supplies the configured chart at the size the cockpit asks for, so
  // the cockpit owns layout and the screen owns the race data.
  renderMap: (width: number, height: number) => React.ReactNode;
  onSelect: (choice: TacticalChoice) => void;
}

const round = (n: number): number => Math.round(n);

function shiftText(deg: number): string {
  const r = Math.round(deg);
  if (r > 2) return `veered ${r}°`;
  if (r < -2) return `backed ${Math.abs(r)}°`;
  return 'steady';
}

function buildText(deltaKn: number): string {
  const r = Math.round(deltaKn);
  if (r > 1) return `building +${r} kn`;
  if (r < -1) return `easing ${r} kn`;
  return 'holding';
}

function placesText(gained: number): string {
  if (gained > 0) return `▲ gained ${gained}`;
  if (gained < 0) return `▼ lost ${Math.abs(gained)}`;
  return 'held station';
}

function formatDelta(value: number, suffix = ''): string {
  if (value === 0) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

function impactLine(choice: TacticalChoice): string {
  const parts: string[] = [];
  if (choice.timeDelta !== 0) parts.push(`${choice.timeDelta < 0 ? '' : '+'}${choice.timeDelta}h`);
  if (choice.hullDelta !== 0) parts.push(`Hull ${formatDelta(choice.hullDelta)}`);
  if (choice.staminaDelta !== 0) parts.push(`Crew ${formatDelta(choice.staminaDelta)}`);
  if (choice.moraleDelta !== 0) parts.push(`Morale ${formatDelta(choice.moraleDelta)}`);
  if (choice.risk >= 0.2) parts.push('High risk');
  else if (choice.risk >= 0.1) parts.push('Some risk');
  return parts.join('  •  ');
}

function vmgArrow(before: number, after: number): string {
  if (after > before + 0.05) return '▲';
  if (after < before - 0.05) return '▼';
  return '▶';
}

function vmgColor(before: number, after: number): string {
  if (after > before + 0.05) return colors.signalGreen;
  if (after < before - 0.05) return colors.signalRed;
  return colors.mist;
}

const Gauge: React.FC<{ label: string; value: string; tint?: string }> = ({ label, value, tint }) => (
  <View style={styles.gauge}>
    <Text style={[styles.gaugeValue, tint ? { color: tint } : null]}>{value}</Text>
    <Text style={styles.gaugeLabel}>{label}</Text>
  </View>
);

export const DecisionCockpit: React.FC<DecisionCockpitProps> = ({
  visible,
  event,
  vmg,
  instruments,
  read,
  renderMap,
  onSelect,
}) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [map, setMap] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const wide = width >= 820;
  const isMob = event?.kind === 'mob';

  const onHeroLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (Math.abs(w - map.w) > 1 || Math.abs(h - map.h) > 1) setMap({ w, h });
  };

  const now = instruments?.now;
  // Condition gauges go red when they're getting dangerous, so a hull/crew problem
  // jumps out while you're deciding.
  const cond = (v: number): string | undefined => (v < 35 ? colors.signalRed : v < 60 ? colors.warning : undefined);

  return (
    <Modal visible={visible && !!event} animationType="fade" onRequestClose={() => undefined}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {event ? (
          <>
            {/* Header: what's happening + where you stand. */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                {isMob ? (
                  <Text style={styles.mobTag}>EMERGENCY</Text>
                ) : event.pointOfSail ? (
                  <Text style={styles.tag}>{event.pointOfSail}</Text>
                ) : null}
                <Text style={[styles.title, isMob && { color: colors.signalRed }]}>{event.title}</Text>
              </View>
              {now ? (
                <View style={styles.placeBox}>
                  <Text style={styles.placeValue}>{now.position}</Text>
                  <Text style={styles.placeLabel}>of {now.fleetSize}</Text>
                </View>
              ) : null}
            </View>

            {/* Instrument strip — the gauges you race with, enlarged. */}
            {now ? (
              <View style={styles.instrPanel}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.gaugeBar}
                  contentContainerStyle={styles.gaugeRow}
                >
                  <Gauge label="Boat" value={`${now.speedKn.toFixed(1)}`} />
                  {vmg ? <Gauge label="VMG" value={`${vmg.before.toFixed(1)}`} /> : null}
                  <Gauge label="Wind" value={`${round(now.windSpeedKn)}`} />
                  <Gauge label="From" value={`${round(now.windDir)}°`} />
                  <Gauge label="Sail" value={now.pointOfSail} />
                  <Gauge label="To go" value={`${round(now.distanceToGoNm)}nm`} />
                  <Gauge label="Hull" value={`${round(now.hull)}`} tint={cond(now.hull)} />
                  <Gauge label="Crew" value={`${round(now.stamina)}`} tint={cond(now.stamina)} />
                  <Gauge label="Morale" value={`${round(now.morale)}`} tint={cond(now.morale)} />
                </ScrollView>
                <View style={styles.telemetry}>
                  {instruments ? (
                    <Text style={styles.legLine} numberOfLines={1}>
                      This leg {round(instruments.leg.nm)}nm · {shiftText(instruments.leg.windShiftDeg)},{' '}
                      {buildText(instruments.leg.windDeltaKn)} · {placesText(instruments.leg.placesGained)}
                    </Text>
                  ) : null}
                  {instruments && instruments.windSeries.length >= 2 ? (
                    <View style={styles.sparkRow}>
                      <Text style={styles.sparkLabel}>Wind</Text>
                      <Sparkline values={instruments.windSeries} />
                    </View>
                  ) : null}
                </View>
                {instruments?.outlook.warn ? (
                  <Text style={styles.outlookLine} numberOfLines={1}>
                    ⚠ {instruments.outlook.headline} · {round(instruments.outlook.peakKn)} kn
                    {instruments.outlook.trend === 'building' ? ' ahead' : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* The chart — the hero. Fills the space between the gauges and the calls. */}
            <View style={styles.hero} onLayout={onHeroLayout}>
              {map.w > 1 && map.h > 1 ? renderMap(map.w, map.h) : null}
            </View>

            {/* The prompt + the Navigator's read, just above the calls. */}
            <Text style={styles.prompt} numberOfLines={wide ? 2 : 3}>
              {event.prompt}
            </Text>
            {read && event.choices.some((c) => c.field) ? (
              <Text style={styles.read} numberOfLines={2}>
                🧭 Navigator: {read.hint}
              </Text>
            ) : null}

            {/* The calls, as comparison cards. */}
            <View style={[styles.choices, wide ? styles.choicesRow : styles.choicesCol]}>
              {event.choices.map((choice) => {
                const after = vmg?.after[choice.id];
                const highRisk = choice.risk >= 0.2;
                return (
                  <Pressable
                    key={choice.id}
                    testID="decision-choice"
                    onPress={() => onSelect(choice)}
                    style={({ pressed }) => [
                      styles.choiceCard,
                      wide ? styles.choiceCardWide : null,
                      highRisk && styles.choiceCardRisk,
                      pressed && styles.choiceCardPressed,
                    ]}
                  >
                    <Text style={styles.choiceLabel}>{choice.label}</Text>
                    <Text style={styles.choiceDesc} numberOfLines={2}>
                      {choice.description}
                    </Text>
                    <View style={styles.choiceFoot}>
                      {vmg && after !== undefined ? (
                        <Text style={[styles.vmgAfter, { color: vmgColor(vmg.before, after) }]}>
                          {vmgArrow(vmg.before, after)} VMG {after.toFixed(1)} kn
                        </Text>
                      ) : null}
                      {impactLine(choice) ? <Text style={styles.impact}>{impactLine(choice)}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  tag: {
    color: colors.abyss,
    backgroundColor: colors.brass,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  mobTag: {
    color: colors.white,
    backgroundColor: colors.signalRed,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  placeBox: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minWidth: 60,
  },
  placeValue: {
    color: colors.brassLight,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  placeLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
  },
  instrPanel: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  // flexGrow:0 keeps the horizontal strip at its content height (a horizontal
  // ScrollView otherwise grows and stretches its children tall on web).
  gaugeBar: {
    flexGrow: 0,
    flexShrink: 0,
  },
  gaugeRow: {
    alignItems: 'center',
    gap: spacing.xl,
  },
  gauge: {
    alignItems: 'flex-start',
  },
  gaugeValue: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  gaugeLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  telemetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legLine: {
    flex: 1,
    color: colors.mist,
    fontSize: fontSize.xs,
  },
  sparkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sparkLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  outlookLine: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  hero: {
    flex: 1,
    minHeight: 180,
    marginVertical: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prompt: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  read: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  choices: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  choicesRow: {
    flexDirection: 'row',
  },
  choicesCol: {
    flexDirection: 'column',
  },
  choiceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
  },
  choiceCardWide: {
    flex: 1,
  },
  choiceCardRisk: {
    borderColor: colors.warning,
  },
  choiceCardPressed: {
    backgroundColor: colors.hull,
    borderColor: colors.brassLight,
  },
  choiceLabel: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  choiceDesc: {
    color: colors.mist,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  choiceFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  vmgAfter: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  impact: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
});

export default DecisionCockpit;
