import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BoatType,
  ExperienceLevel,
  PlayerProfile,
  RootStackParamList,
  SailingGoal,
  SailingRegion,
  SailorRole,
} from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import {
  BOAT_CHOICES,
  Choice,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  REGION_OPTIONS,
  ROLE_OPTIONS,
} from '../data/onboarding';
import { useGame } from '../store/GameContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const STEPS = ['role', 'boat', 'region', 'goal', 'experience'] as const;
type Step = (typeof STEPS)[number];

const PROMPTS: Record<Step, { title: string; subtitle: string }> = {
  role: { title: 'How do you sail?', subtitle: 'So we can pitch the game to you.' },
  boat: { title: 'What do you sail?', subtitle: 'We’ll set up a boat to match.' },
  region: { title: 'Your home waters', subtitle: 'We’ll suggest races you’ll know.' },
  goal: { title: 'What brings you here?', subtitle: 'We’ll lead with what you want.' },
  experience: { title: 'How much racing?', subtitle: 'We’ll pitch the challenge right.' },
};

interface Draft {
  role?: SailorRole;
  boat?: BoatType | 'none';
  region?: SailingRegion;
  goal?: SailingGoal;
  experience?: ExperienceLevel;
}

export const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { setPlayerProfile } = useGame();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>({});

  const step = STEPS[stepIndex];

  const complete = (final: Draft) => {
    const profile: PlayerProfile = {
      role: final.role ?? 'fan',
      region: final.region ?? 'other',
      goal: final.goal ?? 'destress',
      experience: final.experience ?? 'club',
      boatType: final.boat && final.boat !== 'none' ? final.boat : undefined,
      onboardedAt: Date.now(),
    };
    setPlayerProfile(profile);
    // Pop back to the tabs (first run pushes Onboarding over them); fall back to
    // replacing onto Main if there's nothing to go back to.
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.replace('Main');
    }
  };

  // Record a choice for the current step, then advance (or finish on the last).
  const choose = (value: string) => {
    const next: Draft = { ...draft, [step]: value };
    setDraft(next);
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      complete(next);
    }
  };

  const back = () => {
    if (stepIndex > 0) setStepIndex(stepIndex - 1);
  };

  const options: Choice<string>[] =
    step === 'role'
      ? ROLE_OPTIONS
      : step === 'boat'
        ? BOAT_CHOICES
        : step === 'region'
          ? REGION_OPTIONS
          : step === 'goal'
            ? GOAL_OPTIONS
            : EXPERIENCE_OPTIONS;

  const selected = draft[step];
  const prompt = PROMPTS[step];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.progressRow}>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={[styles.pip, i <= stepIndex && styles.pipActive]}
            />
          ))}
        </View>
        <Text style={styles.stepCount}>
          Step {stepIndex + 1} of {STEPS.length}
        </Text>

        <Text style={styles.title}>{prompt.title}</Text>
        <Text style={styles.subtitle}>{prompt.subtitle}</Text>

        <View style={styles.grid}>
          {options.map((opt) => {
            const active = opt.value === selected;
            return (
              <Pressable
                key={opt.value}
                onPress={() => choose(opt.value)}
                style={[styles.card, active && styles.cardActive]}
              >
                <Text style={[styles.cardLabel, active && styles.cardLabelActive]}>{opt.label}</Text>
                <Text style={styles.cardBlurb}>{opt.blurb}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {stepIndex > 0 ? (
        <Pressable style={[styles.backBtn, { bottom: insets.bottom + spacing.lg }]} onPress={back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { paddingHorizontal: spacing.xl },
  progressRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  pip: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.hull,
  },
  pipActive: { backgroundColor: colors.brassLight },
  stepCount: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.xxl,
    fontWeight: fontWeight.bold,
  },
  subtitle: {
    color: colors.mist,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  card: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.lg,
  },
  cardActive: { borderColor: colors.brassLight, backgroundColor: colors.navy },
  cardLabel: { color: colors.foam, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  cardLabelActive: { color: colors.brassLight },
  cardBlurb: { color: colors.mist, fontSize: fontSize.xs, marginTop: 4 },
  backBtn: { position: 'absolute', left: spacing.xl },
  backText: { color: colors.mist, fontSize: fontSize.md, fontWeight: fontWeight.medium },
});

export default OnboardingScreen;
