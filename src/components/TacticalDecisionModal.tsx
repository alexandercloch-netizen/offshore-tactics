import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { GameEvent, TacticalChoice } from '../types';
import NauticalButton from './NauticalButton';

interface TacticalDecisionModalProps {
  visible: boolean;
  event: GameEvent | null;
  onSelect: (choice: TacticalChoice) => void;
}

function formatDelta(value: number, suffix = ''): string {
  if (value === 0) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value}${suffix}`;
}

function impactLine(choice: TacticalChoice): string {
  const parts: string[] = [];
  if (choice.timeDelta !== 0) {
    parts.push(`${choice.timeDelta < 0 ? '' : '+'}${choice.timeDelta}h`);
  }
  if (choice.hullDelta !== 0) parts.push(`Hull ${formatDelta(choice.hullDelta)}`);
  if (choice.staminaDelta !== 0)
    parts.push(`Crew ${formatDelta(choice.staminaDelta)}`);
  if (choice.moraleDelta !== 0)
    parts.push(`Morale ${formatDelta(choice.moraleDelta)}`);
  if (choice.risk >= 0.2) parts.push('High risk');
  else if (choice.risk >= 0.1) parts.push('Some risk');
  return parts.join('  •  ');
}

export const TacticalDecisionModal: React.FC<TacticalDecisionModalProps> = ({
  visible,
  event,
  onSelect,
}) => {
  return (
    <Modal visible={visible && !!event} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {event ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {event.pointOfSail ? (
                <Text style={styles.tag}>{event.pointOfSail}</Text>
              ) : null}
              <Text style={styles.title}>{event.title}</Text>
              <Text style={styles.prompt}>{event.prompt}</Text>
              <View style={styles.choices}>
                {event.choices.map((choice) => (
                  <View key={choice.id} style={styles.choiceBlock}>
                    <NauticalButton
                      label={choice.label}
                      onPress={() => onSelect(choice)}
                      variant="secondary"
                    />
                    <Text style={styles.choiceDesc}>{choice.description}</Text>
                    <Text style={styles.impact}>{impactLine(choice)}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.xl,
    maxHeight: '85%',
  },
  tag: {
    color: colors.abyss,
    backgroundColor: colors.brass,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  prompt: {
    color: colors.mist,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  choices: {
    gap: spacing.lg,
  },
  choiceBlock: {
    marginBottom: spacing.sm,
  },
  choiceDesc: {
    color: colors.mist,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  impact: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
});

export default TacticalDecisionModal;
