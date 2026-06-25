import React from 'react';
import {
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

const Gauge: React.FC<{ label: string; value: string; tint?: string; accessibilityLabel?: string }> = ({
  label,
  value,
  tint,
  accessibilityLabel,
}) => (
  <View style={styles.gauge} accessibilityLabel={accessibilityLabel ?? `${label} ${value}`}>
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
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 820;
  const isMob = event?.kind === 'mob';

  // The chart stays the hero with a generous, window-relative height — clamped so
  // it's tall on a phone yet never swallows the page on a laptop. The body scrolls,
  // so the prompt/options never clip on short or landscape screens.
  const heroHeight = Math.round(Math.max(220, Math.min(wide ? 520 : 440, height * (wide ? 0.5 : 0.42))));
  // On desktop the content reads as a centred column rather than stretching
  // edge-to-edge, matching the briefing/race screens.
  const CONTENT_MAX = 860;
  const heroWidth = Math.min(width - spacing.lg * 2, CONTENT_MAX);

  const now = instruments?.now;
  // Condition gauges go red when they're getting dangerous, so a hull/crew problem
  // jumps out while you're deciding.
  const cond = (v: number): string | undefined => (v < 35 ? colors.signalRed : v < 60 ? colors.warning : undefined);
  // Spell the danger out for screen readers — colour alone isn't enough.
  const condLabel = (label: string, v: number): string =>
    `${label} ${round(v)}${v < 35 ? ', critical' : v < 60 ? ', low' : ''}`;

  return (
    <Modal visible={visible && !!event} animationType="fade" onRequestClose={() => undefined}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        {event ? (
          <View style={[styles.column, { maxWidth: CONTENT_MAX }]}>
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

            {/* Instrument strip — the gauges you race with, enlarged. Wraps so every
                gauge (incl. Hull/Crew/Morale) is visible without horizontal scroll. */}
            {now ? (
              <View style={styles.instrPanel}>
                <View style={styles.gaugeRow}>
                  <Gauge key="Boat" label="Boat" value={`${now.speedKn.toFixed(1)}`} />
                  {vmg ? <Gauge key="VMG" label="VMG" value={`${vmg.before.toFixed(1)}`} /> : null}
                  <Gauge key="Wind" label="Wind" value={`${round(now.windSpeedKn)}`} />
                  <Gauge key="From" label="From" value={`${round(now.windDir)}°`} />
                  <Gauge key="Sail" label="Sail" value={now.pointOfSail} />
                  <Gauge key="To go" label="To go" value={`${round(now.distanceToGoNm)}nm`} />
                  <Gauge
                    key="Hull"
                    label="Hull"
                    value={`${round(now.hull)}`}
                    tint={cond(now.hull)}
                    accessibilityLabel={condLabel('Hull', now.hull)}
                  />
                  <Gauge
                    key="Crew"
                    label="Crew"
                    value={`${round(now.stamina)}`}
                    tint={cond(now.stamina)}
                    accessibilityLabel={condLabel('Crew', now.stamina)}
                  />
                  <Gauge
                    key="Morale"
                    label="Morale"
                    value={`${round(now.morale)}`}
                    tint={cond(now.morale)}
                    accessibilityLabel={condLabel('Morale', now.morale)}
                  />
                </View>
                <View style={styles.telemetry}>
                  {instruments ? (
                    <Text style={styles.legLine} numberOfLines={2}>
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

            {/* The chart — the hero. A window-relative height keeps it the largest
                element without over-expanding into an empty gap. */}
            <View style={[styles.hero, { height: heroHeight }]}>
              {heroWidth > 1 ? renderMap(heroWidth, heroHeight) : null}
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
                const impact = impactLine(choice);
                const riskWord = choice.risk >= 0.2 ? 'high risk' : choice.risk >= 0.1 ? 'some risk' : 'low risk';
                const a11y = [
                  choice.label,
                  after !== undefined ? `projected VMG ${after.toFixed(1)} knots` : null,
                  riskWord,
                ]
                  .filter(Boolean)
                  .join(', ');
                return (
                  <Pressable
                    key={choice.id}
                    testID="decision-choice"
                    accessibilityRole="button"
                    accessibilityLabel={a11y}
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
                      {impact ? <Text style={styles.impact}>{impact}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  column: {
    width: '100%',
    alignSelf: 'center',
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
  // A wrapping row shows every gauge without horizontal scroll on a phone; on a
  // wide screen it still reads as a single clean row when it fits.
  gaugeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    rowGap: spacing.sm,
    columnGap: spacing.md,
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
    color: colors.mist,
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
    color: colors.mist,
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
    marginBottom: spacing.lg,
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
    minHeight: 52,
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
