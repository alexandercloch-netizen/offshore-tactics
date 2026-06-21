import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DivisionKey, Race, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { RACES, getRaceById } from '../data';
import { useGame } from '../store/GameContext';
import { formatDuration, isRaceUnlocked } from '../engine/gameEngine';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'RaceSelect'>;

const DIFFICULTY_COLOR: Record<Race['difficulty'], string> = {
  Inshore: colors.signalGreen,
  Coastal: colors.brassLight,
  Offshore: colors.warning,
  Ocean: colors.signalRed,
};

function stars(rating: number): string {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

export const RaceSelectScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, selectRace } = useGame();

  const enter = (race: Race, division: DivisionKey) => {
    selectRace(race.id, division);
    navigation.navigate('BoatSelect');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <Text style={styles.intro}>
        Funds available: £{state.funds.toLocaleString()}
      </Text>
      {RACES.map((race) => {
        const unlocked = isRaceUnlocked(race, state.history);
        const lockRace = getRaceById(race.unlockAfter);
        return (
          <View
            key={race.id}
            style={[styles.card, !unlocked && styles.cardLocked]}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.raceName}>{race.name}</Text>
              <View
                style={[
                  styles.badge,
                  { borderColor: DIFFICULTY_COLOR[race.difficulty] },
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    { color: DIFFICULTY_COLOR[race.difficulty] },
                  ]}
                >
                  {race.difficulty}
                </Text>
              </View>
            </View>
            <Text style={styles.location}>
              {race.location} • {race.season}
            </Text>
            <Text style={styles.accessibility}>
              <Text style={styles.starsText}>{stars(race.corinthianRating)}</Text>
              {'  '}Corinthian accessibility
            </Text>
            <Text style={styles.description}>{race.description}</Text>
            <Text style={styles.hazard}>⚓ {race.signatureHazard}</Text>

            <View style={styles.statsGrid}>
              <Stat label="Distance" value={`${race.distanceNm} nm`} />
              <Stat label="Marks" value={`${race.waypoints.length}`} />
              <Stat label="Record" value={formatDuration(race.recordTimeHours)} />
            </View>

            {unlocked ? (
              <View style={styles.divisions}>
                <DivisionRow
                  race={race}
                  division="corinthian"
                  funds={state.funds}
                  onEnter={() => enter(race, 'corinthian')}
                />
                <DivisionRow
                  race={race}
                  division="pro"
                  funds={state.funds}
                  onEnter={() => enter(race, 'pro')}
                />
              </View>
            ) : (
              <View style={styles.lockBox}>
                <Text style={styles.lockText}>
                  🔒 Locked — finish {lockRace ? lockRace.name : 'an earlier race'} to
                  unlock
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
};

const DivisionRow: React.FC<{
  race: Race;
  division: DivisionKey;
  funds: number;
  onEnter: () => void;
}> = ({ race, division, funds, onEnter }) => {
  const info = race.divisions[division];
  const affordable = funds >= info.entryFee;
  const label = division === 'corinthian' ? 'Corinthian' : 'Pro';
  return (
    <View style={styles.divisionRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.divisionName}>{label} Division</Text>
        <Text style={styles.divisionMeta}>
          Entry £{info.entryFee.toLocaleString()} • Purse £
          {info.prizeMoney.toLocaleString()} • {info.fleetSize} boats
        </Text>
      </View>
      <NauticalButton
        label="Enter"
        variant={division === 'pro' ? 'secondary' : 'primary'}
        onPress={onEnter}
        disabled={!affordable}
        style={styles.enterBtn}
      />
    </View>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.statItem}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

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
    fontWeight: fontWeight.medium,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardLocked: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  raceName: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    flex: 1,
    paddingRight: spacing.sm,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  location: {
    color: colors.mist,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  accessibility: {
    color: colors.mist,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  starsText: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
  },
  description: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  hazard: {
    color: colors.warning,
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  divisions: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    paddingTop: spacing.sm,
  },
  divisionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  divisionName: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  divisionMeta: {
    color: colors.mist,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  enterBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
  },
  lockBox: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    paddingTop: spacing.md,
  },
  lockText: {
    color: colors.slate,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});

export default RaceSelectScreen;
