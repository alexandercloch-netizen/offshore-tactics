import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CompositeScreenProps } from '@react-navigation/native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FleetBoat, MainTabParamList, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { useGame } from '../store/GameContext';
import NauticalButton from '../components/NauticalButton';
import PolarViewer from '../components/PolarViewer';
import EmptyState from '../components/EmptyState';
import { confirmAction } from '../lib/confirm';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Fleet'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Median-column target angles, for a quick performance summary.
function summary(boat: FleetBoat): string {
  const mid = Math.floor(boat.polar.tws.length / 2);
  const beat = Math.round(boat.polar.targets.beatAngle[mid] ?? 0);
  const run = Math.round(boat.polar.targets.runAngle[mid] ?? 0);
  const top = Math.max(...boat.polar.speed.flat());
  return `Beat ~${beat}°  ·  Run ~${run}°  ·  Top ${top.toFixed(1)} kn`;
}

export const FleetScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, removeFleetBoat, money } = useGame();
  const fleet = state.profile.fleet;

  // The trigger says "Scrap", so the confirm says "Scrap" — one verb per act.
  const confirmScrap = (boat: FleetBoat) => {
    confirmAction({
      title: 'Scrap Boat',
      message: `Scrap ${boat.name} and strike her from your fleet?`,
      confirmLabel: 'Scrap',
      onConfirm: () => removeFleetBoat(boat.id),
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <Text style={styles.intro}>
          Your fleet of custom boats. Build them from a class or import a real polar; you own
          them outright, so there's no charter to race one. Funds: {money(state.funds)}
        </Text>

        {fleet.length === 0 ? (
          <EmptyState
            title="No custom boats yet."
            body="Build your first boat to add it to your fleet."
          />
        ) : (
          fleet.map((boat) => (
            <View key={boat.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.boatName}>{boat.name}</Text>
                  <Text style={styles.className}>
                    {boat.className} · {boat.polar.source === 'imported' ? 'imported polar' : 'class polar'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => confirmScrap(boat)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Scrap ${boat.name}`}
                >
                  <Text style={styles.remove}>Scrap</Text>
                </Pressable>
              </View>
              <Text style={styles.summary}>{summary(boat)}</Text>
              <View style={styles.viewer}>
                <PolarViewer polar={boat.polar} size={220} />
              </View>
              <Pressable
                style={styles.lockerBtn}
                accessibilityRole="button"
                accessibilityLabel={`Sail Locker for ${boat.name}`}
                onPress={() => navigation.navigate('SailLocker', { boatId: boat.id })}
              >
                <Text style={styles.lockerBtnText}>
                  Sail Locker{boat.sails && boat.sails.length > 0 ? ` · ${boat.sails.length} aboard` : ''}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <NauticalButton label="Build a Boat" onPress={() => navigation.navigate('BoatBuilder')} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
  intro: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 19, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  boatName: { color: colors.foam, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  className: { color: colors.mist, fontSize: fontSize.sm },
  remove: { color: colors.signalRed, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  summary: { color: colors.brassLight, fontSize: fontSize.sm, marginTop: spacing.xs, marginBottom: spacing.md },
  viewer: { alignItems: 'center' },
  lockerBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.steel,
    backgroundColor: colors.hull,
  },
  lockerBtnText: { color: colors.foam, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
});

export default FleetScreen;
