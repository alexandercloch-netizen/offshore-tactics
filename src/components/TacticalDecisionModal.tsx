import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { GameEvent, TacticalChoice, VmgPreview } from '../types';
import { InstrumentReport } from '../engine/instruments';
import type { TacticalRead } from '../engine/gameEngine';
import NauticalButton from './NauticalButton';
import Sparkline from './Sparkline';

interface TacticalDecisionModalProps {
  visible: boolean;
  event: GameEvent | null;
  vmg?: VmgPreview | null;
  instruments?: InstrumentReport | null;
  read?: TacticalRead | null; // the Navigator's read, for field-resolved calls
  onSelect: (choice: TacticalChoice) => void;
}

const round = (n: number): number => Math.round(n);

// A signed shift like "veered 8°" / "backed 5°" / "steady".
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
  if (choice.timeDelta !== 0) {
    parts.push(`${choice.timeDelta < 0 ? '' : '+'}${choice.timeDelta}h`);
  }
  if (choice.hullDelta !== 0) parts.push(`Hull ${formatDelta(choice.hullDelta)}`);
  if (choice.staminaDelta !== 0)
    parts.push(`Crew ${formatDelta(choice.staminaDelta)}`);
  if (choice.moraleDelta !== 0)
    parts.push(`Morale ${formatDelta(choice.moraleDelta)}`);
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

const MOB_TINT = colors.signalRed;

export const TacticalDecisionModal: React.FC<TacticalDecisionModalProps> = ({
  visible,
  event,
  vmg,
  instruments,
  read,
  onSelect,
}) => {
  const isMob = event?.kind === 'mob';
  const { width } = useWindowDimensions();
  // Dock the call to a right-hand panel only when the screen is wide enough that
  // the panel clears the centred race column (≈760px) beside it; otherwise use a
  // bottom sheet, which works at any width. Either way the backdrop stays clear
  // so the chart, fleet and wind behind it remain readable while the player
  // decides (the sim is frozen meanwhile).
  const wide = width >= 1672;
  return (
    <Modal visible={visible && !!event} transparent animationType={wide ? 'fade' : 'slide'}>
      <View style={[styles.backdrop, wide ? styles.backdropWide : styles.backdropNarrow]}>
        <View
          style={[
            styles.card,
            wide ? styles.cardWide : styles.cardNarrow,
            wide ? { width: Math.min(440, width - spacing.lg * 2) } : null,
            isMob && styles.cardMob,
          ]}
        >
          {event ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {isMob ? (
                <Text style={styles.mobTag}>EMERGENCY</Text>
              ) : event.pointOfSail ? (
                <Text style={styles.tag}>{event.pointOfSail}</Text>
              ) : null}
              <Text style={[styles.title, isMob && { color: MOB_TINT }]}>
                {event.title}
              </Text>
              <Text style={styles.prompt}>{event.prompt}</Text>

              {read && event.choices.some((c) => c.field) ? (
                <Text style={styles.read}>🧭 Navigator: {read.hint}</Text>
              ) : null}

              {instruments ? (
                <View style={styles.instruments}>
                  <Text style={styles.instrTitle}>Instruments</Text>
                  <View style={styles.instrGrid}>
                    <Metric label="Boat" value={`${instruments.now.speedKn.toFixed(1)} kn`} />
                    {vmg ? <Metric label="VMG" value={`${vmg.before.toFixed(1)} kn`} /> : null}
                    <Metric label="Wind" value={`${round(instruments.now.windSpeedKn)} kn`} />
                    <Metric label="From" value={`${round(instruments.now.windDir)}°`} />
                    <Metric label="Sail" value={instruments.now.pointOfSail} />
                    <Metric
                      label="Place"
                      value={`${instruments.now.position}/${instruments.now.fleetSize}`}
                    />
                    <Metric label="To go" value={`${round(instruments.now.distanceToGoNm)} nm`} />
                    <Metric label="Hull" value={`${round(instruments.now.hull)}`} />
                    <Metric label="Crew" value={`${round(instruments.now.stamina)}`} />
                    <Metric label="Morale" value={`${round(instruments.now.morale)}`} />
                  </View>
                  <Text style={styles.legLine}>
                    This leg: {round(instruments.leg.nm)} nm · wind{' '}
                    {shiftText(instruments.leg.windShiftDeg)},{' '}
                    {buildText(instruments.leg.windDeltaKn)} ·{' '}
                    {placesText(instruments.leg.placesGained)}
                  </Text>
                  {instruments.windSeries.length >= 2 ? (
                    <View style={styles.sparkRow}>
                      <Text style={styles.sparkLabel}>Wind trend</Text>
                      <Sparkline values={instruments.windSeries} />
                    </View>
                  ) : null}
                  {instruments.outlook.warn ? (
                    <Text style={styles.outlookLine}>
                      ⚠ {instruments.outlook.headline} · {round(instruments.outlook.peakKn)} kn
                      {instruments.outlook.trend === 'building' ? ' ahead' : ''}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.choices}>
                {event.choices.map((choice) => {
                  const after = vmg?.after[choice.id];
                  return (
                    <View key={choice.id} style={styles.choiceBlock}>
                      <NauticalButton
                        label={choice.label}
                        onPress={() => onSelect(choice)}
                        variant="secondary"
                        testID="decision-choice"
                      />
                      <Text style={styles.choiceDesc}>{choice.description}</Text>
                      <Text style={styles.impact}>{impactLine(choice)}</Text>
                      {vmg && after !== undefined ? (
                        <Text
                          style={[
                            styles.vmgAfter,
                            { color: vmgColor(vmg.before, after) },
                          ]}
                        >
                          {vmgArrow(vmg.before, after)} Projected VMG{' '}
                          {after.toFixed(1)} kn
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.metric}>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // Only a whisper of dimming, so the race chart behind stays legible.
    backgroundColor: 'rgba(4, 12, 22, 0.25)',
  },
  backdropNarrow: {
    justifyContent: 'flex-end',
  },
  backdropWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    padding: spacing.xl,
    // Lift the panel off the chart so it reads as a docked sheet, not an overlay.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
  },
  cardNarrow: {
    width: '100%',
    maxHeight: '74%',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  cardWide: {
    maxHeight: '92%',
    marginRight: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  cardMob: {
    borderColor: colors.signalRed,
    borderWidth: 2,
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
    marginBottom: spacing.sm,
  },
  instruments: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  instrTitle: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  instrGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metric: {
    minWidth: 56,
  },
  metricValue: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  metricLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  legLine: {
    color: colors.mist,
    fontSize: fontSize.xs,
    lineHeight: 17,
    marginTop: spacing.md,
  },
  sparkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    marginTop: spacing.sm,
  },
  vmgAfter: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
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
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  prompt: {
    color: colors.mist,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  read: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  choices: {
    gap: spacing.lg,
  },
  choiceBlock: {
    marginBottom: spacing.sm,
  },
  choiceDesc: {
    color: colors.mist,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  impact: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
});

export default TacticalDecisionModal;
