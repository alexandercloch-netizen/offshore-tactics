import { FlowField, sampleFlow } from './flowField';

// The pure half of the flow animation: seeding, per-frame advection and the
// path-string assembly, kept apart from the SVG component (WindParticles) so
// the kinematics are unit-testable in node — no React, no rAF, no engine rng.
// Every number here is the visual spec's, pinned by tests.

export interface SwarmParticle {
  x: number;
  y: number;
  trail: number[]; // recent [x,y,x,y,…], newest last — the streak the eye follows
  age: number;
  life: number; // frames before respawn (staggered so they don't all blink together)
}

// One band's comet, split into three fade tiers: the old tail barely there,
// the middle readable, the head bright — a comet that reads as flow even in
// light air, still bands × tiers paths however many particles fly.
export interface TierPaths {
  tail: string;
  mid: string;
  head: string;
}

// The three-tier comet fade (opacity / stroke width, thinner on a compact
// strip). Order matches render order: tail under mid under head.
export const COMET_TIERS = [
  { tier: 'tail', opacity: 0.16, width: 0.8, compactWidth: 0.7 },
  { tier: 'mid', opacity: 0.36, width: 1.1, compactWidth: 0.9 },
  { tier: 'head', opacity: 0.8, width: 1.7, compactWidth: 1.3 },
] as const;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// A 124px-tall world strip is compact; a desktop pane (or the race chart) is
// not. One boundary drives trail length and stroke weight.
export function isCompactStage(width: number, height: number): boolean {
  return Math.min(width, height) < 300;
}

// PredictWind's zoom grammar: the same knot moves fewer pixels on a small
// chart, so the strip reads calm and vast while a desktop pane reads alive.
// Multiplies the field's px-per-knot velocity at advection time.
export function pxScaleFor(width: number, height: number): number {
  return clamp(Math.min(width, height) / 300, 0.5, 1.4);
}

// History points per streak — short comets on a strip, long on a pane.
export function trailLenFor(width: number, height: number): number {
  return isCompactStage(width, height) ? 8 : 14;
}

// Default swarm size: area-scaled, floored so a strip still reads as flow and
// capped so a huge web pane stays light (paths are bands × tiers regardless).
export function swarmCount(width: number, height: number): number {
  return Math.round(clamp((width * height) / 2400, 48, 220));
}

export function seedSwarm(
  count: number,
  width: number,
  height: number,
  rnd: () => number
): SwarmParticle[] {
  const next: SwarmParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = rnd() * width;
    const y = rnd() * height;
    next.push({ x, y, trail: [x, y], age: Math.floor(rnd() * 90), life: 60 + Math.floor(rnd() * 90) });
  }
  return next;
}

export interface SwarmStepOptions {
  width: number;
  height: number;
  trailLen: number; // history points per streak
  pxScale: number; // zoom kinematics multiplier on the field's px/sec
  bands: number; // colour-band bucket count (1 for tide)
  bandOf: (kn: number) => number; // local speed → band index
}

// Advance the swarm one frame and assemble the per-band, per-tier path
// strings. Mutates `particles` in place (the swarm lives in a ref); the rnd
// stream is only consumed by respawns, exactly as before.
export function stepSwarm(
  particles: SwarmParticle[],
  field: FlowField,
  dt: number,
  opts: SwarmStepOptions,
  rnd: () => number
): TierPaths[] {
  const { width, height, trailLen, pxScale, bands, bandOf } = opts;
  const next: TierPaths[] = [];
  for (let b = 0; b < bands; b += 1) next.push({ tail: '', mid: '', head: '' });

  const respawn = (p: SwarmParticle) => {
    p.x = rnd() * width;
    p.y = rnd() * height;
    p.trail = [p.x, p.y]; // start fresh so we don't draw a line across the jump
    p.age = 0;
    p.life = 60 + Math.floor(rnd() * 90);
  };

  for (const p of particles) {
    const v = sampleFlow(field, p.x, p.y);
    p.x += v.vx * pxScale * dt;
    p.y += v.vy * pxScale * dt;
    p.age += 1;
    const off = p.x < 0 || p.x > width || p.y < 0 || p.y > height;
    if (off || p.age > p.life || v.kn < 0.4) {
      respawn(p);
    } else {
      p.trail.push(p.x, p.y);
      if (p.trail.length > trailLen * 2) p.trail.splice(0, p.trail.length - trailLen * 2);
    }
    const n = p.trail.length / 2; // points
    if (n < 2) continue;
    const bucket = next[bands === 1 ? 0 : bandOf(v.kn)];
    const seg = (from: number, to: number): string => {
      // Subpath over points [from..to] inclusive (needs ≥ 2 points).
      let d = `M${p.trail[from * 2].toFixed(1)} ${p.trail[from * 2 + 1].toFixed(1)}`;
      for (let k = from + 1; k <= to; k += 1) {
        d += `L${p.trail[k * 2].toFixed(1)} ${p.trail[k * 2 + 1].toFixed(1)}`;
      }
      return d;
    };
    // The head is the last two segments; the remainder splits tail (older
    // half) / mid at shared points, so the comet stays one unbroken streak.
    const headStart = Math.max(0, n - 3);
    if (headStart === 0) {
      bucket.head += seg(0, n - 1);
      continue;
    }
    const tailEnd = Math.ceil(headStart / 2);
    if (tailEnd > 0) bucket.tail += seg(0, tailEnd);
    if (headStart > tailEnd) bucket.mid += seg(tailEnd, headStart);
    bucket.head += seg(headStart, n - 1);
  }
  return next;
}

// The still-frame renderer (reduced motion, or a host with no rAF at all):
// short flow-aligned streamlets, one per grid cell, bucketed into the same
// band paths as the swarm — direction and speed without a single moving
// pixel. Also deliberately reusable as a static direction layer.
export const STREAMLET_PITCH_PX = 48;
export const STREAMLET_LEN_PX = 14;

export function streamletPaths(
  field: FlowField,
  width: number,
  height: number,
  bands: number,
  bandOf: (kn: number) => number
): string[] {
  const out: string[] = Array.from({ length: bands }, () => '');
  const half = STREAMLET_LEN_PX / 2;
  const unitAt = (x: number, y: number): { x: number; y: number; kn: number } | null => {
    const v = sampleFlow(field, x, y);
    const mag = Math.hypot(v.vx, v.vy);
    if (mag < 1e-6) return null;
    return { x: v.vx / mag, y: v.vy / mag, kn: v.kn };
  };
  for (let cy = STREAMLET_PITCH_PX / 2; cy < height; cy += STREAMLET_PITCH_PX) {
    for (let cx = STREAMLET_PITCH_PX / 2; cx < width; cx += STREAMLET_PITCH_PX) {
      const u0 = unitAt(cx, cy);
      if (!u0 || u0.kn < 0.4) continue; // glassy patch: no invented direction
      // Three points, each step following the locally sampled flow, so the
      // streamlet bends with the field instead of drawing a blind chord.
      const ax = cx - u0.x * half;
      const ay = cy - u0.y * half;
      const u1 = unitAt(ax, ay) ?? u0;
      const bx = ax + u1.x * half;
      const by = ay + u1.y * half;
      const u2 = unitAt(bx, by) ?? u1;
      const ex = bx + u2.x * half;
      const ey = by + u2.y * half;
      out[bands === 1 ? 0 : bandOf(u0.kn)] +=
        `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}L${ex.toFixed(1)} ${ey.toFixed(1)}`;
    }
  }
  return out;
}
