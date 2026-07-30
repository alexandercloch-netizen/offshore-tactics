import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Boat, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, spacing, status } from '../theme';
import { BOATS, getRaceById } from '../data';
import { isBoatOwned, ratingTccFor } from '../engine/gameEngine';
import { courseWindProfile } from '../engine/geo';
import { useGame } from '../store/GameContext';
import StatBar from '../components/StatBar';
import NauticalButton from '../components/NauticalButton';
import FunnelSteps from '../components/FunnelSteps';
import SelectableCard from '../components/SelectableCard';

type Props = NativeStackScreenProps<RootStackParamList, 'BoatSelect'>;

// How a hull suits the dominant point of sail of the chosen course — a plain
// read that helps the boat pick without pretending more precision than the
// first-order (prevailing-wind) profile carries. Display-only.
function fitNote(
  boat: Boat,
  profile: { upwind: number; reach: number; downwind: number }
): { text: string; color: string } {
  const legs: Array<['upwind' | 'reach' | 'downwind', number, string, number]> = [
    ['upwind', profile.upwind, 'upwind', boat.upwind],
    ['reach', profile.reach, 'reaching', (boat.upwind + boat.downwind) / 2],
    ['downwind', profile.downwind, 'downwind', boat.downwind],
  ];
  const [, frac, label, stat] = legs.sort((a, b) => b[1] - a[1])[0];
  const pct = Math.round(frac * 100);
  const tone = stat >= 70 ? colors.signalGreen : stat >= 50 ? colors.brassLight : colors.warning;
  const verdict = stat >= 70 ? 'suits this hull well' : stat >= 50 ? 'a fair match' : 'not this hull’s strength';
  return { text: `Mostly ${label} (${pct}% of the miles) — ${verdict}.`, color: tone };
}

export const BoatSelectScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, selectBoat, money } = useGame();
  const selectedId = state.selectedBoatId;

  // The course the player just chose (the flow is Race → Boat), so the cards can
  // say how each hull fits THIS passage. Absent only if arriving without a race.
  const race = state.selectedRaceId ? getRaceById(state.selectedRaceId) : undefined;
  const profile = race ? courseWindProfile(race.waypoints, race.prevailingWind.fromDeg) : undefined;

  const proceed = () => {
    if (!selectedId) return;
    navigation.navigate('CrewSelect');
  };

  return (
    <View style={styles.screen}>
      <FunnelSteps stage="boat" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}
      >
        <Text style={styles.intro}>
          Buy the boat that suits the course — you keep it for future races.
          Funds: {money(state.funds)}
        </Text>
        {[...state.profile.fleet, ...BOATS].map((boat: Boat) => {
          const selected = boat.id === selectedId;
          const owned = isBoatOwned(state, boat);
          const affordable = owned || state.funds >= boat.price;
          return (
            <SelectableCard
              key={boat.id}
              onPress={() => affordable && selectBoat(boat.id)}
              disabled={!affordable}
              dimmed={!affordable}
              selected={selected}
              accessibilityLabel={`${boat.name}, ${owned ? 'owned' : money(boat.price)}`}
              style={styles.card}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boatName}>{boat.name}</Text>
                  <Text style={styles.className}>{boat.className}</Text>
                </View>
                <Text style={styles.price}>
                  {owned ? 'Owned' : money(boat.price)}
                </Text>
              </View>
              <Text style={styles.description}>{boat.description}</Text>
              <View style={styles.stats}>
                <StatBar label="Base Speed" value={boat.baseSpeed} max={12} unit=" kn" />
                <StatBar label="Upwind" value={boat.upwind} />
                <StatBar label="Downwind" value={boat.downwind} />
                <StatBar label="Stability" value={boat.stability} />
              </View>
              <View style={styles.metaRow}>
                <View style={styles.metaCol}>
                  <Text style={styles.metaValue}>{ratingTccFor(boat).toFixed(3)}</Text>
                  <Text style={styles.metaLabel}>Handicap (TCC)</Text>
                </View>
                <View style={styles.crewNeed}>
                  <Text style={styles.crewNeedValue}>{boat.crewCapacity}</Text>
                  <Text style={styles.crewNeedLabel}>crew berths to fill</Text>
                </View>
              </View>
              <Text style={styles.tccGloss}>
                Corrected time = elapsed × TCC. A higher rating owes more time back —
                you win by beating your number, not by buying speed.
              </Text>
              {profile
                ? (() => {
                    const fit = fitNote(boat, profile);
                    return (
                      <Text style={[styles.fitNote, { color: fit.color }]} testID={`boat-fit-${boat.id}`}>
                        {fit.text}
                      </Text>
                    );
                  })()
                : null}
              {selected ? <Text style={styles.selectedTag}>Selected</Text> : null}
            </SelectableCard>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <NauticalButton
          label="Continue to Crew"
          onPress={proceed}
          disabled={!selectedId}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  content: {
    padding: spacing.lg,
  },
  intro: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  card: {
    marginBottom: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  boatName: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  className: {
    color: colors.mist,
    fontSize: fontSize.sm,
  },
  price: {
    color: colors.brassLight,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  description: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginVertical: spacing.sm,
  },
  stats: {
    marginTop: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
  },
  metaCol: {
    alignItems: 'flex-start',
  },
  metaValue: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  metaLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tccGloss: {
    color: colors.mist,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginTop: spacing.xs,
  },
  fitNote: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginTop: spacing.sm,
  },
  crewNeed: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
  },
  crewNeedValue: {
    color: colors.brassLight,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  crewNeedLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  selectedTag: {
    color: colors.brass,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.xs,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
});

export default BoatSelectScreen;
