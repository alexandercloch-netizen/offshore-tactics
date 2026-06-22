import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MainTabParamList, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import { useAuth } from '../store/AuthContext';
import { defaultDivision, goalHeadline, recommendedRace } from '../engine/recommend';
import { getClassOption } from '../data/polarLibrary';
import NauticalButton from '../components/NauticalButton';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Race'>,
  NativeStackScreenProps<RootStackParamList>
>;

export const HomeScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, ready, prepareNextRace, selectRace } = useGame();
  const { user, displayName } = useAuth();
  const raceInProgress = !!state.progress;
  const player = state.profile.player;

  // First-run: send new players through the onboarding quiz (but never trap
  // someone mid-race or before their save has loaded).
  useEffect(() => {
    if (ready && !player && !raceInProgress) {
      navigation.navigate('Onboarding');
    }
  }, [ready, player, raceInProgress, navigation]);

  const recommended = recommendedRace(player, state.history);
  const suggestedClass =
    player?.boatType && !state.profile.fleet.some((b) => b.boatType === player.boatType)
      ? getClassOption(player.boatType)
      : undefined;

  const startNewCampaign = () => {
    prepareNextRace();
    navigation.navigate('RaceSelect');
  };

  // Jump straight into the recommended race's setup with a sensible division.
  const sailRecommended = () => {
    if (!recommended) {
      startNewCampaign();
      return;
    }
    prepareNextRace();
    selectRace(recommended.id, defaultDivision(player?.experience));
    navigation.navigate('BoatSelect');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>
          {user ? `Welcome aboard, ${displayName}` : 'A Sailing Strategy Game'}
        </Text>
        <Text style={styles.title}>OFFSHORE</Text>
        <Text style={styles.title}>TACTICS</Text>
        <Text style={styles.tagline}>{goalHeadline(player?.goal)}</Text>
      </View>

      {raceInProgress ? (
        <View style={styles.resumeCard}>
          <Text style={styles.resumeLabel}>Race underway</Text>
          <Text style={styles.resumeHint}>Pick up where you left off.</Text>
        </View>
      ) : recommended ? (
        <View style={styles.recCard}>
          <Text style={styles.recLabel}>Recommended for you</Text>
          <Text style={styles.recRace}>{recommended.name}</Text>
          <Text style={styles.recMeta}>
            {recommended.location} · {recommended.difficulty}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {raceInProgress ? (
          <>
            <NauticalButton
              label="Resume Race"
              subtitle="You have a race underway"
              onPress={() => navigation.navigate('RaceMap')}
            />
            <NauticalButton label="New Race" variant="secondary" onPress={startNewCampaign} />
          </>
        ) : (
          <>
            <NauticalButton
              label={recommended ? `Race the ${recommended.name}` : 'Start Racing'}
              onPress={sailRecommended}
            />
            <NauticalButton label="Browse All Races" variant="secondary" onPress={startNewCampaign} />
          </>
        )}
        {suggestedClass ? (
          <NauticalButton
            label={`Build your ${suggestedClass.name}`}
            subtitle="Set up the boat you sail"
            variant="secondary"
            onPress={() => navigation.navigate('BoatBuilder')}
          />
        ) : null}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { paddingHorizontal: spacing.xl },
  hero: { marginBottom: spacing.xl },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.foam,
    fontSize: fontSize.display,
    fontWeight: fontWeight.bold,
    letterSpacing: 4,
    lineHeight: 40,
  },
  tagline: {
    color: colors.mist,
    fontSize: fontSize.md,
    lineHeight: 22,
    marginTop: spacing.md,
  },
  recCard: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  recLabel: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  recRace: {
    color: colors.foam,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  recMeta: { color: colors.mist, fontSize: fontSize.sm, marginTop: 2 },
  resumeCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brassLight,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  resumeLabel: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  resumeHint: { color: colors.mist, fontSize: fontSize.sm, marginTop: spacing.xs },
  actions: { gap: spacing.md, marginBottom: spacing.xl },
});

export default HomeScreen;
