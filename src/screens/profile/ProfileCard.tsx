import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  colors,
  fontSize,
  fontWeight,
  numeric,
  radius,
  spacing,
  status,
} from '../../theme';
import { CareerRecord, Currency } from '../../types';
import { LogbookStats } from '../../engine/logbook';
import { HonourAward, SailorRank } from '../../engine/honours';
import { getHonourById, HONOURS } from '../../data/honours';
import { formatDuration, formatGap } from '../../engine/gameEngine';
import EmptyState from '../../components/EmptyState';
import Segmented from '../../components/Segmented';
import Sparkline from '../../components/Sparkline';
import NauticalButton from '../../components/NauticalButton';
import HonourMedal from '../../components/profile/HonourMedal';

// The Sailor's Card — the profile screen's dashboard. Props-driven and free of
// navigation/game context (the thin ProfileScreen wrapper wires those and
// computes the stats/career/honours), so a render test mounts it with plain
// fixtures — mirroring HarbourDashboard. Theme tokens only; every row hides when
// its data is absent, so nothing is ever invented.

export interface ProfileNamedRef {
  id: string;
  name: string;
}

export interface ProfileCardProps {
  displayName: string; // resolved: account name, guest sailing name, or a default
  isGuest: boolean;
  club?: string;
  homePortName?: string;
  rank: SailorRank;
  career: CareerRecord;
  stats: LogbookStats;
  awards: HonourAward[]; // every catalogue honour with its earned flag + progress
  best?: { raceName: string; elapsedHours: number };
  funds: number;
  money: (amount: number) => string;
  currency: Currency;
  ownedBoats: ProfileNamedRef[];
  crew: ProfileNamedRef[];
  homeWatersLabel?: string;
  goalLabel?: string;
  configured: boolean; // cloud configured (account bar shows only then)
  signedIn: boolean;
  accountName?: string;
  privacyNote: string;
  creditLine: string;
  width: number;
  twoPane?: boolean;
  onSetCurrency: (c: Currency) => void;
  onEditPreferences: () => void;
  onViewTrophyCase: () => void;
  onReset?: () => void; // undefined when there is nothing to reset
  onAccount?: () => void; // sign-in / manage account
  onRenameGuest?: (name: string) => void; // editable guest sailing name
  onNoticeBoard?: () => void; // open the feedback "message to the Race Committee"
}

const Card: React.FC<{ testID: string; children: React.ReactNode }> = ({ testID, children }) => (
  <View style={styles.card} testID={testID}>
    {children}
  </View>
);

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text style={styles.kicker}>{children}</Text>
);

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

const ProgressBar: React.FC<{ have: number; need: number }> = ({ have, need }) => {
  const frac = need > 0 ? Math.max(0, Math.min(1, have / need)) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(frac * 100)}%` }]} />
    </View>
  );
};

// The closest locked honour to completion — the "you're nearly there" nudge.
function closestLocked(awards: HonourAward[]): HonourAward | undefined {
  return awards
    .filter((a) => !a.earned && a.need > 0 && a.have > 0)
    .sort((a, b) => b.have / b.need - a.have / a.need)[0];
}

const IdentitySection: React.FC<ProfileCardProps> = (p) => (
  <Card testID="profile-identity">
    {p.isGuest && p.onRenameGuest ? (
      <TextInput
        style={styles.nameInput}
        value={p.displayName}
        onChangeText={p.onRenameGuest}
        placeholder="Your sailing name"
        placeholderTextColor={colors.slate}
        testID="identity-name-input"
      />
    ) : (
      <Text style={styles.name} testID="identity-name">
        {p.displayName}
      </Text>
    )}
    <Text style={styles.rankTitle}>{p.rank.title}</Text>
    {p.rank.next ? <Text style={styles.rankNext}>Next: {p.rank.next}</Text> : null}
    {p.club ? <Text style={styles.club}>{p.club}</Text> : null}
    {p.homePortName ? <Text style={styles.homePort}>{p.homePortName}</Text> : null}
  </Card>
);

const CareerSection: React.FC<ProfileCardProps> = (p) => {
  const c = p.career;
  if (c.racesSailed === 0) {
    return (
      <View testID="profile-career">
        <Kicker>The record</Kicker>
        <EmptyState
          title="Your logbook is empty."
          body="Sail your first race and your career record opens here."
        />
      </View>
    );
  }
  return (
    <Card testID="profile-career">
      <Kicker>The record</Kicker>
      <View style={styles.statGrid}>
        <StatCell value={`${c.racesSailed}`} label="Races" />
        <StatCell value={`${c.racesFinished}`} label="Finished" />
        <StatCell value={`${c.podiums}`} label="Podiums" />
        <StatCell value={`${c.wins}`} label="Wins" />
      </View>
      <StatRow label="Miles logged" value={`${Math.round(c.nmLogged).toLocaleString()} nm`} />
      <StatRow label="Campaign funds" value={p.money(p.funds)} />
      {p.best ? (
        <StatRow
          label={`Best result — ${p.best.raceName}`}
          value={`1st • ${formatDuration(p.best.elapsedHours)}`}
        />
      ) : null}
      {p.stats.bestDuel ? (
        <StatRow
          label={`Closest duel — ${p.stats.bestDuel.rival}`}
          value={formatGap(p.stats.bestDuel.gapSeconds)}
        />
      ) : null}
      {p.stats.biggestWin ? (
        <StatRow
          label={`Biggest win — ${p.stats.biggestWin.raceName}`}
          value={formatGap(p.stats.biggestWin.gapSeconds)}
        />
      ) : null}
    </Card>
  );
};

const HonoursSection: React.FC<ProfileCardProps> = (p) => {
  const earned = p.awards.filter((a) => a.earned);
  const medals = earned.slice(0, 4);
  const closest = closestLocked(p.awards);
  return (
    <Card testID="profile-honours-strip">
      <View style={styles.honoursHead}>
        <Kicker>Honours</Kicker>
        <Text style={styles.honoursCount}>
          {earned.length} / {HONOURS.length}
        </Text>
      </View>
      {earned.length > 0 ? (
        <View style={styles.medalRow}>
          {medals.map((a) => {
            const h = getHonourById(a.id);
            if (!h) return null;
            return (
              <View key={a.id} style={styles.medalItem}>
                <HonourMedal tier={h.tier} earned size={30} />
                <Text style={styles.medalName} numberOfLines={1}>
                  {h.name}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.honoursEmpty}>No honours earned yet — the case is a map of goals.</Text>
      )}
      {closest
        ? (() => {
            const h = getHonourById(closest.id);
            if (!h) return null;
            return (
              <View style={styles.closest}>
                <Text style={styles.closestLabel}>
                  Closest — {h.name} ({closest.have}/{closest.need})
                </Text>
                <ProgressBar have={closest.have} need={closest.need} />
              </View>
            );
          })()
        : null}
      <Text
        style={styles.link}
        accessibilityRole="button"
        onPress={p.onViewTrophyCase}
        testID="view-trophy-case"
      >
        View Trophy Case →
      </Text>
    </Card>
  );
};

const FormSection: React.FC<ProfileCardProps> = (p) => {
  const s = p.stats;
  const hasForm =
    s.positionSpark.length >= 2 ||
    s.paceVsOptimalPct != null ||
    s.rightSailPct != null ||
    s.fumbleRatePct != null;
  if (!hasForm) return null;
  return (
    <Card testID="profile-form">
      <Kicker>Form</Kicker>
      {s.positionSpark.length >= 2 ? (
        <View style={styles.sparkRow}>
          <Text style={styles.rowLabel}>Fleet standing, last {s.positionSpark.length}</Text>
          <Sparkline values={s.positionSpark} width={110} height={22} color={status.good} />
        </View>
      ) : null}
      {s.paceVsOptimalPct != null ? (
        <StatRow label="Pace vs optimal route" value={`${s.paceVsOptimalPct.toFixed(0)}%`} />
      ) : null}
      {s.rightSailPct != null ? (
        <StatRow label="Right sail up" value={`${s.rightSailPct.toFixed(0)}%`} />
      ) : null}
      {s.fumbleRatePct != null ? (
        <StatRow label="Fumbled changes" value={`${s.fumbleRatePct.toFixed(0)}%`} />
      ) : null}
    </Card>
  );
};

const ShedSection: React.FC<ProfileCardProps> = (p) => {
  if (p.ownedBoats.length === 0 && p.crew.length === 0) return null;
  const summarise = (items: ProfileNamedRef[], cap: number): string => {
    const names = items.slice(0, cap).map((i) => i.name);
    const extra = items.length - names.length;
    return extra > 0 ? `${names.join(', ')} +${extra}` : names.join(', ');
  };
  return (
    <Card testID="profile-shed">
      <Kicker>The shed</Kicker>
      {p.ownedBoats.length > 0 ? (
        <StatRow label="Boats" value={summarise(p.ownedBoats, 3)} />
      ) : null}
      {p.crew.length > 0 ? <StatRow label="Crew" value={summarise(p.crew, 3)} /> : null}
    </Card>
  );
};

const PrefsSection: React.FC<ProfileCardProps> = (p) => (
  <Card testID="profile-prefs">
    <Kicker>Preferences</Kicker>
    <View style={styles.prefRow}>
      <Text style={styles.rowLabel}>Currency</Text>
      <Segmented<Currency>
        value={p.currency}
        options={[
          { value: 'USD', label: '$ USD' },
          { value: 'EUR', label: '€ EUR' },
        ]}
        onSelect={p.onSetCurrency}
        stretch={false}
        testID="currency-toggle"
      />
    </View>
    {p.homeWatersLabel ? <StatRow label="Home waters" value={p.homeWatersLabel} /> : null}
    {p.goalLabel ? <StatRow label="Mission" value={p.goalLabel} /> : null}
    <View style={styles.prefActions}>
      <NauticalButton label="Edit Preferences" variant="secondary" onPress={p.onEditPreferences} />
    </View>
  </Card>
);

const AccountSection: React.FC<ProfileCardProps> = (p) => (
  <Card testID="profile-account">
    {p.configured ? (
      <View style={styles.accountBar}>
        <Text style={styles.accountText}>
          {p.signedIn ? `Signed in as ${p.accountName ?? p.displayName}` : 'Playing as guest'}
        </Text>
        {p.onAccount ? (
          <Text style={styles.accountAction} accessibilityRole="button" onPress={p.onAccount}>
            {p.signedIn ? 'Account' : 'Sign in'}
          </Text>
        ) : null}
      </View>
    ) : null}
    {p.onNoticeBoard ? (
      <Text
        style={styles.noticeRow}
        accessibilityRole="button"
        onPress={p.onNoticeBoard}
        testID="feedback-entry-profile"
      >
        Notice Board — message the Race Committee →
      </Text>
    ) : null}
    {p.onReset ? (
      <View style={styles.prefActions}>
        <NauticalButton label="Reset Campaign" variant="ghost" onPress={p.onReset} />
      </View>
    ) : null}
    <Text style={styles.privacy}>{p.privacyNote}</Text>
    <Text style={styles.credit}>{p.creditLine}</Text>
  </Card>
);

export const ProfileCard: React.FC<ProfileCardProps> = (props) => {
  const twoPane = props.twoPane ?? false;
  if (twoPane) {
    return (
      <View style={styles.panes} testID="profile-card">
        <View style={[styles.pane, { flex: 1 }]} testID="profile-left-pane">
          <IdentitySection {...props} />
          <CareerSection {...props} />
        </View>
        <View style={[styles.pane, { flex: 1 }]} testID="profile-right-pane">
          <HonoursSection {...props} />
          <FormSection {...props} />
          <ShedSection {...props} />
          <PrefsSection {...props} />
          <AccountSection {...props} />
        </View>
      </View>
    );
  }
  return (
    <View style={styles.column} testID="profile-card">
      <IdentitySection {...props} />
      <CareerSection {...props} />
      <HonoursSection {...props} />
      <FormSection {...props} />
      <ShedSection {...props} />
      <PrefsSection {...props} />
      <AccountSection {...props} />
    </View>
  );
};

const styles = StyleSheet.create({
  column: { gap: spacing.lg },
  panes: { flexDirection: 'row', gap: spacing.lg },
  pane: { gap: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: spacing.lg,
  },
  kicker: {
    color: colors.brassLight,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  name: { color: colors.foam, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  nameInput: {
    color: colors.foam,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    borderBottomWidth: 1,
    borderBottomColor: colors.hull,
    paddingVertical: spacing.xs,
  },
  rankTitle: {
    color: colors.brassLight,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  rankNext: { color: colors.mist, fontSize: fontSize.xs, marginTop: 2 },
  club: { color: colors.foam, fontSize: fontSize.sm, marginTop: spacing.sm },
  homePort: { color: colors.mist, fontSize: fontSize.sm, marginTop: 2 },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  statCell: { alignItems: 'center', flex: 1 },
  statValue: { color: colors.foam, fontSize: fontSize.xl, fontWeight: fontWeight.bold },
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
  rowLabel: { color: colors.mist, fontSize: fontSize.sm, flexShrink: 1 },
  rowValue: { color: colors.foam, fontSize: fontSize.sm, fontWeight: fontWeight.bold },
  honoursHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  honoursCount: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  medalRow: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.sm },
  medalItem: { alignItems: 'center', width: 62 },
  medalName: { color: colors.mist, fontSize: 10, marginTop: 4, textAlign: 'center' },
  honoursEmpty: { color: colors.mist, fontSize: fontSize.sm, marginVertical: spacing.sm },
  closest: { marginTop: spacing.sm, marginBottom: spacing.sm },
  closestLabel: { color: colors.mist, fontSize: fontSize.xs, marginBottom: spacing.xs },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.hull,
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.brass },
  link: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
  },
  sparkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  prefActions: { marginTop: spacing.md, gap: spacing.md },
  accountBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  accountText: { color: colors.mist, fontSize: fontSize.sm },
  accountAction: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    textDecorationLine: 'underline',
  },
  noticeRow: {
    color: colors.brassLight,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  privacy: { color: colors.slate, fontSize: fontSize.xs, marginTop: spacing.md, lineHeight: 16 },
  credit: { color: colors.slate, fontSize: fontSize.xs, marginTop: spacing.xs },
});

export default ProfileCard;
