import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Currency, MainTabParamList, RootStackParamList } from '../types';
import { colors, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import { useAuth } from '../store/AuthContext';
import { getBoatById, getCrewById } from '../data';
import {
  defaultPortForRegion,
  getPortById,
  GOAL_OPTIONS,
  REGION_OPTIONS,
} from '../data/onboarding';
import { hydrateCareer } from '../engine/career';
import { logbookStats } from '../engine/logbook';
import { evaluateHonours, sailorRank } from '../engine/honours';
import { confirmAction } from '../lib/confirm';
import ProfileCard, { ProfileNamedRef } from './profile/ProfileCard';

// The Profile tab — a thin wrapper that wires game/auth state and computes the
// career, logbook stats and honours, then hands them to the props-driven
// ProfileCard (which the render test mounts with plain fixtures). The screen
// owns the single ScrollView and the two-pane breakpoint.

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

const TWO_PANE_WIDTH = 760;

export const ProfileScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const {
    state,
    resetCampaign,
    money,
    currency,
    setCurrency,
    setPlayerProfile,
  } = useGame();
  const { configured, user, displayName } = useAuth();

  const player = state.profile.player;
  const signedIn = Boolean(user && configured);

  // The lifetime record (hydrated so the honour SET fields are present), the
  // logbook analytics, and the honours — all pure reads off persisted state.
  const career = useMemo(() => hydrateCareer(state.career, state.history), [state.career, state.history]);
  const stats = useMemo(() => logbookStats(state.history), [state.history]);
  const awards = useMemo(() => evaluateHonours(career, state.history).awards, [career, state.history]);
  const rank = useMemo(() => sailorRank(career), [career]);

  const homePort = getPortById(player?.homePort ?? defaultPortForRegion(player?.region));

  const best = state.history.find((r) => r.finished && r.position === 1);

  // Owned boats: the raced/bought ids plus every custom build, deduped.
  const ownedBoats: ProfileNamedRef[] = useMemo(() => {
    const byId = new Map<string, ProfileNamedRef>();
    for (const id of state.ownedBoatIds) {
      const boat = getBoatById(id) ?? state.profile.fleet.find((b) => b.id === id);
      if (boat) byId.set(id, { id, name: boat.name });
    }
    for (const b of state.profile.fleet) if (!byId.has(b.id)) byId.set(b.id, { id: b.id, name: b.name });
    return [...byId.values()];
  }, [state.ownedBoatIds, state.profile.fleet]);

  const crew: ProfileNamedRef[] = useMemo(
    () =>
      state.selectedCrewIds
        .map((id) => getCrewById(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({ id: c.id, name: c.name })),
    [state.selectedCrewIds]
  );

  const guestName = player?.displayName?.trim();
  const resolvedName = signedIn
    ? displayName ?? 'Sailor'
    : guestName && guestName.length > 0
      ? player!.displayName!
      : 'Guest Skipper';

  const confirmReset = () =>
    confirmAction({
      title: 'Reset Campaign',
      message: 'This wipes your funds, fleet history and progress. Are you sure?',
      confirmLabel: 'Reset',
      onConfirm: () => resetCampaign(),
    });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
    >
      <ProfileCard
        displayName={!signedIn && player ? player.displayName ?? '' : resolvedName}
        isGuest={!signedIn}
        club={homePort?.club}
        homePortName={homePort?.name}
        rank={rank}
        career={career}
        stats={stats}
        awards={awards}
        best={best ? { raceName: best.raceName, elapsedHours: best.elapsedHours } : undefined}
        funds={state.funds}
        money={money}
        currency={currency}
        ownedBoats={ownedBoats}
        crew={crew}
        homeWatersLabel={REGION_OPTIONS.find((o) => o.value === player?.region)?.label}
        goalLabel={GOAL_OPTIONS.find((o) => o.value === player?.goal)?.label}
        configured={configured}
        signedIn={signedIn}
        accountName={displayName ?? undefined}
        privacyNote="Your logbook lives on this device unless you sign in."
        creditLine="Weather data by Open-Meteo.com"
        width={width}
        twoPane={width >= TWO_PANE_WIDTH}
        onSetCurrency={(c: Currency) => setCurrency(c)}
        onEditPreferences={() => navigation.navigate('Onboarding')}
        onViewTrophyCase={() => navigation.navigate('TrophyCase')}
        onReset={state.history.length > 0 ? confirmReset : undefined}
        onAccount={configured ? () => navigation.navigate('Auth') : undefined}
        onRenameGuest={
          !signedIn && player
            ? (name: string) => setPlayerProfile({ ...player, displayName: name })
            : undefined
        }
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
});

export default ProfileScreen;
