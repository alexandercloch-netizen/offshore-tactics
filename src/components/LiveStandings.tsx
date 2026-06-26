import React, { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Competitor } from '../types';
import { colors, fontSize, fontWeight, radius, spacing } from '../theme';
import { correctedStandings, CorrectedStanding } from '../engine/fleet';
import { formatGap } from '../engine/gameEngine';

// The navigator's glance at the corrected-time standings: the top few boats on
// handicap, with the delta to the player. Collapsible (a tap toggles it) and
// collapsed-friendly so it never obscures the chart. The cadence is deliberately
// calm — the strip only recomputes when `cadenceKey` changes (the parent bumps it
// every couple of seconds), so it reads like a glance, not a twitchy ticker.
interface Props {
  fleet: Competitor[];
  totalNm: number;
  playerElapsedHours: number;
  playerTcc: number;
  playerName: string;
  cadenceKey: number; // changes on the calm cadence; gates the recompute
  topN?: number;
}

const LiveStandings: React.FC<Props> = ({
  fleet,
  totalNm,
  playerElapsedHours,
  playerTcc,
  playerName,
  cadenceKey,
  topN = 4,
}) => {
  const [collapsed, setCollapsed] = useState(true);

  // Recompute only on the calm cadence, not every tick. A held snapshot keeps the
  // displayed order stable between cadence beats so the strip doesn't flicker.
  const snapshot = useRef<CorrectedStanding[]>([]);
  const standings = useMemo(() => {
    snapshot.current = correctedStandings(fleet, totalNm, playerElapsedHours, playerTcc, playerName);
    return snapshot.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadenceKey]);

  if (standings.length === 0) return null;

  const playerIdx = standings.findIndex((s) => s.isPlayer);
  const playerHours = playerIdx >= 0 ? standings[playerIdx].correctedHours : 0;
  // The leaders, plus the player's own line if they're outside the top N — so a
  // glance always shows where you stand on handicap.
  const rows = standings.slice(0, topN);
  const showPlayerTail = playerIdx >= topN;

  const renderRow = (s: CorrectedStanding, place: number) => {
    const deltaH = s.correctedHours - playerHours;
    const delta =
      s.isPlayer || Math.abs(deltaH) < 1 / 3600
        ? '—'
        : `${deltaH < 0 ? '−' : '+'}${formatGap(Math.abs(deltaH) * 3600)}`;
    return (
      <View key={s.id} style={[styles.row, s.isPlayer && styles.rowPlayer]}>
        <Text style={[styles.place, s.isPlayer && styles.textPlayer]}>{place}</Text>
        <Text
          style={[styles.name, s.isPlayer && styles.textPlayer]}
          numberOfLines={1}
        >
          {s.name}
        </Text>
        <Text style={[styles.delta, s.isPlayer && styles.textPlayer]}>{delta}</Text>
      </View>
    );
  };

  return (
    <View style={styles.wrap} testID="live-standings">
      <Pressable
        onPress={() => setCollapsed((c) => !c)}
        style={styles.header}
        testID="live-standings-toggle"
      >
        <Text style={styles.title}>Corrected Standings</Text>
        <Text style={styles.chevron}>
          {collapsed ? `${standings.length} boats ▾` : 'Hide ▴'}
        </Text>
      </Pressable>
      {collapsed ? null : (
        <View style={styles.body}>
          {rows.map((s, i) => renderRow(s, i + 1))}
          {showPlayerTail ? (
            <>
              <View style={styles.ellipsis}>
                <Text style={styles.ellipsisText}>···</Text>
              </View>
              {renderRow(standings[playerIdx], playerIdx + 1)}
            </>
          ) : null}
          <Text style={styles.footnote}>on handicap (corrected) time</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.navy,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chevron: {
    color: colors.mist,
    fontSize: fontSize.xs,
  },
  body: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  rowPlayer: {
    backgroundColor: colors.hull,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    marginHorizontal: -spacing.xs,
  },
  place: {
    color: colors.slate,
    fontSize: fontSize.sm,
    width: 22,
    fontWeight: fontWeight.bold,
  },
  name: {
    flex: 1,
    color: colors.foam,
    fontSize: fontSize.sm,
  },
  delta: {
    color: colors.mist,
    fontSize: fontSize.sm,
    fontVariant: ['tabular-nums'],
  },
  textPlayer: {
    color: colors.brassLight,
    fontWeight: fontWeight.bold,
  },
  ellipsis: {
    alignItems: 'center',
    paddingVertical: 1,
  },
  ellipsisText: {
    color: colors.slate,
    fontSize: fontSize.xs,
  },
  footnote: {
    color: colors.slate,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});

export default LiveStandings;
