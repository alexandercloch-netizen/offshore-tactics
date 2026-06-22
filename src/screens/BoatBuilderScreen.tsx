import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoatPolar, BoatType, FleetBoat, RootStackParamList } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { CLASS_LIBRARY, getClassOption } from '../data/polarLibrary';
import { parsePolar } from '../engine/polarImport';
import { useGame } from '../store/GameContext';
import NauticalButton from '../components/NauticalButton';
import PolarViewer from '../components/PolarViewer';

type Props = NativeStackScreenProps<RootStackParamList, 'BoatBuilder'>;

const IMPORT_BUILD_COST = 20000;
const CREW_BY_TYPE: Record<BoatType, number> = {
  cruiserRacerIRC: 8,
  tp52: 12,
  class40: 4,
  maxi72: 18,
};

export const BoatBuilderScreen: React.FC<Props> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { state, addFleetBoat } = useGame();

  const [mode, setMode] = useState<'class' | 'import'>('class');
  const [boatType, setBoatType] = useState<BoatType>('cruiserRacerIRC');
  const [name, setName] = useState('');
  const [upPct, setUpPct] = useState(100);
  const [downPct, setDownPct] = useState(100);
  const [importText, setImportText] = useState('');
  const [parsed, setParsed] = useState<BoatPolar | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classOption = getClassOption(boatType);

  // The polar to preview/build: a class table or the imported one.
  const polar: BoatPolar | null = mode === 'class' ? classOption?.polar ?? null : parsed;
  const cost = mode === 'class' ? classOption?.price ?? 0 : IMPORT_BUILD_COST;
  const affordable = state.funds >= cost;
  const defaultName = mode === 'class' ? classOption?.name ?? 'Custom Boat' : 'Imported Boat';

  const onParse = () => {
    const result = parsePolar(importText);
    if (result.ok && result.polar) {
      setParsed(result.polar);
      setError(null);
    } else {
      setParsed(null);
      setError(result.error ?? 'Could not read that polar.');
    }
  };

  const onBuild = () => {
    if (!polar || !affordable) return;
    const boat: FleetBoat = {
      id: `fleet-${Date.now()}`,
      name: name.trim() || defaultName,
      className: classOption && mode === 'class' ? classOption.className : 'Custom',
      description:
        mode === 'class'
          ? classOption?.description ?? ''
          : 'A custom boat built from an imported polar.',
      baseSpeed: mode === 'class' ? classOption?.baseSpeed ?? 8 : Math.round(Math.max(...polar.speed.flat())),
      upwind: mode === 'class' ? classOption?.upwind ?? 70 : 75,
      downwind: mode === 'class' ? classOption?.downwind ?? 70 : 78,
      stability: mode === 'class' ? classOption?.stability ?? 65 : 65,
      crewCapacity: CREW_BY_TYPE[boatType],
      price: cost,
      custom: true,
      boatType,
      polar,
      speedAdjustment: { upwindPct: upPct, downwindPct: downPct, nightPct: 100 },
      sails: [],
    };
    addFleetBoat(boat, cost);
    navigation.navigate('Main', { screen: 'Fleet' });
  };

  const sampleHint = useMemo(
    () => 'Paste a polar: a TWA×TWS grid (PredictWind/generic) or Expedition/ORC lines.',
    []
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <Segmented
          value={mode}
          options={[
            { value: 'class', label: 'From a Class' },
            { value: 'import', label: 'Import Polar' },
          ]}
          onSelect={(m) => {
            setMode(m);
            setError(null);
          }}
        />

        {mode === 'class' ? (
          <View style={styles.section}>
            <Text style={styles.label}>Starting class</Text>
            {CLASS_LIBRARY.map((opt) => {
              const active = opt.boatType === boatType;
              return (
                <Pressable
                  key={opt.boatType}
                  onPress={() => setBoatType(opt.boatType)}
                  style={[styles.classCard, active && styles.classCardActive]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.classCardName}>{opt.name}</Text>
                    <Text style={styles.classCardDesc}>{opt.description}</Text>
                  </View>
                  <Text style={styles.classCardPrice}>£{opt.price.toLocaleString()}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.label}>Polar data</Text>
            <Text style={styles.hint}>{sampleHint}</Text>
            <TextInput
              style={styles.textArea}
              value={importText}
              onChangeText={setImportText}
              placeholder={'TWA\\TWS,6,8,10,12\n52,4.8,5.4,5.9,6.2\n...'}
              placeholderTextColor={colors.slate}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <NauticalButton label="Parse Polar" variant="secondary" onPress={onParse} />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {parsed ? (
              <View style={styles.typeRow}>
                {(Object.keys(CREW_BY_TYPE) as BoatType[]).map((t) => (
                  <Pressable
                    key={t}
                    onPress={() => setBoatType(t)}
                    style={[styles.typeChip, boatType === t && styles.typeChipActive]}
                  >
                    <Text style={[styles.typeChipText, boatType === t && styles.typeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        )}

        {polar ? (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={defaultName}
                placeholderTextColor={colors.slate}
              />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Performance</Text>
              <Stepper label="Upwind" value={upPct} onChange={setUpPct} />
              <Stepper label="Downwind" value={downPct} onChange={setDownPct} />
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Polar preview</Text>
              <View style={{ alignItems: 'center' }}>
                <PolarViewer polar={polar} size={240} />
              </View>
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <NauticalButton
          label={polar ? `Build — £${cost.toLocaleString()}` : 'Build'}
          onPress={onBuild}
          disabled={!polar || !affordable}
        />
        {!affordable && polar ? <Text style={styles.error}>Not enough funds.</Text> : null}
      </View>
    </View>
  );
};

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.max(60, Math.min(110, v));
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(clamp(value - 5))}>
        <Text style={styles.stepBtnText}>–</Text>
      </Pressable>
      <Text style={styles.stepperValue}>{value}%</Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(clamp(value + 5))}>
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

interface SegProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onSelect: (v: T) => void;
}
function Segmented<T extends string>({ value, options, onSelect }: SegProps<T>) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onSelect(o.value)} style={[styles.segment, active && styles.segmentActive]}>
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.abyss },
  content: { padding: spacing.lg },
  section: { marginTop: spacing.lg },
  label: {
    color: colors.slate,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  hint: { color: colors.mist, fontSize: fontSize.xs, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    color: colors.foam,
    padding: spacing.md,
    fontSize: fontSize.md,
  },
  textArea: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    color: colors.foam,
    padding: spacing.md,
    fontSize: fontSize.sm,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  error: { color: colors.signalRed, fontSize: fontSize.sm, marginTop: spacing.sm },
  classCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  classCardActive: { borderColor: colors.brassLight, backgroundColor: colors.navy },
  classCardName: { color: colors.foam, fontSize: fontSize.md, fontWeight: fontWeight.bold },
  classCardDesc: { color: colors.mist, fontSize: fontSize.xs, marginTop: 2 },
  classCardPrice: { color: colors.brassLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginLeft: spacing.sm },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.hull,
    backgroundColor: colors.navy,
  },
  typeChipActive: { borderColor: colors.brassLight },
  typeChipText: { color: colors.mist, fontSize: fontSize.xs },
  typeChipTextActive: { color: colors.brassLight, fontWeight: fontWeight.bold },
  stepper: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  stepperLabel: { color: colors.foam, fontSize: fontSize.sm, flex: 1 },
  stepperValue: { color: colors.brassLight, fontSize: fontSize.md, fontWeight: fontWeight.bold, width: 56, textAlign: 'center' },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.steel,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.hull,
  },
  stepBtnText: { color: colors.foam, fontSize: fontSize.lg, fontWeight: fontWeight.bold },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.hull,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: spacing.md, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.hull },
  segmentLabel: { color: colors.mist, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  segmentLabelActive: { color: colors.brassLight, fontWeight: fontWeight.bold },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
    backgroundColor: colors.deepSea,
  },
});

export default BoatBuilderScreen;
