import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontSize, fontWeight, numeric, radius, spacing, status } from '../../theme';
import { GameEvent, Sail, SailMode, TacticalChoice, VmgPreview } from '../../types';
import type { TacticalRead } from '../../engine/gameEngine';
import { durations, MOB_PULSE_MS, RIBBON_AUTO_CONTINUE_MS } from '../../lib/motion';
import { CompassIcon } from '../icons';

// The ONE docked lane every mid-race interruption arrives through: tactical
// decisions, the sail picker and the post-call debrief ribbon all render here,
// compressing (never covering) the chart above. A docked DECISION holds the
// watch — thinking time is the player's — but holds nothing else: the sail
// picker can borrow the lane over a held decision (which reclaims it on
// close), and every instrument stays live. The picker and the ribbon alone
// never hold. (`edgeFade` remains for any future sail-on mode; it cannot
// drain under a held card.) Only the dock translates/fades; the chart snaps
// between its idle/docked heights without animating its dimensions.

export type DockMode = 'decision' | 'sail' | 'debrief';

export interface SailOption {
  sail: Sail;
  current: boolean; // the sail already flying (tapping it dismisses — a no-op)
  recommended: boolean; // the Navigator's at-the-mark call
  coverage: number; // fit at the approach to the next mark
  minutes: number; // the manoeuvre's time cost, in minutes
}

export interface DebriefInfo {
  summary: string;
  glyph: '✓' | '✕' | '~';
  placesDelta?: number; // + gained / − lost across the call
  lostMinutes?: number;
}

interface DecisionDockProps {
  mode: DockMode;
  reducedMotion: boolean;
  maxHeight: number;
  // Decision mode.
  event?: GameEvent | null;
  vmg?: VmgPreview | null;
  read?: TacticalRead | null;
  // How much of the docked opportunity is left, 0–1 (1 = just fired, 0 = the
  // engine is about to expire it). Drives the draining bar on field-tagged
  // events; undefined hides it (MOB, or no live trigger).
  edgeFade?: number;
  storyBeat?: string;
  mobInfo?: { bearingDeg: number; rangeNm: number };
  onChoice?: (choice: TacticalChoice) => void;
  // Sail mode.
  sailOptions?: SailOption[];
  onSailPick?: (sailId: string) => void;
  // The live auto-helm mode, if any — shows an "Auto: on" note in the picker
  // header. A manual pick is a one-off override; the dial still owns the mode.
  sailAutoMode?: SailMode;
  // Debrief mode.
  debrief?: DebriefInfo;
  // Dismiss: a decision's "hold course" (retracts it, draw-free), the picker's
  // "hold course", the ribbon's tap/auto-continue. Only a MOB is never
  // dismissable — a swimmer demands an answer.
  onDismiss?: () => void;
}

function formatDelta(value: number, suffix = ''): string {
  if (value === 0) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

// Carried verbatim from the retired full-screen cockpit: the choice card's
// impact line, VMG arrow/colour and the honest band.
function impactLine(choice: TacticalChoice): string {
  const parts: string[] = [];
  if (!choice.field && choice.timeDelta !== 0)
    parts.push(`${choice.timeDelta < 0 ? '' : '+'}${choice.timeDelta}h`);
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

const DecisionDock: React.FC<DecisionDockProps> = ({
  mode,
  reducedMotion,
  maxHeight,
  event,
  vmg,
  read,
  edgeFade,
  storyBeat,
  mobInfo,
  onChoice,
  sailOptions,
  onSailPick,
  sailAutoMode,
  debrief,
  onDismiss,
}) => {
  const isMob = mode === 'decision' && event?.kind === 'mob';
  const d = durations(reducedMotion);

  // Entry motion: translate+fade in. The dock's LAYOUT height lands instantly
  // (the chart snaps, never tweens); only this transform animates.
  const entry = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    entry.setValue(0);
    Animated.timing(entry, {
      toValue: 1,
      duration: isMob ? d.mob : mode === 'debrief' ? d.ribbonIn : d.enter,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [mode, isMob, entry, d.enter, d.mob, d.ribbonIn]);

  // The MOB lead alarm: ONE pulsing red top border, under 3Hz. Reduced motion
  // holds it solid.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isMob || reducedMotion) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: MOB_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: MOB_PULSE_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isMob, pulse, reducedMotion]);

  // The debrief ribbon auto-continues on an INDEPENDENT wall-clock timer —
  // never couple this to the tick: the ribbon must move on identically whether
  // the sim is racing beneath it or held for a MOB (a tick-driven timer would
  // softlock the held case, and the e2e).
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (mode !== 'debrief') return undefined;
    const id = setTimeout(() => dismissRef.current?.(), RIBBON_AUTO_CONTINUE_MS);
    return () => clearTimeout(id);
  }, [mode]);

  const translateY = entry.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  // --- Decision content -------------------------------------------------------
  const renderChoice = (choice: TacticalChoice): React.ReactNode => {
    const after = vmg?.after[choice.id];
    const band = choice.field ? vmg?.band?.[choice.id] : undefined;
    const downside = vmg?.downside?.[choice.id];
    const hardToCall = !!band && !!vmg && band.hi - band.lo >= Math.max(vmg.before, 1) * 0.08;
    const highRisk = choice.risk >= 0.2;
    const impact = impactLine(choice);
    const riskWord = choice.risk >= 0.2 ? 'high risk' : choice.risk >= 0.1 ? 'some risk' : 'low risk';
    const a11y = [
      choice.label,
      band
        ? `Navigator projects VMG ${band.lo.toFixed(1)} to ${band.hi.toFixed(1)} knots${hardToCall ? ', hard to call' : ''}`
        : after !== undefined
          ? `projected VMG ${after.toFixed(1)} knots`
          : null,
      riskWord,
      downside ?? null,
    ]
      .filter(Boolean)
      .join(', ');
    return (
      <Pressable
        key={choice.id}
        testID="decision-choice"
        accessibilityRole="button"
        accessibilityLabel={a11y}
        onPress={() => onChoice?.(choice)}
        style={({ pressed }) => [
          styles.choiceCard,
          highRisk && styles.choiceCardRisk,
          pressed && styles.choiceCardPressed,
        ]}
      >
        <Text style={styles.choiceLabel}>{choice.label}</Text>
        <Text style={styles.choiceDesc} numberOfLines={2}>
          {choice.description}
        </Text>
        <View style={styles.choiceFoot}>
          {vmg && band && after !== undefined ? (
            <Text style={[styles.vmgAfter, { color: vmgColor(vmg.before, after) }]}>
              {vmgArrow(vmg.before, after)} VMG ~{band.lo.toFixed(1)}–{band.hi.toFixed(1)} kn
              {hardToCall ? ' — hard to call' : ''}
            </Text>
          ) : vmg && after !== undefined ? (
            <Text style={[styles.vmgAfter, { color: vmgColor(vmg.before, after) }]}>
              {vmgArrow(vmg.before, after)} VMG {after.toFixed(1)} kn
            </Text>
          ) : null}
          {impact ? <Text style={styles.impact}>{impact}</Text> : null}
        </View>
        {downside ? (
          <Text style={styles.downside} numberOfLines={1}>
            {downside}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  const hasFieldChoice = !!event && event.choices.some((c) => c.field);
  const decisionBody = event ? (
    <>
      <View style={styles.headerRow}>
        {isMob ? <Text style={styles.mobTag}>EMERGENCY</Text> : null}
        <Text style={[styles.title, isMob && { color: colors.signalRed }]} numberOfLines={1}>
          {event.title}
        </Text>
        {!isMob && onDismiss ? (
          <Pressable
            onPress={onDismiss}
            testID="decision-dismiss"
            accessibilityRole="button"
            accessibilityLabel="Hold course, let the moment pass"
            style={styles.dismissButton}
          >
            <Text style={styles.dismissLabel}>Hold course</Text>
          </Pressable>
        ) : null}
      </View>
      {isMob && mobInfo ? (
        <Text style={styles.mobSteer}>
          Swimmer bearing {Math.round(mobInfo.bearingDeg)}° · {mobInfo.rangeNm.toFixed(2)} nm
        </Text>
      ) : null}
      <Text style={styles.prompt} numberOfLines={2}>
        {event.prompt}
      </Text>
      {storyBeat ? (
        <StoryBeatRibbon body={storyBeat} />
      ) : null}
      {read && hasFieldChoice ? (
        <View style={styles.readRow}>
          <CompassIcon size={14} color={colors.brassLight} />
          <Text style={styles.read} numberOfLines={1}>
            Navigator: {read.hint}
          </Text>
        </View>
      ) : null}
      {edgeFade !== undefined && hasFieldChoice ? (
        // The race sails on under the cards: the spotted edge drains with
        // every length past the trigger. The bar IS the engine's edgeDecay —
        // empty exactly where the event expires, so the UI never promises an
        // edge the resolution won't pay.
        <View style={styles.fadeRow} testID="edge-fade">
          <View style={styles.fadeTrack}>
            <View
              style={[
                styles.fadeFill,
                edgeFade < 0.35 && styles.fadeFillLow,
                { width: `${Math.round(edgeFade * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.fadeLabel}>{edgeFade < 0.6 ? 'edge fading' : 'edge holding'}</Text>
        </View>
      ) : null}
      <View style={styles.choices}>{event.choices.map(renderChoice)}</View>
    </>
  ) : null;

  // --- Sail picker content ----------------------------------------------------
  const sailBody = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Which sail?</Text>
        {sailAutoMode && sailAutoMode !== 'manual' ? (
          <Text
            style={styles.autoIndicator}
            testID="sail-auto-indicator"
            accessibilityLabel={`Auto-helm on, ${sailAutoMode}. A pick here overrides once.`}
          >
            Auto: on
          </Text>
        ) : null}
        <Pressable
          onPress={onDismiss}
          testID="sail-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Hold course, keep the current sail"
          style={styles.dismissButton}
        >
          <Text style={styles.dismissLabel}>Hold course</Text>
        </Pressable>
      </View>
      {(sailOptions ?? []).map((opt) => {
        const covPct = Math.round(opt.coverage * 100);
        const covWord =
          opt.sail.boost <= 0
            ? 'always safe'
            : covPct >= 75
              ? 'in its groove at the mark'
              : covPct >= 35
                ? 'marginal at the mark'
                : 'wrong for the approach';
        return (
          <Pressable
            key={opt.sail.id}
            testID="sail-change-choice"
            accessibilityRole="button"
            accessibilityState={{ selected: opt.current }}
            accessibilityLabel={`${opt.sail.name}, ${covWord}${
              opt.current ? ', currently flying' : `, about ${opt.minutes} minutes to change`
            }${opt.recommended ? ', Navigator recommends' : ''}`}
            onPress={() => (opt.current ? onDismiss?.() : onSailPick?.(opt.sail.id))}
            style={({ pressed }) => [
              styles.sailRow,
              opt.recommended && styles.sailRowRecommended,
              opt.current && styles.sailRowCurrent,
              pressed && styles.choiceCardPressed,
            ]}
          >
            <Text style={styles.sailGlyph}>{CATEGORY_GLYPH[opt.sail.category] ?? '⛵'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceLabel} numberOfLines={1}>
                {opt.sail.name}
                {opt.current ? '  · flying' : ''}
                {opt.recommended && !opt.current ? '  · recommended' : ''}
              </Text>
              <Text style={styles.choiceDesc} numberOfLines={1}>
                {opt.sail.blurb}
              </Text>
            </View>
            <View style={styles.sailMeta}>
              <Text
                style={[
                  styles.coverageBadge,
                  opt.sail.boost > 0 && covPct < 35 ? { color: status.bad } : null,
                  opt.sail.boost > 0 && covPct >= 35 && covPct < 75 ? { color: status.warn } : null,
                ]}
              >
                {opt.sail.boost <= 0 ? '—' : `${covPct}%`}
              </Text>
              {!opt.current ? <Text style={styles.costLine}>~{opt.minutes}m</Text> : null}
            </View>
          </Pressable>
        );
      })}
      <Text style={styles.pickerFootnote}>Fit shown for the approach to the next mark.</Text>
    </>
  );

  // --- Debrief ribbon -----------------------------------------------------------
  const debriefBody = debrief ? (
    <Pressable
      onPress={onDismiss}
      testID="debrief-ribbon"
      accessibilityRole="button"
      accessibilityLabel={`${debrief.summary}. Tap to continue`}
      style={styles.debriefRow}
    >
      <Text
        style={[
          styles.debriefGlyph,
          debrief.glyph === '✓' ? { color: status.good } : null,
          debrief.glyph === '✕' ? { color: status.bad } : null,
        ]}
      >
        {debrief.glyph}
      </Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.debriefSummary}>{debrief.summary}</Text>
        <Text style={styles.debriefMeta}>
          {debrief.placesDelta !== undefined && debrief.placesDelta !== 0
            ? `${debrief.placesDelta > 0 ? '▲ gained' : '▼ lost'} ${Math.abs(debrief.placesDelta)} ${
                Math.abs(debrief.placesDelta) === 1 ? 'place' : 'places'
              } · `
            : ''}
          {debrief.lostMinutes ? `~${debrief.lostMinutes}m lost · ` : ''}
          tap to sail on
        </Text>
      </View>
    </Pressable>
  ) : null;

  const body = mode === 'decision' ? decisionBody : mode === 'sail' ? sailBody : debriefBody;

  return (
    <Animated.View
      testID="decision-dock"
      style={[
        styles.dock,
        { maxHeight, opacity: entry, transform: [{ translateY }] },
        isMob && styles.dockMob,
      ]}
    >
      {isMob ? (
        <Animated.View style={[styles.mobBorder, { opacity: pulse }]} />
      ) : null}
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
    </Animated.View>
  );
};

const CATEGORY_GLYPH: Record<string, string> = {
  headsail: '▲',
  reacher: '◆',
  spinnaker: '●',
  stormsail: '■',
};

// The signature event's narrative beat: collapsed to a single tappable line on
// a phone, expanding in place (a reader's pause is what the pause button is for
// — the race no longer waits).
const StoryBeatRibbon: React.FC<{ body: string }> = ({ body }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      accessibilityRole="button"
      accessibilityLabel={open ? 'Collapse the story' : 'Expand the story'}
      style={styles.beatRow}
    >
      <Text style={styles.beatText} numberOfLines={open ? undefined : 1}>
        {body}
      </Text>
      <Text style={styles.beatChevron}>{open ? '▴' : '▾'}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.deepSea,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  dockMob: {
    borderTopWidth: 0,
  },
  mobBorder: {
    height: 3,
    backgroundColor: colors.signalRed,
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  mobTag: {
    color: colors.white,
    backgroundColor: colors.signalRed,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  mobSteer: {
    color: colors.signalRed,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    ...numeric,
  },
  prompt: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 19,
  },
  beatRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.navy,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  beatText: {
    flex: 1,
    color: colors.mist,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  beatChevron: {
    color: colors.slate,
    fontSize: fontSize.xs,
  },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  // The edge's draining bar.
  fadeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fadeTrack: {
    flex: 1,
    height: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.navy,
    overflow: 'hidden',
  },
  fadeFill: {
    height: 3,
    backgroundColor: colors.brassLight,
  },
  fadeFillLow: {
    backgroundColor: status.warn,
  },
  fadeLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  read: {
    flex: 1,
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  choices: {
    gap: spacing.sm,
  },
  choiceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    minHeight: 56,
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
    marginTop: 2,
  },
  choiceFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  vmgAfter: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    ...numeric,
  },
  impact: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  downside: {
    color: colors.mist,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  // Sail picker.
  dismissButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  dismissLabel: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  sailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  sailRowRecommended: {
    borderColor: colors.brassLight,
  },
  sailRowCurrent: {
    opacity: 0.65,
  },
  sailGlyph: {
    color: colors.brassLight,
    fontSize: fontSize.md,
    width: 18,
    textAlign: 'center',
  },
  sailMeta: {
    alignItems: 'flex-end',
  },
  coverageBadge: {
    color: colors.signalGreen,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    ...numeric,
  },
  costLine: {
    color: colors.slate,
    fontSize: fontSize.xs,
    ...numeric,
  },
  pickerFootnote: {
    color: colors.slate,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
  },
  autoIndicator: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Debrief ribbon.
  debriefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 56,
  },
  debriefGlyph: {
    color: colors.mist,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    width: 28,
    textAlign: 'center',
  },
  debriefSummary: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    lineHeight: 19,
  },
  debriefMeta: {
    color: colors.slate,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
});

export default DecisionDock;
