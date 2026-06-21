import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import NauticalButton from './NauticalButton';

interface TutorialOverlayProps {
  visible: boolean;
  onClose: () => void;
}

interface Item {
  dot: string;
  title: string;
  body: string;
}

const ITEMS: Item[] = [
  {
    dot: colors.signalGreen,
    title: 'The course is real',
    body: 'Green is the start, red the finish, gold dots the marks you must round. The chart shows the actual coastline.',
  },
  {
    dot: colors.white,
    title: 'Your boat & track',
    body: 'The white marker is you. The solid gold line is where you have sailed (including your tacks); the dashed line is the planned route ahead.',
  },
  {
    dot: colors.mist,
    title: 'The fleet',
    body: 'Grey dots are your rivals sailing the same wind. Your position is your real place in the fleet — beat them to the line.',
  },
  {
    dot: colors.brassLight,
    title: 'Read the wind',
    body: '"More breeze to the…" tells you where pressure is building. The navigator only routes for the wind right now, so banking toward a building shift can beat it.',
  },
  {
    dot: colors.warning,
    title: 'Effort dial',
    body: 'Push to sail faster and chase the fleet — but it wears the crew and hull and raises risk. Conserve to nurse a tired boat home.',
  },
  {
    dot: colors.steel,
    title: 'Routing dial',
    body: 'Bank Left or Right to commit to a side of the course, or leave it on Optimal to let the navigator route the fastest line.',
  },
];

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ visible, onClose }) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>How to Race</Text>
          <Text style={styles.subtitle}>
            Read the weather, set your tactics, and out-sail the fleet.
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {ITEMS.map((item) => (
              <View key={item.title} style={styles.item}>
                <View style={[styles.dot, { backgroundColor: item.dot }]} />
                <View style={styles.itemText}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemBody}>{item.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <NauticalButton label="Got it — let's race" variant="primary" onPress={onClose} />
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
    padding: spacing.lg,
    maxHeight: '88%',
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.mist,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  scroll: {
    marginBottom: spacing.md,
  },
  scrollContent: {
    gap: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    marginRight: spacing.md,
    borderWidth: 1,
    borderColor: colors.foam,
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    color: colors.brassLight,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
  itemBody: {
    color: colors.mist,
    fontSize: fontSize.sm,
    lineHeight: 19,
    marginTop: 2,
  },
});

export default TutorialOverlay;
