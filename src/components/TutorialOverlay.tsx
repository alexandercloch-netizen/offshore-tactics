import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';

// The first-race coaching, de-modalled: an inline strip that sits above the
// control dock — one tip at a time, never a pop-up hiding the cockpit it is
// trying to teach. The sim still holds while it shows (the screen's helpRef
// pause is unchanged); the "?" in the control dock reopens it any time.

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
    body: 'Green is the start, red the finish, gold dots the marks. The white marker is you; the gold line is where you have sailed, the dashed line the plan ahead.',
  },
  {
    dot: colors.brassLight,
    title: 'The top line is the race',
    body: 'The header shows your corrected (handicap) standing and the live gap to your nearest rival. Grey dots on the chart are the fleet sailing the same wind.',
  },
  {
    dot: colors.signalGreen,
    title: 'Read the band',
    body: "SOG is your speed, VMC your speed toward the mark. %TGT is the honest one: green means you are sailing this leg near the boat's potential. TWA reads P or S for the tack.",
  },
  {
    dot: colors.warning,
    title: 'Fly the right sail',
    body: 'Tap SAIL (or Call Sail Change) to peel. The right canvas earns real pace; the wrong one bleeds it. A fumbled change in heavy air can blow a sail out for the race.',
  },
  {
    dot: colors.steel,
    title: 'Work the dials',
    body: 'Push to chase the fleet — it wears the crew and hull. Bank Left or Right to commit to a side, or leave routing on Optimal.',
  },
  {
    dot: colors.tide,
    title: 'When a call docks, the race holds',
    body: "Decisions rise from the bottom and the clock stops — read the Navigator's hint and each option's downside before you commit. More breeze pays the bold call; a false alarm costs.",
  },
];

export const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ visible, onClose }) => {
  const [step, setStep] = useState(0);
  if (!visible) return null;
  const item = ITEMS[Math.min(step, ITEMS.length - 1)];
  const last = step >= ITEMS.length - 1;

  return (
    <View style={styles.strip} testID="coach-strip">
      <View style={[styles.dot, { backgroundColor: item.dot }]} />
      <View style={styles.text}>
        <Text style={styles.title}>
          {item.title}
          <Text style={styles.counter}>
            {'  '}
            {step + 1}/{ITEMS.length}
          </Text>
        </Text>
        <Text style={styles.body}>{item.body}</Text>
      </View>
      <View style={styles.buttons}>
        {!last ? (
          <Pressable
            onPress={() => setStep((s) => s + 1)}
            testID="coach-next"
            accessibilityRole="button"
            accessibilityLabel="Next tip"
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>Next</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            setStep(0);
            onClose();
          }}
          testID="coach-dismiss"
          accessibilityRole="button"
          accessibilityLabel="Got it, let's race"
          style={[styles.button, styles.buttonPrimary]}
        >
          <Text style={[styles.buttonLabel, styles.buttonLabelPrimary]}>Got it</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: colors.foam,
  },
  text: {
    flex: 1,
  },
  title: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  counter: {
    color: colors.slate,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
  },
  body: {
    color: colors.mist,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginTop: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  button: {
    minHeight: 44,
    minWidth: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.steel,
    paddingHorizontal: spacing.sm,
  },
  buttonPrimary: {
    backgroundColor: colors.brass,
    borderColor: colors.brassLight,
  },
  buttonLabel: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  buttonLabelPrimary: {
    color: colors.abyss,
  },
});

export default TutorialOverlay;
