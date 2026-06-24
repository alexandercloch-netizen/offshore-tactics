import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import {
  RootStackParamList,
  StartApproach,
  StartBeat,
  StartEnd,
  StartOutcome,
  StartRead,
} from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { getRaceById } from '../data';
import { useGame } from '../store/GameContext';
import { navigatorSkill, raceDivision, resolveBoatById } from '../engine/gameEngine';
import { forecastConfidence } from '../engine/wind';
import { resolveStart, startRead } from '../engine/start';
import { rnd } from '../engine/rng';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'StartSequence'>;

// The race start: the most leveraged 90 seconds on the water. After the briefing,
// the skipper makes three calls — which end of the line, how hard to commit at the
// gun, and which way to go off the line — each resolved against the real wind and
// tide. Nail them and you're away in clear air on the favoured side; blow them and
// you spend the first beat clawing back through the fleet.
export const StartSequenceScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { state, beginRace, applyStart } = useGame();

  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);

  // Make sure the race (and its wind/tide field) has been seeded before we read it.
  useEffect(() => {
    if (race && boat && !state.progress) beginRace();
  }, [race, boat, state.progress, beginRace]);

  const reliable = useMemo(
    () => forecastConfidence(navigatorSkill(state.selectedCrewIds), 0.5),
    [state.selectedCrewIds]
  );
  const read: StartRead | null = useMemo(() => {
    if (!race || !state.windField) return null;
    return startRead(race, state.windField, state.tidalField, reliable);
  }, [race, state.windField, state.tidalField, reliable]);

  const [end, setEnd] = useState<StartEnd>('mid');
  const [approach, setApproach] = useState<StartApproach>('timed');
  const [beat, setBeat] = useState<StartBeat>('clear');
  const [outcome, setOutcome] = useState<StartOutcome | null>(null);

  if (!race || !boat || !state.windField || !read) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Heading out to the line…</Text>
      </View>
    );
  }

  const fleetSize = raceDivision(race, state.selectedDivision).fleetSize;
  const mapWidth = Math.min(width - spacing.lg * 2, 520);

  const cross = () => {
    setOutcome(
      resolveStart(race, state.windField!, state.tidalField, { end, approach, beat }, reliable, rnd(), fleetSize)
    );
  };

  const sail = () => {
    if (outcome) applyStart(outcome);
    navigation.reset({ index: 0, routes: [{ name: 'RaceMap' }] });
  };

  // The Navigator's read of the line, hedged by their confidence.
  const endHint =
    read.reliable < 0.5
      ? 'Hard to read the line — back your own judgement.'
      : read.favouredEnd === 'mid'
        ? 'The line looks square — no end strongly favoured.'
        : `The ${read.favouredEnd === 'committee' ? 'committee-boat (right)' : 'pin (left)'} end looks favoured.`;
  const ocsHint =
    read.ocsRisk > 0.3
      ? `A stream is setting over the line — a full send risks being over early (${Math.round(read.ocsRisk * 100)}%).`
      : null;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={{ width: mapWidth }}>
          <Text style={styles.kicker}>The Start</Text>
          <Text style={styles.raceName}>{race.name}</Text>
          <Text style={styles.sub}>Three calls before the gun. Read the line — then commit.</Text>

          <StartLineDiagram read={read} width={mapWidth} />

          {outcome ? (
            <View style={styles.resultPanel}>
              <Text style={styles.resultKicker}>{outcome.ocs ? 'OCS — OVER EARLY' : 'THE GUN'}</Text>
              <Text style={styles.resultPos}>
                {ordinal(outcome.gunPosition)}
                <Text style={styles.resultOf}> of {fleetSize} across the line</Text>
              </Text>
              <Text style={styles.resultSummary}>{outcome.summary}</Text>
              <View style={styles.ratingRow}>
                <RatingPips rating={outcome.rating} />
                <Text style={styles.ratingLabel}>{startGrade(outcome)}</Text>
              </View>
              <NauticalButton label="Sail the race" onPress={sail} />
            </View>
          ) : (
            <>
              <Text style={styles.navHint}>🧭 {endHint}</Text>

              <Decision
                step={1}
                title="Which end of the line?"
                blurb="The favoured end is further upwind — start there and you're ahead at the gun."
                value={end}
                onChange={setEnd}
                options={[
                  { value: 'pin', label: 'Pin (left)' },
                  { value: 'mid', label: 'Mid-line' },
                  { value: 'committee', label: 'Boat (right)' },
                ]}
              />

              <Decision
                step={2}
                title="How hard at the gun?"
                blurb={
                  ocsHint ??
                  'Full send wins the front row — if you time it. Mistime it and you’re OCS, back to square one.'
                }
                value={approach}
                onChange={setApproach}
                options={[
                  { value: 'hold', label: 'Hold back' },
                  { value: 'timed', label: 'Timed run' },
                  { value: 'send', label: 'Full send' },
                ]}
                warn={approach === 'send' && read.ocsRisk > 0.3}
              />

              <Decision
                step={3}
                title="First move off the line?"
                blurb="Split to the favoured side for leverage, hold for clear air, or foot off for speed."
                value={beat}
                onChange={setBeat}
                options={[
                  { value: 'favoured', label: 'Favoured side' },
                  { value: 'clear', label: 'Clear air' },
                  { value: 'speed', label: 'Foot for speed' },
                ]}
              />

              <NauticalButton label="Cross the line" onPress={cross} />
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

// ---- Start-line schematic ----
// A non-geographic diagram anchored to the wind: "up" is upwind (toward the first
// mark). The line tilts toward its favoured end, the wind blows down onto it, and
// the tide arrow shows the stream's set relative to the breeze.
const StartLineDiagram: React.FC<{ read: StartRead; width: number }> = ({ read, width }) => {
  const h = 168;
  const cx = width / 2;
  const lineY = h * 0.64;
  const half = width * 0.34;
  const tilt = read.endBias * 20; // committee (right) end lifts when it's favoured
  const committee = { x: cx + half, y: lineY - tilt };
  const pin = { x: cx - half, y: lineY + tilt };
  const glow = 0.25 + 0.5 * read.reliable;

  // Tide arrow, drawn relative to the wind ("up" on screen = where the wind is from).
  const tideRad = ((read.tideSetDeg - read.windFromDeg) * Math.PI) / 180;
  const tdx = Math.sin(tideRad);
  const tdy = -Math.cos(tideRad);
  const tLen = 14 + Math.min(read.tideRateKn / 2, 1) * 16;
  const tc = { x: cx, y: lineY - 30 };

  return (
    <View style={styles.diagram}>
      <Svg width={width} height={h}>
        <SvgText x={cx} y={16} fill={colors.mist} fontSize="10" textAnchor="middle">
          ▲ TO MARK 1
        </SvgText>
        {/* Wind blowing down onto the line. */}
        <Line x1={cx} y1={24} x2={cx} y2={lineY - 48} stroke={colors.foam} strokeWidth={2} opacity={0.7} />
        <Path
          d={`M ${cx - 4} ${lineY - 54} L ${cx} ${lineY - 46} L ${cx + 4} ${lineY - 54}`}
          stroke={colors.foam}
          strokeWidth={2}
          fill="none"
          opacity={0.7}
        />
        <SvgText x={cx + 10} y={34} fill={colors.foam} fontSize="9" opacity={0.8}>
          WIND {Math.round(read.windFromDeg)}° · {Math.round(read.windSpeedKn)} kn
        </SvgText>

        {/* Favoured-end glow (opacity scales with the Navigator's confidence). */}
        {read.favouredEnd !== 'mid' ? (
          <Circle
            cx={read.favouredEnd === 'committee' ? committee.x : pin.x}
            cy={read.favouredEnd === 'committee' ? committee.y : pin.y}
            r={20}
            fill={colors.signalGreen}
            opacity={glow * 0.5}
          />
        ) : null}

        {/* The start line. */}
        <Line x1={pin.x} y1={pin.y} x2={committee.x} y2={committee.y} stroke={colors.brassLight} strokeWidth={2.5} />

        {/* Committee boat (right) and pin (left). */}
        <Rect x={committee.x - 6} y={committee.y - 5} width={12} height={10} rx={2} fill={colors.foam} />
        <SvgText x={committee.x} y={committee.y + 22} fill={colors.mist} fontSize="9" textAnchor="middle">
          BOAT
        </SvgText>
        <Circle cx={pin.x} cy={pin.y} r={5} fill={colors.warning} />
        <SvgText x={pin.x} y={pin.y + 22} fill={colors.mist} fontSize="9" textAnchor="middle">
          PIN
        </SvgText>

        {/* Tide set. */}
        {read.tideRateKn > 0.1 ? (
          <>
            <Line
              x1={tc.x - tdx * tLen * 0.5}
              y1={tc.y - tdy * tLen * 0.5}
              x2={tc.x + tdx * tLen * 0.5}
              y2={tc.y + tdy * tLen * 0.5}
              stroke={colors.tide}
              strokeWidth={2.5}
              opacity={0.85}
            />
            <Circle cx={tc.x + tdx * tLen * 0.5} cy={tc.y + tdy * tLen * 0.5} r={2.5} fill={colors.tide} />
            <SvgText x={cx} y={h - 6} fill={colors.tide} fontSize="9" textAnchor="middle">
              TIDE {read.tideRateKn.toFixed(1)} kn
            </SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
};

// ---- Decision card ----
interface DecisionProps<T extends string> {
  step: number;
  title: string;
  blurb: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  warn?: boolean;
}
function Decision<T extends string>({ step, title, blurb, value, onChange, options, warn }: DecisionProps<T>) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardStep}>CALL {step}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={[styles.cardBlurb, warn && styles.cardBlurbWarn]}>{blurb}</Text>
      <View style={styles.segmented}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const RatingPips: React.FC<{ rating: number }> = ({ rating }) => {
  const filled = Math.max(1, Math.round(rating * 5));
  return (
    <View style={styles.pips}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={[styles.pip, i < filled && styles.pipOn]} />
      ))}
    </View>
  );
};

function startGrade(o: StartOutcome): string {
  if (o.ocs) return 'Blown';
  if (o.rating > 0.8) return 'Textbook';
  if (o.rating > 0.6) return 'Strong';
  if (o.rating > 0.4) return 'Solid';
  if (o.rating > 0.25) return 'Scrappy';
  return 'Buried';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.abyss },
  loadingText: { color: colors.mist, fontSize: fontSize.md },
  content: { padding: spacing.lg, alignItems: 'center' },
  kicker: { color: colors.brass, fontSize: fontSize.sm, fontWeight: fontWeight.bold, letterSpacing: 1 },
  raceName: { color: colors.foam, fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginTop: 2 },
  sub: { color: colors.mist, fontSize: fontSize.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  diagram: {
    backgroundColor: colors.deepSea,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  navHint: {
    color: colors.signalGreen,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardStep: { color: colors.brass, fontSize: 10, fontWeight: fontWeight.bold, letterSpacing: 1 },
  cardTitle: { color: colors.foam, fontSize: fontSize.md, fontWeight: fontWeight.bold, marginTop: 2 },
  cardBlurb: { color: colors.mist, fontSize: fontSize.sm, marginTop: spacing.xs, marginBottom: spacing.sm, lineHeight: 18 },
  cardBlurbWarn: { color: colors.warning },
  segmented: { flexDirection: 'row', backgroundColor: colors.abyss, borderRadius: radius.sm, padding: 3, gap: 3 },
  segment: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.steel },
  segmentLabel: { color: colors.mist, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  segmentLabelActive: { color: colors.white, fontWeight: fontWeight.bold },
  resultPanel: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brass,
    padding: spacing.lg,
    alignItems: 'center',
  },
  resultKicker: { color: colors.brass, fontSize: fontSize.sm, fontWeight: fontWeight.bold, letterSpacing: 1 },
  resultPos: { color: colors.foam, fontSize: 34, fontWeight: fontWeight.bold, marginTop: spacing.xs },
  resultOf: { color: colors.mist, fontSize: fontSize.md, fontWeight: fontWeight.medium },
  resultSummary: {
    color: colors.mist,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    lineHeight: 19,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  ratingLabel: { color: colors.brassLight, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  pips: { flexDirection: 'row', gap: 4 },
  pip: { width: 14, height: 6, borderRadius: 3, backgroundColor: colors.steel },
  pipOn: { backgroundColor: colors.brassLight },
});

export default StartSequenceScreen;
