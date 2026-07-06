import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, numeric, radius, spacing, status } from '../../theme';
import { LogbookStats } from '../../engine/logbook';
import { formatGap } from '../../engine/gameEngine';
import EmptyState from '../EmptyState';
import Sparkline from '../Sparkline';

// §4 The logbook — career analytics straight from state.history. Every row
// only renders when its data exists (old saves miss the newer optional
// fields), so nothing here is ever invented.

interface LogbookPanelProps {
  stats: LogbookStats;
}

const StatCell: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <View style={styles.statCell}>
    <Text style={[styles.statValue, numeric]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const StatRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, numeric]}>{value}</Text>
  </View>
);

export const LogbookPanel: React.FC<LogbookPanelProps> = ({ stats }) => (
  <View style={styles.section} testID="harbour-logbook">
    <Text style={styles.kicker}>The logbook</Text>
    {stats.finished === 0 ? (
      <EmptyState
        title="Your logbook opens with your first finish."
        body="Sail a race across the line and the career numbers start here."
        testID="logbook-empty"
      />
    ) : (
      <View style={styles.panel}>
        <View style={styles.statGrid}>
          <StatCell value={`${stats.sailed}`} label="Races" />
          <StatCell value={`${stats.finished}`} label="Finished" />
          <StatCell value={`${stats.podiums}`} label="Podiums" />
          <StatCell value={`${stats.wins}`} label="Wins" />
        </View>
        <StatRow label="Miles logged" value={`${Math.round(stats.nmLogged).toLocaleString()} nm`} />
        {stats.paceVsOptimalPct != null ? (
          // Mean of (optimal route hours ÷ sailed hours) per finished race —
          // how close each race came to the perfect line for the same boat.
          <StatRow label="Pace vs optimal route" value={`${stats.paceVsOptimalPct.toFixed(0)}%`} />
        ) : null}
        {stats.rightSailPct != null ? (
          <StatRow label="Right sail up" value={`${stats.rightSailPct.toFixed(0)}%`} />
        ) : null}
        {stats.fumbleRatePct != null ? (
          <StatRow label="Fumbled changes" value={`${stats.fumbleRatePct.toFixed(0)}%`} />
        ) : null}
        {stats.bestDuel ? (
          <StatRow
            label={`Closest duel — ${stats.bestDuel.rival}`}
            value={formatGap(stats.bestDuel.gapSeconds)}
          />
        ) : null}
        {stats.biggestWin ? (
          <StatRow
            label={`Biggest win — ${stats.biggestWin.raceName}`}
            value={formatGap(stats.biggestWin.gapSeconds)}
          />
        ) : null}
        {stats.positionSpark.length >= 2 ? (
          <View style={styles.sparkRow}>
            <Text style={styles.rowLabel}>Fleet standing, last {stats.positionSpark.length}</Text>
            <Sparkline values={stats.positionSpark} width={110} height={22} color={status.good} />
          </View>
        ) : null}
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.xl,
  },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statCell: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    color: status.labelOnPanel,
    fontSize: fontSize.xs,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
  },
  rowLabel: {
    color: colors.mist,
    fontSize: fontSize.sm,
    flexShrink: 1,
  },
  rowValue: {
    color: colors.foam,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  sparkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hull,
  },
});

export default LogbookPanel;
