import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Boat, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { BOATS } from '../data';
import { useGame } from '../store/GameContext';
import StatBar from '../components/StatBar';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'BoatSelect'>;

export const BoatSelectScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, selectBoat } = useGame();
  const selectedId = state.selectedBoatId;

  const proceed = () => {
    if (!selectedId) return;
    navigation.navigate('CrewSelect');
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}
      >
        <Text style={styles.intro}>
          Buy the boat that suits the course — you keep it for future races.
          Funds: £{state.funds.toLocaleString()}
        </Text>
        {BOATS.map((boat: Boat) => {
          const selected = boat.id === selectedId;
          const owned = state.ownedBoatIds.includes(boat.id);
          const affordable = owned || state.funds >= boat.price;
          return (
            <Pressable
              key={boat.id}
              onPress={() => affordable && selectBoat(boat.id)}
              disabled={!affordable}
              style={({ pressed }) => [
                styles.card,
                selected && styles.cardSelected,
                { opacity: !affordable ? 0.5 : pressed ? 0.92 : 1 },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boatName}>{boat.name}</Text>
                  <Text style={styles.className}>{boat.className}</Text>
                </View>
                <Text style={styles.price}>
                  {owned ? 'Owned' : `£${boat.price.toLocaleString()}`}
                </Text>
              </View>
              <Text style={styles.description}>{boat.description}</Text>
              <View style={styles.stats}>
                <StatBar label="Base Speed" value={boat.baseSpeed} max={12} unit=" kn" />
                <StatBar label="Upwind" value={boat.upwind} />
                <StatBar label="Downwind" value={boat.downwind} />
                <StatBar label="Stability" value={boat.stability} />
              </View>
              <Text style={styles.berths}>Berths: {boat.crewCapacity} crew</Text>
              {selected ? <Text style={styles.selectedTag}>Selected</Text> : null}
            </Pressable>
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
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardSelected: {
    borderColor: colors.brass,
    borderWidth: 2,
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
  berths: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
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
