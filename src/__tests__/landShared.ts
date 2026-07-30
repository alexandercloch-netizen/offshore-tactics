// Shared helpers for the land-safety test trio (land / landTide / landForecast).
// Not a `*.test.ts` file, so jest never collects it directly — it only exists to
// keep the three split suites DRY. The split exists so jest can run the heavy
// tide/forecast blocks concurrently (it cannot parallelise a single file).
import { pointInLand, segmentCrossesLand } from '../engine/land';
import { LandPolygon } from '../data/landmasses';
import { getBoatById, getRaceById } from '../data';
import { createWindField } from '../engine/wind';
import { createTidalField } from '../engine/current';
import { createFleet } from '../engine/fleet';
import {
  DEFAULT_STRATEGY,
  defaultStepNm,
  initialProgress,
  raceDivision,
  stepRace,
} from '../engine/gameEngine';
import { haversineNm } from '../engine/geo';
import { BoatCondition, GameState } from '../types';

export const healthy: BoatCondition = { hullIntegrity: 100, crewStamina: 100, crewMorale: 100 };

// A point sits "at" a mark if it's within the coarse-coastline tolerance of one.
export const MARGIN_NM = 6; // tolerate coastal start/finish/marks sitting on the coarse coastline

// Sail a race headless (ignoring decision prompts, which don't move the boat) and
// return the track actually sailed.
export function sailTrail(
  raceId: string,
  withTide = false,
  stepNm?: number
): { lat: number; lon: number }[] {
  const race = getRaceById(raceId)!;
  const boat = getBoatById('boat-mistral')!;
  const windField = createWindField(race);
  let state = {
    funds: 0,
    selectedRaceId: raceId,
    selectedDivision: 'corinthian',
    selectedBoatId: boat.id,
    ownedBoatIds: [],
    selectedCrewIds: [],
    provisions: [],
    strategy: DEFAULT_STRATEGY,
    profile: { fleet: [] },
    condition: healthy,
    windField,
    // The tide's set & drift moves the boat over the ground — guard that it never
    // pushes the track onto the coast (a foul stream by a shoreside gate used to).
    tidalField: withTide ? createTidalField(race) : undefined,
    fleet: createFleet(race, raceDivision(race, 'corinthian')),
    progress: initialProgress(race, boat, 'corinthian', windField),
    history: [],
    eventLog: [],
  } as unknown as GameState;

  // Coarser steps than gameplay by default — enough to trace the whole routed
  // track without a slow tick-by-tick sim. Callers can pass the gameplay step for
  // a higher-resolution audit (the tide drift needs it).
  const step = stepNm ?? Math.max(race.distanceNm * 0.04, 1);
  for (let i = 0; i < 4000; i += 1) {
    const out = stepRace(state, step);
    state = { ...state, progress: out.progress, condition: out.condition, weather: out.weather, fleet: out.fleet };
    if (out.finished || out.retired) break;
  }
  return state.progress!.trail;
}

export function nearMark(
  race: { waypoints: { lat: number; lon: number }[] },
  p: { lat: number; lon: number }
): boolean {
  return race.waypoints.some((w) => haversineNm(p.lat, p.lon, w.lat, w.lon) <= MARGIN_NM);
}

// Count the segments of a polyline that cut across land. A vertex check alone
// misses the real defect — two clean vertices with land between them — so we
// test the segments the boat actually sails. Segments touching a mandatory mark
// are exempt (real harbours/headlands sit on the coarse coastline).
export function landCrossings(
  race: { waypoints: { lat: number; lon: number }[] },
  land: LandPolygon[] | undefined,
  pts: { lat: number; lon: number }[]
): { lat: number; lon: number }[][] {
  const crossings: { lat: number; lon: number }[][] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    if (nearMark(race, pts[i]) || nearMark(race, pts[i + 1])) continue;
    if (segmentCrossesLand(land, pts[i], pts[i + 1])) crossings.push([pts[i], pts[i + 1]]);
  }
  return crossings;
}

// Stricter than `landCrossings` for loop courses: a chord across an island runs
// mark-to-mark, so an endpoint check exempts it. Sample the segment *interior*
// instead — a real incursion has points sitting inland, far from any mark, while
// a tight headland rounding only has interior points hugging the mark.
export function inlandIncursions(
  race: { waypoints: { lat: number; lon: number }[] },
  land: LandPolygon[] | undefined,
  pts: { lat: number; lon: number }[]
): { lat: number; lon: number }[] {
  const hits: { lat: number; lon: number }[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const p = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
      if (pointInLand(land, p.lat, p.lon) && !nearMark(race, p)) hits.push(p);
    }
  }
  return hits;
}

// The sub-resolution channels — courses whose real channels are narrower than the
// 1:10m coastline can represent (R2AK's Inside Passage ~750 m; the Middle Sea's
// Strait of Messina / Aeolian gaps). The polygon shows navigable water as land, so
// a weather-routed track unavoidably "clips" it — a coastline-resolution limit
// (tide-independent), tracked in docs/TIDE-NOTES.md, not a movement bug.
export const SUBRESOLUTION_COAST = new Set(['race-r2ak', 'race-middle-sea']);
