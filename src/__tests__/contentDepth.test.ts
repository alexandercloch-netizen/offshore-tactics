import {
  EVENTS,
  FOLLOWON_EVENTS,
  GENERIC_EVENTS,
  MORALE_EVENTS,
  RACE_REGION,
  WEATHER_EVENTS,
  hazardEventForRace,
  pickEventForRace,
} from '../data/events';
import { STORYLINES } from '../data/storylines';
import { RACES } from '../data/races';
import { mulberry32, resetRng, setRng } from '../engine/rng';
import { GameEvent } from '../types';

// ---------------------------------------------------------------------------
// CONTENT DEPTH — the per-race authored-content floor, enforced so a future race
// can't ship thin. Every race must carry: a storyline (storyline.test pins the
// rest of that contract), a signature decision that OPENS an act-two situation
// (a `sets` key some follow-on answers), and a bank of region-fitting everyday
// decisions — local knowledge the picker prefers on home waters.
//
// THE GOLDEN EXEMPTION: the three determinism-contract courses (goldenRace.test)
// are exempt from the region-event floor. Their everyday candidate pools are
// pinned byte-for-byte — a new eligible event on those courses would re-deal
// every draw and move pins that must never move to taste. Their depth comes from
// the act-two chain (hung off a choice the pinned runs never take) and the
// storyline itself. If a golden course is ever re-pinned deliberately, it can
// then graduate into the floor below.
// ---------------------------------------------------------------------------

afterEach(() => resetRng());

const GOLDEN_COURSES = new Set(['race-round-island', 'race-fastnet', 'race-sydney-hobart']);
const REGION_EVENT_FLOOR = 4;

// The set of `sets` keys any choice anywhere can open.
function allSetsKeys(): Set<string> {
  const keys = new Set<string>();
  for (const race of RACES) {
    for (const c of hazardEventForRace(race).choices) if (c.sets) keys.add(c.sets);
  }
  for (const e of EVENTS) for (const c of e.choices) if (c.sets) keys.add(c.sets);
  return keys;
}

// Everyday events that would FIT a race's context (mirrors eventFits's region
// rule: untagged fits everywhere; tagged needs the race id or its region key).
function regionFitting(raceId: string): GameEvent[] {
  const region = RACE_REGION[raceId];
  const pool = [...WEATHER_EVENTS, ...MORALE_EVENTS, ...GENERIC_EVENTS];
  return pool.filter((e) => e.regions && e.regions.some((r) => r === raceId || r === region));
}

describe('content depth — every race carries its full kit', () => {
  it('every race has a storyline (count pinned here too, not just in storyline.test)', () => {
    expect(STORYLINES).toHaveLength(RACES.length);
  });

  it("every race's signature decision opens an act-two situation with a real follow-on", () => {
    const followKeys = new Set(FOLLOWON_EVENTS.map((e) => e.followsFrom));
    const failures: string[] = [];
    for (const race of RACES) {
      const sig = hazardEventForRace(race);
      const opened = sig.choices.filter((c) => c.sets).map((c) => c.sets!);
      if (opened.length === 0) {
        failures.push(`${race.id}: signature '${sig.id}' opens no situation (no choice has 'sets')`);
        continue;
      }
      if (!opened.some((k) => followKeys.has(k))) {
        failures.push(`${race.id}: no follow-on answers ${JSON.stringify(opened)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('no follow-on is orphaned (its followsFrom key is set by some choice)', () => {
    const openable = allSetsKeys();
    const orphans = FOLLOWON_EVENTS.filter((e) => e.followsFrom && !openable.has(e.followsFrom));
    expect(orphans.map((e) => e.id)).toEqual([]);
  });

  it(`every non-golden race has ≥${REGION_EVENT_FLOOR} region-fitting everyday events`, () => {
    const failures: string[] = [];
    for (const race of RACES) {
      if (GOLDEN_COURSES.has(race.id)) continue;
      const n = regionFitting(race.id).length;
      if (n < REGION_EVENT_FLOOR) failures.push(`${race.id}: ${n} region events (< ${REGION_EVENT_FLOOR})`);
    }
    expect(failures).toEqual([]);
  });

  it("golden courses' region-fitting sets are EXACTLY the shipped ones (pools pinned)", () => {
    // The inverse guard: the golden candidate pools were blessed WITH the four
    // original shipped region-tagged events eligible — those stay. But if anyone
    // tags a NEW event 'uk'/'tasman' or a golden race id, the pinned pools
    // change and goldenRace breaks. Fail HERE with a readable message instead.
    const SHIPPED: Record<string, string[]> = {
      'race-round-island': ['evt-seabreeze', 'evt-headland', 'evt-kelpline'],
      'race-fastnet': ['evt-seabreeze', 'evt-headland', 'evt-kelpline'],
      'race-sydney-hobart': [],
    };
    for (const id of GOLDEN_COURSES) {
      expect({ race: id, fitting: regionFitting(id).map((e) => e.id).sort() }).toEqual({
        race: id,
        fitting: [...SHIPPED[id]].sort(),
      });
    }
  });

  it('the picker never surfaces foreign local knowledge (seeded sweep)', () => {
    // Behavioural pin of the region rule: drawing on a course only ever yields
    // events that are untagged or genuinely fit it. 60 seeded draws per race
    // across bands/phases — deterministic, so a regression is a hard failure.
    for (const race of RACES) {
      const region = RACE_REGION[race.id];
      setRng(mulberry32(1234));
      for (let i = 0; i < 60; i += 1) {
        const e = pickEventForRace([], i % 2 ? 'Upwind' : 'Downwind', {
          raceId: race.id,
          band: (['light', 'moderate', 'fresh', 'heavy'] as const)[i % 4],
          phase: (['early', 'mid', 'late'] as const)[i % 3],
        });
        if (e.regions) {
          expect({ race: race.id, event: e.id, ok: e.regions.some((r) => r === race.id || r === region) }).toEqual({
            race: race.id,
            event: e.id,
            ok: true,
          });
        }
      }
    }
  });
});
