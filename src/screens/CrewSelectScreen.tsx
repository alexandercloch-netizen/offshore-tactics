import React, { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoCrewPreset, CrewMember, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import {
  autoSelectCrew,
  crewPoolForDivision,
  crewWageForDivision,
  resolveBoatById,
} from '../engine/gameEngine';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'CrewSelect'>;

const PRESETS: { key: AutoCrewPreset; label: string; hint: string }[] = [
  { key: 'veteran', label: 'Seasoned Salts', hint: 'Grizzled veterans' },
  { key: 'balanced', label: 'Balanced Watch', hint: 'Old hands & youth' },
  { key: 'novice', label: 'Young Guns', hint: 'Green & hungry' },
];

export const CrewSelectScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, toggleCrew, setCrew, money } = useGame();
  // Resolve against the catalogue AND the player's custom fleet, so a
  // self-built boat reports its real berth count rather than zero.
  const boat = resolveBoatById(state, state.selectedBoatId);
  const capacity = boat ? boat.crewCapacity : 0;
  const division = state.selectedDivision;
  const isCorinthian = division === 'corinthian';

  // Only sailors eligible for this division are on the dock: Corinthian races
  // are amateur-only, the Pro division hires professionals.
  const pool = useMemo(() => crewPoolForDivision(division), [division]);
  const selected = state.selectedCrewIds;

  // If the eligible pool changed (e.g. the player switched divisions), drop any
  // signed sailor who is no longer eligible so the roster stays legal.
  useEffect(() => {
    const legal = selected.filter((id) => pool.some((m) => m.id === id));
    if (legal.length !== selected.length) setCrew(legal);
  }, [pool, selected, setCrew]);

  const wages = crewWageForDivision(selected, division);

  const autoFill = (preset: AutoCrewPreset) => setCrew(autoSelectCrew(state, preset));

  const proceed = () => {
    if (selected.length === 0) return;
    navigation.navigate('Provisioning');
  };

  return (
    <View style={styles.screen}>
      <View style={styles.banner}>
        <View>
          <Text style={styles.bannerText}>
            Crew: {selected.length}/{capacity}
          </Text>
          <Text style={styles.bannerSub}>
            {isCorinthian ? 'Corinthian — amateurs only' : 'Pro — professionals for hire'}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.bannerWages}>{isCorinthian ? 'Unpaid' : money(wages)}</Text>
          <Text style={styles.bannerSub}>{isCorinthian ? 'No crew wages' : 'Total wages'}</Text>
        </View>
      </View>

      <View style={styles.autoBar}>
        <Text style={styles.autoLabel}>Auto-crew</Text>
        <View style={styles.autoRow}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => autoFill(p.key)}
              disabled={capacity === 0}
              style={({ pressed }) => [styles.preset, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={styles.presetLabel}>{p.label}</Text>
              <Text style={styles.presetHint}>{p.hint}</Text>
            </Pressable>
          ))}
        </View>
        {selected.length > 0 ? (
          <Pressable onPress={() => setCrew([])} hitSlop={8}>
            <Text style={styles.clear}>Clear crew</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}>
        {pool.map((member: CrewMember) => {
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
                  <Text style={styles.role}>
                    {member.role} · {member.age} · {member.homePort}
                  </Text>
                </View>
                <View style={styles.wageBox}>
                  <Text style={styles.wage}>
                    {member.tier === 'pro' ? money(member.wage) : 'Amateur'}
                  </Text>
                  {isSelected ? <Text style={styles.signed}>Signed</Text> : null}
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
          subtitle={selected.length === 0 ? 'Sign a crew, or tap an auto-crew above' : undefined}
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
  bannerSub: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  autoBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.deepSea,
    borderBottomWidth: 1,
    borderBottomColor: colors.hull,
  },
  autoLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  autoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  preset: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brass,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  presetLabel: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  presetHint: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: 2,
  },
  clear: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
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
