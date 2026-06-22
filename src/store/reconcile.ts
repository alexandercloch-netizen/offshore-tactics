import { GameState, RaceResult, FleetBoat } from '../types';

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

// Pick the winning save and fold the other's campaign assets into it. Returns
// null only if both inputs are null. The result's live/race fields (progress,
// wind field, fleet, weather, strategy, selections) come wholesale from the
// newer base so an in-progress race is never half-merged.
export function reconcileSaves(
  local: GameState | null,
  cloud: GameState | null
): GameState | null {
  if (!local) return cloud;
  if (!cloud) return local;

  const localNewer = savedAtOf(local) >= savedAtOf(cloud);
  const base = localNewer ? local : cloud;
  const other = localNewer ? cloud : local;

  return {
    ...base,
    // Never lose money or campaign assets that exist only on the older side.
    funds: Math.max(base.funds, other.funds),
    history: mergeHistory(base.history ?? [], other.history ?? []),
    ownedBoatIds: union(base.ownedBoatIds, other.ownedBoatIds),
    profile: {
      ...base.profile,
      fleet: mergeFleet(base.profile?.fleet ?? [], other.profile?.fleet ?? []),
    },
    tutorialSeen: Boolean(base.tutorialSeen || other.tutorialSeen),
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
