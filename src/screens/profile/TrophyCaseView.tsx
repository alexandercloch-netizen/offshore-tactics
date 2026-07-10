import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radius, spacing } from '../../theme';
import { HonourAward } from '../../engine/honours';
import { getHonourById, Honour, HONOUR_GROUPS, HONOURS } from '../../data/honours';
import HonourMedal from '../../components/profile/HonourMedal';
import { tierLabel } from '../../components/profile/honourVisuals';

// The Trophy Case — every honour, grouped, earned-first then closest-to-done.
// Props-driven (awards only) so a render test mounts it with fixtures. An earned
// tile is full-colour silverware; a locked tile is a GOAL — a dimmed medallion
// with its hint and a have/need bar, never a dead grey cell. Theme tokens only.

interface TrophyCaseViewProps {
  awards: HonourAward[];
}

interface Tile {
  honour: Honour;
  award: HonourAward;
}

const ProgressBar: React.FC<{ have: number; need: number }> = ({ have, need }) => {
  const frac = need > 0 ? Math.max(0, Math.min(1, have / need)) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.round(frac * 100)}%` }]} />
    </View>
  );
};

const HonourTile: React.FC<{ tile: Tile }> = ({ tile }) => {
  const { honour, award } = tile;
  const earned = award.earned;
  return (
    <View
      style={[styles.tile, earned ? styles.tileEarned : styles.tileLocked]}
      testID={`honour-${honour.id}`}
      accessibilityState={{ disabled: !earned }}
    >
      <View style={styles.tileHead}>
        <HonourMedal tier={honour.tier} earned={earned} size={30} />
        <View style={styles.tileTitle}>
          <Text style={[styles.tileName, !earned && styles.dim]} numberOfLines={2}>
            {honour.name}
          </Text>
          <Text style={styles.tierLabel}>{tierLabel(honour.tier)}</Text>
        </View>
      </View>
      <Text style={[styles.tileBody, !earned && styles.dim]} numberOfLines={3}>
        {earned ? honour.blurb : honour.hint}
      </Text>
      {!earned ? (
        <View style={styles.progressWrap}>
          <ProgressBar have={award.have} need={award.need} />
          <Text style={styles.progressText}>
            {award.have}/{award.need}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export const TrophyCaseView: React.FC<TrophyCaseViewProps> = ({ awards }) => {
  const byId = useMemo(() => {
    const m = new Map<string, HonourAward>();
    for (const a of awards) m.set(a.id, a);
    return m;
  }, [awards]);

  const earnedCount = awards.filter((a) => a.earned).length;
  // At zero earned the goals ARE the content — auto-reveal so the case is never
  // a grey wall; with silverware on show, keep the locked goals behind a tap.
  const [showLocked, setShowLocked] = useState(earnedCount === 0);

  const groups = HONOUR_GROUPS.map((g) => {
    const honours = HONOURS.filter((h) => h.group === g.key);
    const tiles: Tile[] = honours
      .map((h) => ({ honour: h, award: byId.get(h.id) ?? { id: h.id, earned: false, have: 0, need: 1 } }))
      // Earned first; within each, closest-to-done leads.
      .sort((a, b) => {
        if (a.award.earned !== b.award.earned) return a.award.earned ? -1 : 1;
        const ra = a.award.need > 0 ? a.award.have / a.award.need : 0;
        const rb = b.award.need > 0 ? b.award.have / b.award.need : 0;
        return rb - ra;
      });
    return { label: g.label, tiles };
  });

  const lockedTotal = awards.filter((a) => !a.earned).length;

  return (
    <View style={styles.root} testID="trophy-case">
      <View style={styles.summary}>
        <Text style={styles.summaryValue}>
          {earnedCount} / {HONOURS.length}
        </Text>
        <Text style={styles.summaryLabel}>Honours earned</Text>
      </View>

      {groups.map((group) => {
        const visible = showLocked ? group.tiles : group.tiles.filter((t) => t.award.earned);
        if (visible.length === 0) return null;
        return (
          <View key={group.label} style={styles.group} testID={`trophy-group-${group.label}`}>
            <Text style={styles.groupLabel}>{group.label}</Text>
            <View style={styles.grid}>
              {visible.map((tile) => (
                <HonourTile key={tile.honour.id} tile={tile} />
              ))}
            </View>
          </View>
        );
      })}

      {!showLocked && lockedTotal > 0 ? (
        <Pressable
          style={styles.expander}
          onPress={() => setShowLocked(true)}
          accessibilityRole="button"
          testID="trophy-show-locked"
        >
          <Text style={styles.expanderText}>Show all {lockedTotal} locked</Text>
        </Pressable>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  summary: { alignItems: 'center', marginBottom: spacing.sm },
  summaryValue: { color: colors.brassLight, fontSize: fontSize.xxl, fontWeight: fontWeight.bold },
  summaryLabel: {
    color: colors.mist,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  group: { gap: spacing.sm },
  groupLabel: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: {
    width: 168,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tileEarned: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  tileLocked: { backgroundColor: colors.deepSea, borderColor: colors.hull },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tileTitle: { flex: 1 },
  tileName: { color: colors.foam, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  tierLabel: {
    color: colors.slate,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 1,
  },
  tileBody: { color: colors.mist, fontSize: fontSize.xs, lineHeight: 16 },
  dim: { opacity: 0.7 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  track: {
    flex: 1,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.hull,
    overflow: 'hidden',
  },
  fill: { height: 5, borderRadius: radius.pill, backgroundColor: colors.brass },
  progressText: { color: colors.slate, fontSize: 10, fontVariant: ['tabular-nums'] },
  expander: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  expanderText: { color: colors.brassLight, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
});

export default TrophyCaseView;
