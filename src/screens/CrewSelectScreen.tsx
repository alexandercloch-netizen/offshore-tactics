import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CrewMember, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { CREW, getBoatById } from '../data';
import { useGame } from '../store/GameContext';
import { crewWageTotal } from '../engine/gameEngine';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'CrewSelect'>;

export const CrewSelectScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, toggleCrew } = useGame();
  const boat = getBoatById(state.selectedBoatId);
  const capacity = boat ? boat.crewCapacity : 0;
  const selected = state.selectedCrewIds;
  const wages = crewWageTotal(selected);

  const proceed = () => {
    if (selected.length === 0) return;
    navigation.navigate('Provisioning');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          Crew: {selected.length}/{capacity}
        </Text>
        <Text style={styles.bannerWages}>
          Wages £{wages.toLocaleString()}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}>
        {CREW.map((member: CrewMember) => {
          const isSelected = selected.includes(member.id);
          const full = !isSelected && selected.length >= capacity;
          return (
            <Pressable
              key={member.id}
              onPress={() => !full && toggleCrew(member.id)}
              disabled={full}
              style={({ pressed }) => [
                styles.card,
                isSelected && styles.cardSelected,
                { opacity: full ? 0.45 : pressed ? 0.92 : 1 },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{member.name}</Text>
                  <Text style={styles.role}>{member.role}</Text>
                </View>
                <View style={styles.wageBox}>
                  <Text style={styles.wage}>£{member.wage.toLocaleString()}</Text>
                  {isSelected ? (
                    <Text style={styles.signed}>Signed</Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.bio}>{member.bio}</Text>
              <View style={styles.attrs}>
                <Attr label="Skill" value={member.skill} />
                <Attr label="Stamina" value={member.stamina} />
                <Attr label="Morale" value={member.morale} />
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <NauticalButton
          label="Continue to Provisions"
          onPress={proceed}
          disabled={selected.length === 0}
          subtitle={selected.length === 0 ? 'Sign at least one crew member' : undefined}
        />
      </View>
    </View>
  );
};

const Attr: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <View style={styles.attr}>
    <Text style={styles.attrValue}>{value}</Text>
    <Text style={styles.attrLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.abyss,
  },
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.deepSea,
    borderBottomWidth: 1,
    borderBottomColor: colors.hull,
  },
  bannerText: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  bannerWages: {
    color: colors.brassLight,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardSelected: {
    borderColor: colors.brass,
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  name: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  role: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  wageBox: {
    alignItems: 'flex-end',
  },
  wage: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  signed: {
    color: colors.brass,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  bio: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginVertical: spacing.sm,
  },
  attrs: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  attr: {
    alignItems: 'center',
  },
  attrValue: {
    color: colors.foam,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  attrLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
});

export default CrewSelectScreen;
