import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList, Sail } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { availableSailsFor, sailCost, sailRefund } from '../data/sails';
import { effectivePolar } from '../engine/sails';
import { useGame } from '../store/GameContext';
import PolarViewer from '../components/PolarViewer';

type Props = NativeStackScreenProps<RootStackParamList, 'SailLocker'>;

const CATEGORY_LABEL: Record<Sail['category'], string> = {
  headsail: 'Headsail',
  reacher: 'Reacher',
  spinnaker: 'Spinnaker',
  stormsail: 'Storm canvas',
};

function envelope(sail: Sail): string {
  return `${sail.twaMin}–${sail.twaMax}° · ${sail.twsMin}–${sail.twsMax} kn`;
}

export const SailLockerScreen: React.FC<Props> = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, buySail, sellSail } = useGame();
  const boat = state.profile.fleet.find((b) => b.id === route.params.boatId);

  const owned = boat?.sails ?? [];
  const sails = boat ? availableSailsFor(boat.boatType) : [];

  // Base vs effective top speed, to show what the wardrobe is worth.
  const { effective, baseTop, effTop } = useMemo(() => {
    if (!boat) return { effective: null, baseTop: 0, effTop: 0 };
    const eff = effectivePolar(boat.polar, owned);
    return {
      effective: eff,
      baseTop: Math.max(...boat.polar.speed.flat()),
      effTop: Math.max(...eff.speed.flat()),
    };
  }, [boat, owned]);

  if (!boat || !effective) {
    return (
      <View style={styles.screen}>
        <Text style={styles.intro}>This boat is no longer in your fleet.</Text>
      </View>
    );
  }

  const gain = effTop - baseTop;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.boatName}>{boat.name}</Text>
        <Text style={styles.intro}>
          {boat.className} · {owned.length} specialist{' '}
          {owned.length === 1 ? 'sail' : 'sails'} aboard. Funds: £{state.funds.toLocaleString()}
        </Text>

        <View style={styles.viewer}>
          <PolarViewer polar={effective} size={240} />
          <Text style={styles.viewerNote}>
            Top speed {effTop.toFixed(1)} kn
            {gain > 0.05 ? `  (+${gain.toFixed(1)} kn from sails)` : ''}
          </Text>
        </View>

        {sails.map((sail) => {
          const isOwned = owned.includes(sail.id);
          const cost = sailCost(boat.boatType, sail);
          const refund = sailRefund(boat.boatType, sail);
          const affordable = state.funds >= cost;
          return (
            <View key={sail.id} style={[styles.card, isOwned && styles.cardOwned]}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sailName}>{sail.name}</Text>
                  <Text style={styles.sailMeta}>
                    {CATEGORY_LABEL[sail.category]} · {envelope(sail)}
                  </Text>
                  <Text style={styles.sailBlurb}>
                    {sail.blurb} · +{Math.round(sail.boost * 100)}% in its band
                  </Text>
                </View>
                {isOwned ? (
                  <Pressable
                    style={[styles.btn, styles.btnSell]}
                    onPress={() => sellSail(boat.id, sail.id, refund)}
                  >
                    <Text style={styles.btnSellText}>Sell</Text>
                    <Text style={styles.btnSubPriceSell}>+£{refund.toLocaleString()}</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.btn, styles.btnBuy, !affordable && styles.btnDisabled]}
                    disabled={!affordable}
                    onPress={() => buySail(boat.id, sail.id, cost)}
                  >
                    <Text style={styles.btnBuyText}>Buy</Text>
                    <Text style={styles.btnSubPrice}>£{cost.toLocaleString()}</Text>
                  </Pressable>
                )}
              </View>
              {isOwned ? <Text style={styles.ownedFlag}>In the wardrobe</Text> : null}
            </View>
          );
        })}

        {sails.length === 0 ? (
          <Text style={styles.intro}>No specialist sails are made for this class.</Text>
        ) : null}

        <Pressable style={styles.doneBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
  boatName: { color: colors.foam, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  intro: { color: colors.mist, fontSize: fontSize.sm, lineHeight: 19, marginTop: spacing.xs, marginBottom: spacing.md },
  viewer: { alignItems: 'center', marginBottom: spacing.lg },
  viewerNote: { color: colors.brassLight, fontSize: fontSize.sm, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardOwned: { borderColor: colors.brassLight },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  sailName: { color: colors.foam, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  sailMeta: { color: colors.slate, fontSize: fontSize.xs, marginTop: 2 },
  sailBlurb: { color: colors.mist, fontSize: fontSize.xs, marginTop: 4 },
  btn: {
    minWidth: 84,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  btnBuy: { backgroundColor: colors.brass },
  btnBuyText: { color: colors.abyss, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  btnSell: { backgroundColor: colors.hull, borderWidth: 1, borderColor: colors.steel },
  btnSellText: { color: colors.foam, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  btnSubPrice: { color: colors.abyss, fontSize: fontSize.xs, marginTop: 2 },
  btnSubPriceSell: { color: colors.mist, fontSize: fontSize.xs, marginTop: 2 },
  btnDisabled: { opacity: 0.4 },
  ownedFlag: { color: colors.brassLight, fontSize: fontSize.xs, marginTop: spacing.sm },
  doneBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
  },
  doneText: { color: colors.mist, fontSize: fontSize.md, fontWeight: fontWeight.medium },
});

export default SailLockerScreen;
