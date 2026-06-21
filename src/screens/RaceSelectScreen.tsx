import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Race, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { RACES } from '../data';
import { useGame } from '../store/GameContext';
import { formatDuration } from '../engine/gameEngine';

type Props = NativeStackScreenProps<RootStackParamList, 'RaceSelect'>;

const DIFFICULTY_COLOR: Record<Race['difficulty'], string> = {
  Inshore: colors.signalGreen,
  Coastal: colors.brassLight,
  Offshore: colors.warning,
  Ocean: colors.signalRed,
};

export const RaceSelectScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, selectRace } = useGame();

  const choose = (race: Race) => {
    selectRace(race.id);
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
        const affordable = state.funds >= race.entryFee;
        return (
          <Pressable
            key={race.id}
            onPress={() => choose(race)}
            disabled={!affordable}
            style={({ pressed }) => [
              styles.card,
              { opacity: !affordable ? 0.5 : pressed ? 0.9 : 1 },
            ]}
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
            <Text style={styles.location}>{race.location}</Text>
            <Text style={styles.description}>{race.description}</Text>
            <View style={styles.statsGrid}>
              <Stat label="Distance" value={`${race.distanceNm} nm`} />
              <Stat label="Legs" value={`${race.totalLegs}`} />
              <Stat label="Fleet" value={`${race.fleetSize}`} />
              <Stat label="Record" value={formatDuration(race.recordTimeHours)} />
            </View>
            <View style={styles.money}>
              <Text style={styles.entry}>
                Entry £{race.entryFee.toLocaleString()}
              </Text>
              <Text style={styles.prize}>
                Purse £{race.prizeMoney.toLocaleString()}
              </Text>
            </View>
            {!affordable ? (
              <Text style={styles.cannotAfford}>
                Not enough funds for the entry fee
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
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
  description: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
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
  money: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
  },
  entry: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  prize: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  cannotAfford: {
    color: colors.signalRed,
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
});

export default RaceSelectScreen;
