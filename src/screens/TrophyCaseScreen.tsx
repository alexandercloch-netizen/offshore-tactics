import React, { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../types';
import { colors, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import { hydrateCareer } from '../engine/career';
import { evaluateHonours } from '../engine/honours';
import TrophyCaseView from './profile/TrophyCaseView';

// The Trophy Case route — a thin wrapper computing the current honour awards and
// handing them to the props-driven view. Pushed over the profile, guest-first.

type Props = NativeStackScreenProps<RootStackParamList, 'TrophyCase'>;

export const TrophyCaseScreen: React.FC<Props> = () => {
  const insets = useSafeAreaInsets();
  const { state } = useGame();
  const awards = useMemo(() => {
    const career = hydrateCareer(state.career, state.history);
    return evaluateHonours(career, state.history).awards;
  }, [state.career, state.history]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <TrophyCaseView awards={awards} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
});

export default TrophyCaseScreen;
