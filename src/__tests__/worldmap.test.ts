import { REGION_BOUNDS, REGION_LAND, WORLD_BOUNDS, WORLD_LAND } from '../data/worldmap';
import { REGION_RACES } from '../data/onboarding';
import { RACES, getRaceById } from '../data';
import { REGION_KEYS, regionRaces } from '../components/harbour/regions';
import { worldProjection } from '../components/WorldChart';

// Coverage contract for the baked world chart: every race is chartable on the
// world view, every region station has courses to pin and a coastline to draw,
// and the committed geometry stays dashboard-sized.

describe('world chart coverage', () => {
  it('places every race start inside the world bounds', () => {
    for (const race of RACES) {
      const start = race.waypoints[0];
      expect(start.lat).toBeGreaterThanOrEqual(WORLD_BOUNDS.minLat);
      expect(start.lat).toBeLessThanOrEqual(WORLD_BOUNDS.maxLat);
      expect(start.lon).toBeGreaterThanOrEqual(WORLD_BOUNDS.minLon);
      expect(start.lon).toBeLessThanOrEqual(WORLD_BOUNDS.maxLon);
    }
  });

  it('gives every onboarding region at least one pin', () => {
    for (const [region, raceIds] of Object.entries(REGION_RACES)) {
      expect(raceIds.length).toBeGreaterThan(0);
      for (const id of raceIds) {
        expect(getRaceById(id)).toBeDefined();
      }
      void region;
    }
  });

  it('bakes a coastline and bounds for every chartable region', () => {
    for (const key of REGION_KEYS) {
      expect(REGION_LAND[key]?.length ?? 0).toBeGreaterThan(0);
      const bounds = REGION_BOUNDS[key];
      expect(bounds).toBeDefined();
      // Every one of the region's courses starts inside its chart box.
      for (const race of regionRaces(key)) {
        const start = race.waypoints[0];
        expect(start.lat).toBeGreaterThanOrEqual(bounds.minLat);
        expect(start.lat).toBeLessThanOrEqual(bounds.maxLat);
        expect(start.lon).toBeGreaterThanOrEqual(bounds.minLon);
        expect(start.lon).toBeLessThanOrEqual(bounds.maxLon);
      }
    }
  });

  it('every chartable region is pinned on the world view via its anchor race', () => {
    for (const key of REGION_KEYS) {
      expect(regionRaces(key).length).toBeGreaterThan(0);
    }
  });

  it('keeps the world silhouette real but coarse', () => {
    expect(WORLD_LAND.length).toBeGreaterThan(20); // continents + big islands survive
    for (const polygon of WORLD_LAND) {
      for (const ring of polygon) {
        for (const [lon, lat] of ring) {
          expect(lon).toBeGreaterThanOrEqual(WORLD_BOUNDS.minLon);
          expect(lon).toBeLessThanOrEqual(WORLD_BOUNDS.maxLon);
          expect(lat).toBeGreaterThanOrEqual(WORLD_BOUNDS.minLat);
          expect(lat).toBeLessThanOrEqual(WORLD_BOUNDS.maxLat);
        }
      }
    }
  });

  it('stays a dashboard payload, well under the budget', () => {
    const bytes =
      JSON.stringify(WORLD_LAND).length +
      JSON.stringify(REGION_LAND).length +
      JSON.stringify(REGION_BOUNDS).length;
    expect(bytes).toBeLessThan(150_000);
  });
});

describe('worldProjection frame honesty', () => {
  // The bake clips continents at each box edge; if the drawable extends past
  // the box, that clip renders as a straight coastline floating in invented
  // water (the Tasman hero bug). The box must land EXACTLY on the frame.
  it('maps every box exactly onto its drawable — no sea ring past the bake', () => {
    const boxes = [WORLD_BOUNDS, ...Object.values(REGION_BOUNDS)];
    for (const b of boxes) {
      for (const [sw, sh] of [
        [390, 200],
        [200, 200],
        [900, 420],
      ]) {
        const p = worldProjection(b, sw, sh);
        const tl = p.project(b.maxLat, b.minLon);
        const br = p.project(b.minLat, b.maxLon);
        expect(tl.x).toBeCloseTo(0, 6);
        expect(tl.y).toBeCloseTo(0, 6);
        expect(br.x).toBeCloseTo(p.width, 6);
        expect(br.y).toBeCloseTo(p.height, 6);
        expect(p.width).toBeLessThanOrEqual(sw + 1e-6);
        expect(p.height).toBeLessThanOrEqual(sh + 1e-6);
      }
    }
  });
});
