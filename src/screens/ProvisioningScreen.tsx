import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AutoProvisionPreset, Provision, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { PROVISIONS, getRaceById } from '../data';
import { useGame } from '../store/GameContext';
import {
  autoProvision,
  campaignCost,
  estimatePassageDays,
  formatDuration,
  provisioningPlan,
  resolveBoatById,
} from '../engine/gameEngine';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Provisioning'>;

const MAX_QTY = 40;

const PRESETS: { key: AutoProvisionPreset; label: string; hint: string }[] = [
  { key: 'minimum', label: 'Minimum', hint: 'Just enough' },
  { key: 'balanced', label: 'Balanced', hint: 'Stocked + safe' },
  { key: 'bluewater', label: 'Bluewater', hint: 'Fully kitted' },
];

export const ProvisioningScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, setProvisionQuantity, setProvisions, beginRace, money } = useGame();

  const quantityFor = (id: string): number =>
    state.provisions.find((p) => p.provisionId === id)?.quantity ?? 0;

  const race = getRaceById(state.selectedRaceId);
  const boat = resolveBoatById(state, state.selectedBoatId);
  const crewCount = state.selectedCrewIds.length || boat?.crewCapacity || 1;

  // Provisioning is scaled to the crew and the length of the passage.
  const plan = race ? provisioningPlan(state.provisions, crewCount, race) : null;
  const passageDays = race ? estimatePassageDays(race) : 0;
  const crewDays = passageDays * crewCount;

  // Units of a consumable that would cover the whole passage (the recommendation).
  const recommendedUnits = (item: Provision): number =>
    item.kind === 'consumable' && item.crewDaysPerUnit
      ? Math.ceil(crewDays / item.crewDaysPerUnit)
      : 0;

  const cost = campaignCost(state);
  const remaining = state.funds - cost.total;
  const overBudget = remaining < 0;

  const setSail = () => {
    if (overBudget) return;
    // Commit the campaign (funds, wind field, fleet) and head to the briefing —
    // the calm beat before the gun to review conditions and set the plan.
    beginRace();
    navigation.reset({ index: 0, routes: [{ name: 'Briefing' }] });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.xxl }]}>
        <Text style={styles.intro}>
          Stock the boat for the passage — {crewCount} crew, about{' '}
          {formatDuration(passageDays * 24)} at sea. Carry enough food &amp; water for the
          duration; fit safety gear and spares against the rough days.
        </Text>

        {plan ? (
          <View style={styles.needs}>
            <CoverageBar label="Food" ratio={plan.foodRatio} />
            <CoverageBar label="Water" ratio={plan.waterRatio} />
          </View>
        ) : null}

        <View style={styles.autoBar}>
          <Text style={styles.autoLabel}>Auto-provision</Text>
          <View style={styles.autoRow}>
            {PRESETS.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => setProvisions(autoProvision(state, p.key))}
                style={({ pressed }) => [styles.preset, { opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.presetLabel}>{p.label}</Text>
                <Text style={styles.presetHint}>{p.hint}</Text>
              </Pressable>
            ))}
          </View>
          {state.provisions.length > 0 ? (
            <Pressable onPress={() => setProvisions([])} hitSlop={8}>
              <Text style={styles.clear}>Clear provisions</Text>
            </Pressable>
          ) : null}
        </View>

        {PROVISIONS.map((item: Provision) => {
          const qty = quantityFor(item.id);
          const rec = recommendedUnits(item);
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.category}>
                    {item.category}
                    {item.kind === 'consumable' && item.crewDaysPerUnit
                      ? ` · feeds ${item.crewDaysPerUnit} crew-days`
                      : ' · one-off fit-out'}
                  </Text>
                </View>
                <Text style={styles.unit}>{money(item.unitCost)}</Text>
              </View>
              <Text style={styles.description}>{item.description}</Text>
              <View style={styles.effects}>
                {item.moraleBoost > 0 ? <Effect label={`+${item.moraleBoost} morale`} /> : null}
                {item.staminaBoost > 0 ? <Effect label={`+${item.staminaBoost} crew`} /> : null}
                {item.repairBoost > 0 ? <Effect label="hull resilience" /> : null}
                {item.safetyBoost > 0 ? <Effect label="lower risk" /> : null}
              </View>
              {rec > 0 ? (
                <Text style={[styles.recHint, qty >= rec ? styles.recMet : undefined]}>
                  {qty >= rec ? '✓ covers the passage' : `Recommended: ${rec} for this passage`}
                </Text>
              ) : null}
              <View style={styles.stepper}>
                <StepButton
                  label="–"
                  onPress={() =>
                    setProvisionQuantity(item.id, Math.max(0, qty - 1))
                  }
                  disabled={qty <= 0}
                />
                <Text style={styles.qty}>{qty}</Text>
                <StepButton
                  label="+"
                  onPress={() =>
                    setProvisionQuantity(item.id, Math.min(MAX_QTY, qty + 1))
                  }
                  disabled={qty >= MAX_QTY}
                />
                <Text style={styles.lineCost}>
                  {money(qty * item.unitCost)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.ledger}>
          <LedgerRow label="Entry fee" value={money(cost.entryFee)} />
          <LedgerRow label={cost.charter > 0 ? 'Boat (purchase)' : 'Boat (owned)'} value={money(cost.charter)} />
          <LedgerRow label="Crew wages" value={money(cost.wages)} />
          <LedgerRow label="Provisions" value={money(cost.provisions)} />
          <View style={styles.divider} />
          <LedgerRow label="Total" value={money(cost.total)} bold />
          <LedgerRow
            label="Remaining"
            value={money(remaining)}
            bold
            danger={overBudget}
          />
        </View>
        <NauticalButton
          label="Set Sail"
          onPress={setSail}
          disabled={overBudget}
          subtitle={overBudget ? 'Over budget — trim your provisions' : undefined}
        />
      </View>
    </View>
  );
};

const Effect: React.FC<{ label: string }> = ({ label }) => (
  <View style={styles.effectChip}>
    <Text style={styles.effectText}>{label}</Text>
  </View>
);

// A food/water coverage gauge: green once the passage is covered, amber/red short.
const CoverageBar: React.FC<{ label: string; ratio: number }> = ({ label, ratio }) => {
  const pct = Math.max(0, Math.min(1, ratio));
  const covered = ratio >= 1;
  const colour = covered ? colors.signalGreen : ratio >= 0.6 ? colors.warning : colors.signalRed;
  return (
    <View style={styles.coverRow}>
      <Text style={styles.coverLabel}>{label}</Text>
      <View style={styles.coverTrack}>
        <View style={[styles.coverFill, { width: `${pct * 100}%`, backgroundColor: colour }]} />
      </View>
      <Text style={[styles.coverPct, { color: colour }]}>{Math.round(ratio * 100)}%</Text>
    </View>
  );
};

const StepButton: React.FC<{
  label: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.stepBtn,
      { opacity: disabled ? 0.35 : pressed ? 0.7 : 1 },
    ]}
  >
    <Text style={styles.stepBtnText}>{label}</Text>
  </Pressable>
);

const LedgerRow: React.FC<{
  label: string;
  value: string; // already formatted with the player's currency
  bold?: boolean;
  danger?: boolean;
}> = ({ label, value, bold, danger }) => (
  <View style={styles.ledgerRow}>
    <Text style={[styles.ledgerLabel, bold && styles.ledgerBold]}>{label}</Text>
    <Text
      style={[
        styles.ledgerValue,
        bold && styles.ledgerBold,
        danger && { color: colors.signalRed },
      ]}
    >
      {value}
    </Text>
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
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  needs: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  coverLabel: { color: colors.mist, fontSize: fontSize.xs, width: 44 },
  coverTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.navy,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
  },
  coverFill: { height: '100%', borderRadius: radius.pill },
  coverPct: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, width: 40, textAlign: 'right' },
  autoBar: { marginBottom: spacing.md },
  autoLabel: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  autoRow: { flexDirection: 'row', gap: spacing.sm },
  preset: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  presetLabel: { color: colors.brassLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  presetHint: { color: colors.slate, fontSize: fontSize.xs, marginTop: 1 },
  clear: { color: colors.slate, fontSize: fontSize.xs, marginTop: spacing.sm },
  recHint: { color: colors.warning, fontSize: fontSize.xs, marginBottom: spacing.sm },
  recMet: { color: colors.signalGreen },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
    marginBottom: spacing.md,
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
  category: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  unit: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  description: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginVertical: spacing.sm,
  },
  effects: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  effectChip: {
    backgroundColor: colors.navy,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.hull,
  },
  effectText: {
    color: colors.signalGreen,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.hull,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.steel,
  },
  stepBtnText: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  qty: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    minWidth: 24,
    textAlign: 'center',
  },
  lineCost: {
    marginLeft: 'auto',
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
  ledger: {
    marginBottom: spacing.md,
  },
  ledgerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  ledgerLabel: {
    color: colors.mist,
    fontSize: fontSize.sm,
  },
  ledgerValue: {
    color: colors.foam,
    fontSize: fontSize.sm,
  },
  ledgerBold: {
    fontWeight: fontWeight.bold,
    color: colors.foam,
  },
  divider: {
    height: 1,
    backgroundColor: colors.hull,
    marginVertical: spacing.xs,
  },
});

export default ProvisioningScreen;
