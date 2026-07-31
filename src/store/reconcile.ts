import { CareerRecord, GameState, RaceResult, FleetBoat } from '../types';

// Reconciling a local and a cloud save. Cloud sync is newest-wins on the save
// as a whole (by savedAt), but signing in must never silently destroy progress
// made on the other side — so the older save's campaign assets (race history,
// fleet, owned boats, hard-won funds) are merged into the newer base. This is
// what lets a player build a campaign offline, sign in, and keep it.

const savedAtOf = (s: GameState): number => s.savedAt ?? 0;

// Union two race histories, de-duplicated by race + finish time, newest first.
function mergeHistory(a: RaceResult[], b: RaceResult[]): RaceResult[] {
  const seen = new Set<string>();
  const out: RaceResult[] = [];
  for (const r of [...a, ...b]) {
    const key = `${r.raceId}|${r.timestamp}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((x, y) => y.timestamp - x.timestamp);
  return out.slice(0, 50);
}

// Union two fleets by boat id; the base boat wins on a conflict (it is newer).
function mergeFleet(base: FleetBoat[], other: FleetBoat[]): FleetBoat[] {
  const byId = new Map<string, FleetBoat>();
  for (const boat of other) byId.set(boat.id, boat);
  for (const boat of base) byId.set(boat.id, boat); // base overrides
  return [...byId.values()];
}

function union(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b])];
}

// Merge two lifetime records exploit-safely: a stale device must never LOWER a
// lifetime total (the same hazard the funds guard addresses). Every counter
// takes the higher of the two, regions union, the "best" fields take their
// better extreme (min gap, max pace), and `updatedAt` the later fold. Either
// side may be absent (an old save with no record yet); the present one wins, or
// undefined when both are absent.
function mergeCareer(base?: CareerRecord, other?: CareerRecord): CareerRecord | undefined {
  if (!base) return other;
  if (!other) return base;
  const minDefined = (x?: number, y?: number): number | undefined =>
    x != null && y != null ? Math.min(x, y) : x ?? y;
  const maxDefined = (x?: number, y?: number): number | undefined =>
    x != null && y != null ? Math.max(x, y) : x ?? y;
  return {
    racesSailed: Math.max(base.racesSailed, other.racesSailed),
    racesFinished: Math.max(base.racesFinished, other.racesFinished),
    wins: Math.max(base.wins, other.wins),
    podiums: Math.max(base.podiums, other.podiums),
    nmLogged: Math.max(base.nmLogged, other.nmLogged),
    handicapSwingWins: Math.max(base.handicapSwingWins, other.handicapSwingWins),
    photoFinishWins: Math.max(base.photoFinishWins, other.photoFinishWins),
    cleanSailRaces: Math.max(base.cleanSailRaces, other.cleanSailRaces),
    galeFinishes: Math.max(base.galeFinishes, other.galeFinishes),
    boldStoryWins: Math.max(base.boldStoryWins, other.boldStoryWins),
    scenarioRuns: Math.max(base.scenarioRuns, other.scenarioRuns),
    regionsSailed: union(base.regionsSailed, other.regionsSailed),
    bestCorrectedGapSeconds: minDefined(base.bestCorrectedGapSeconds, other.bestCorrectedGapSeconds),
    bestPaceVsOptimalPct: maxDefined(base.bestPaceVsOptimalPct, other.bestPaceVsOptimalPct),
    updatedAt: Math.max(base.updatedAt, other.updatedAt),
    // The distinct-race SETS union (a stale device can only ever add), and the
    // Corinthian counter takes the higher — same exploit-safe shape as above.
    wonRaceIds: union(base.wonRaceIds, other.wonRaceIds),
    podiumRaceIds: union(base.podiumRaceIds, other.podiumRaceIds),
    finishedRaceIds: union(base.finishedRaceIds, other.finishedRaceIds),
    corinthianOffshoreWins: maxDefined(base.corinthianOffshoreWins, other.corinthianOffshoreWins) ?? 0,
    historicEditions: union(base.historicEditions, other.historicEditions),
  };
}

// Pick the winning save and fold the other's campaign assets into it. Returns
// null only if both inputs are null. The result's live/race fields (progress,
// wind field, fleet, weather, strategy, selections) come wholesale from the
// newer base so an in-progress race is never half-merged.
//
// `unionFunds` keeps the *higher* of the two balances. That's right when folding
// a guest device save into the account it first signs into (guest→user): the
// player keeps money earned offline. It is deliberately NOT applied when
// reconciling one account's own local↔cloud across devices — there, a stale
// device's higher balance would refund money already spent while the bought boat
// stays owned (the cross-device "free boat" exploit), so newest-wins on funds.
export function reconcileSaves(
  local: GameState | null,
  cloud: GameState | null,
  unionFunds = true
): GameState | null {
  if (!local) return cloud;
  if (!cloud) return local;

  const localNewer = savedAtOf(local) >= savedAtOf(cloud);
  const base = localNewer ? local : cloud;
  const other = localNewer ? cloud : local;

  return {
    ...base,
    // Never lose campaign assets that exist only on the older side; funds only
    // union guest→user (otherwise take the newer base's balance).
    funds: unionFunds ? Math.max(base.funds, other.funds) : base.funds,
    history: mergeHistory(base.history ?? [], other.history ?? []),
    career: mergeCareer(base.career, other.career),
    ownedBoatIds: union(base.ownedBoatIds, other.ownedBoatIds),
    profile: {
      ...base.profile,
      fleet: mergeFleet(base.profile?.fleet ?? [], other.profile?.fleet ?? []),
    },
    tutorialSeen: Boolean(base.tutorialSeen || other.tutorialSeen),
    scoringSeen: Boolean(base.scoringSeen || other.scoringSeen),
    // Free Sailing is a TWO-WAY preference, so newest save wins (never OR-union —
    // that would lock the mode on forever). The fallback only covers a pre-flag
    // save on the newer side, so a set preference isn't silently dropped.
    freeSailing: base.freeSailing ?? other.freeSailing,
  };
}

// Whether `incoming` (e.g. a Realtime push from another device) is meaningfully
// newer than what we already hold, beyond a small guard against our own echo.
export function isNewerSave(
  incoming: GameState,
  current: GameState,
  guardMs = 1000
): boolean {
  return savedAtOf(incoming) > savedAtOf(current) + guardMs;
}
