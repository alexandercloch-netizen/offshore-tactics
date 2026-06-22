import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Provision, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { PROVISIONS } from '../data';
import { useGame } from '../store/GameContext';
import { campaignCost } from '../engine/gameEngine';
import NauticalButton from '../components/NauticalButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Provisioning'>;

const MAX_QTY = 9;

export const ProvisioningScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, setProvisionQuantity, beginRace, money } = useGame();

  const quantityFor = (id: string): number =>
    state.provisions.find((p) => p.provisionId === id)?.quantity ?? 0;

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
          Stock the boat for the passage. Each item boosts your crew and hull.
        </Text>
        {PROVISIONS.map((item: Provision) => {
          const qty = quantityFor(item.id);
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.category}>{item.category}</Text>
                </View>
                <Text style={styles.unit}>{money(item.unitCost)}</Text>
              </View>
              <Text style={styles.description}>{item.description}</Text>
              <View style={styles.effects}>
                {item.staminaBoost > 0 ? (
                  <Effect label={`+${item.staminaBoost} crew`} />
                ) : null}
                {item.moraleBoost > 0 ? (
                  <Effect label={`+${item.moraleBoost} morale`} />
                ) : null}
                {item.repairBoost > 0 ? (
                  <Effect label={`+${item.repairBoost} hull`} />
                ) : null}
                {item.safetyBoost > 0 ? (
                  <Effect label={`+${item.safetyBoost} safety`} />
                ) : null}
              </View>
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
    marginBottom: spacing.md,
  },
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
