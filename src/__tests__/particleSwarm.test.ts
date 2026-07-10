import { buildFlowField, FlowCell } from '../components/flowField';
import {
  COMET_TIERS,
  isCompactStage,
  pxScaleFor,
  seedSwarm,
  stepSwarm,
  streamletPaths,
  swarmCount,
  SwarmParticle,
  trailLenFor,
} from '../components/particleSwarm';

// The pure half of the flow animation: the visual spec's numbers, the
// bands × tiers node-count trick, the zoom kinematics and the still-frame
// streamlets — all node-testable without React or a rAF.

// Identity-ish projection: pixel space == (lon, lat).
const project = (lat: number, lon: number) => ({ x: lon, y: lat });

// A uniform west wind (fromDeg 270 → blows toward the east) over a 300×200
// pixel stage.
function uniformField(speedKn = 10) {
  const cells: FlowCell[] = [
    { lat: 0, lon: 0, dirDeg: 270, speedKn },
    { lat: 0, lon: 300, dirDeg: 270, speedKn },
    { lat: 200, lon: 0, dirDeg: 270, speedKn },
    { lat: 200, lon: 300, dirDeg: 270, speedKn },
  ];
  return buildFlowField(cells, 2, 2, project, 'wind')!;
}

// A deterministic little rnd for tests (never the engine rng — view code).
function counterRnd(): () => number {
  let i = 0;
  return () => {
    i = (i + 1) % 97;
    return i / 97;
  };
}

const stepOpts = {
  width: 300,
  height: 200,
  trailLen: 14,
  pxScale: 1,
  bands: 7,
  bandOf: () => 2,
};

describe('the visual spec, pinned', () => {
  it('fades the comet over exactly three tiers with the spec numbers', () => {
    expect(COMET_TIERS.map((t) => t.tier)).toEqual(['tail', 'mid', 'head']);
    expect(COMET_TIERS.map((t) => t.opacity)).toEqual([0.16, 0.36, 0.8]);
    expect(COMET_TIERS.map((t) => t.width)).toEqual([0.8, 1.1, 1.7]);
    expect(COMET_TIERS.map((t) => t.compactWidth)).toEqual([0.7, 0.9, 1.3]);
  });

  it('scales kinematics to the stage: the strip reads calm, a pane reads alive', () => {
    expect(pxScaleFor(342, 124)).toBe(0.5); // the world strip floors
    expect(pxScaleFor(780, 460)).toBe(1.4); // a desktop pane caps
    expect(pxScaleFor(300, 300)).toBe(1);
    expect(trailLenFor(342, 124)).toBe(8);
    expect(trailLenFor(780, 460)).toBe(14);
    expect(isCompactStage(342, 124)).toBe(true);
    expect(isCompactStage(780, 460)).toBe(false);
  });

  it('sizes the default swarm by area, floored and capped', () => {
    expect(swarmCount(342, 124)).toBe(48); // strip floor
    expect(swarmCount(780, 460)).toBe(150); // ≈ the spec's 149
    expect(swarmCount(2000, 2000)).toBe(220); // cap
  });
});

describe('stepSwarm', () => {
  it('emits bands × 3 tier paths (21) however many particles fly', () => {
    const field = uniformField();
    for (const count of [10, 200]) {
      const particles = seedSwarm(count, 300, 200, counterRnd());
      const out = stepSwarm(particles, field, 0.016, stepOpts, counterRnd());
      expect(out).toHaveLength(7);
      expect(out.flatMap((p) => [p.tail, p.mid, p.head])).toHaveLength(21);
    }
  });

  it('advects with the field × pxScale (the zoom grammar is real velocity)', () => {
    const field = uniformField(10); // 10 kn × 7 px/kn = 70 px/s eastward
    const at = (): SwarmParticle[] => [{ x: 150, y: 100, trail: [150, 100], age: 0, life: 900 }];
    const full = at();
    stepSwarm(full, field, 0.1, { ...stepOpts, pxScale: 1 }, counterRnd());
    expect(full[0].x).toBeCloseTo(157, 5);
    expect(full[0].y).toBeCloseTo(100, 5);
    const strip = at();
    stepSwarm(strip, field, 0.1, { ...stepOpts, pxScale: 0.5 }, counterRnd());
    expect(strip[0].x).toBeCloseTo(153.5, 5);
  });

  it('grows one unbroken comet: tail, mid and head share their joints', () => {
    const field = uniformField();
    const particles: SwarmParticle[] = [
      { x: 10, y: 100, trail: [10, 100], age: 0, life: 900 },
    ];
    let out = stepSwarm(particles, field, 0.016, stepOpts, counterRnd());
    for (let i = 0; i < 12; i += 1) {
      out = stepSwarm(particles, field, 0.016, stepOpts, counterRnd());
    }
    const bucket = out[2]; // the stub bandOf
    expect(bucket.tail).not.toBe('');
    expect(bucket.mid).not.toBe('');
    expect(bucket.head).not.toBe('');
    // The mid path starts where the tail ends; the head starts where the mid
    // ends — one streak, three opacities.
    const lastPoint = (d: string) => d.slice(d.lastIndexOf('L') + 1);
    const firstPoint = (d: string) => d.slice(1, d.indexOf('L'));
    expect(firstPoint(bucket.mid)).toBe(lastPoint(bucket.tail));
    expect(firstPoint(bucket.head)).toBe(lastPoint(bucket.mid));
    // And the trail respects its cap.
    expect(particles[0].trail.length).toBeLessThanOrEqual(stepOpts.trailLen * 2);
  });

  it('steps 160 particles for 60 frames without a pathological cost', () => {
    // A coarse regression guard, NOT an fps claim: node jest on a shared/loaded
    // runner can't measure real frame time, so the bound is generous — it
    // catches an accidental O(n²) pass or a per-frame reallocation blow-up
    // (which would land in the hundreds of ms / seconds), while a tight
    // millisecond threshold would only flake under CI contention.
    const field = uniformField();
    const particles = seedSwarm(160, 300, 200, counterRnd());
    const rnd = counterRnd();
    const t0 = Date.now();
    for (let f = 0; f < 60; f += 1) stepSwarm(particles, field, 0.033, stepOpts, rnd);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

describe('streamletPaths (the reduced-motion / no-rAF still frame)', () => {
  it('draws one ~14px flow-aligned streamlet per ~48px cell, bucketed by band', () => {
    const field = uniformField();
    const out = streamletPaths(field, 300, 200, 7, () => 2);
    expect(out).toHaveLength(7);
    // 300×200 at 48px pitch → 6 × 4 cells, all in the stubbed band.
    const streamlets = out[2].split('M').filter(Boolean);
    expect(streamlets).toHaveLength(24);
    expect(out.filter((d) => d === '')).toHaveLength(6);
    // Each is a 3-point polyline about 14px long.
    const pts = streamlets[0]
      .split('L')
      .map((p) => p.split(' ').map(Number)) as [number, number][];
    expect(pts).toHaveLength(3);
    const len =
      Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) +
      Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
    expect(len).toBeCloseTo(14, 1);
    // A west wind: the streamlet runs east, level.
    expect(pts[2][0]).toBeGreaterThan(pts[0][0]);
    expect(Math.abs(pts[2][1] - pts[0][1])).toBeLessThan(0.2);
  });

  it('holds its tongue over glassy water — no invented direction', () => {
    const field = uniformField(0.2);
    const out = streamletPaths(field, 300, 200, 7, () => 2);
    expect(out.every((d) => d === '')).toBe(true);
  });
});
