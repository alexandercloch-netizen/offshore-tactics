import React, { useEffect, useMemo, useRef, useState } from 'react';
import { G, Path } from 'react-native-svg';
import { buildFlowField, sampleFlow, FlowCell, FlowField, FlowLayer } from './flowField';
import { windHeatColor } from './windScale';

export type { FlowCell, FlowLayer } from './flowField';
export { windCells, tideCells } from './flowField';

// A live, PredictWind-style flow animation: hundreds of particles drifting with
// the wind (or the tide), seeded across the chart and advected by the sampled
// field. Each streak is tinted by the LOCAL flow speed under its head, quantised
// into a handful of colour bands so the whole swarm still renders as a bounded
// set of SVG <Path> nodes (one per band × fade tier — never one per particle),
// updated on a requestAnimationFrame loop. Pure react-native-svg, identical on
// iOS, Android and web (no canvas/WebGL, no platform fork). Purely visual: it
// reads the same field the engine routes on but never feeds back into it, so
// determinism is untouched.

interface XY {
  x: number;
  y: number;
}

// Small, fast, *local* PRNG for particle seeding — deliberately NOT the engine's
// rng (engine/rng.ts), since this is view-only motion that must never perturb the
// deterministic simulation.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Particle {
  x: number;
  y: number;
  trail: number[]; // recent [x,y,x,y,…], newest last — the streak the eye follows
  age: number;
  life: number; // frames before respawn (staggered so they don't all blink together)
}

const TRAIL_FADE = 0.6;
const TRAIL_LEN = 12; // history points per streak — long enough to read as flow in light air

// The wind/gust streak palette: band centres (kn) on the shared kn→colour ramp,
// lifted well toward white so a streak reads *against* the same ramp painted
// beneath it as the heatmap — the hue carries the local speed, the lightness
// keeps it legible. Seven bands is enough hue resolution for the eye while
// keeping the SVG node count fixed at bands × two fade tiers.
const WIND_BAND_KN = [3, 8, 12, 16, 21, 28, 40];
const STREAK_LIGHTEN = 0.62;

function lighten(rgb: string, amount: number): string {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
  if (!m) return rgb;
  const ch = (v: string) => Math.round(Number(v) + (255 - Number(v)) * amount);
  return `rgb(${ch(m[1])}, ${ch(m[2])}, ${ch(m[3])})`;
}

// Which colour band a local speed falls in: nearest band centre (edges midway).
function bandIndex(kn: number): number {
  let i = 0;
  while (i < WIND_BAND_KN.length - 1 && kn > (WIND_BAND_KN[i] + WIND_BAND_KN[i + 1]) / 2) i += 1;
  return i;
}

interface BandPaths {
  head: string;
  trail: string;
}

interface WindParticlesProps {
  cells: FlowCell[];
  cols: number;
  rows: number;
  project: (lat: number, lon: number) => XY;
  layer: FlowLayer;
  color: string;
  count?: number;
  width: number;
  height: number;
}

export const WindParticles: React.FC<WindParticlesProps> = ({
  cells,
  cols,
  rows,
  project,
  layer,
  color,
  count = 160,
  width,
  height,
}) => {
  const field: FlowField | null = useMemo(
    () => buildFlowField(cells, cols, rows, project, layer),
    [cells, cols, rows, project, layer]
  );

  // The tide keeps its single pale streak colour: its own ramp is already the
  // water painted under the particles, and one bright thread over it reads far
  // better than cyan-on-cyan. Wind and gust get the speed-tinted bands.
  const bandColors = useMemo(
    () =>
      layer === 'tide' ? [color] : WIND_BAND_KN.map((kn) => lighten(windHeatColor(kn), STREAK_LIGHTEN)),
    [layer, color]
  );
  const bands = bandColors.length;

  const particles = useRef<Particle[]>([]);
  const rng = useRef(lcg(0x9e3779b1));
  const [paths, setPaths] = useState<BandPaths[]>([]);

  // (Re)seed the swarm whenever the swarm size or the drawable area changes.
  useEffect(() => {
    const next: Particle[] = [];
    const r = rng.current;
    for (let i = 0; i < count; i += 1) {
      const x = r() * width;
      const y = r() * height;
      next.push({ x, y, trail: [x, y], age: Math.floor(r() * 90), life: 60 + Math.floor(r() * 90) });
    }
    particles.current = next;
  }, [count, width, height]);

  useEffect(() => {
    if (!field) return undefined;
    let raf = 0;
    let last = 0;
    const r = rng.current;

    const respawn = (p: Particle) => {
      p.x = r() * width;
      p.y = r() * height;
      p.trail = [p.x, p.y]; // start fresh so we don't draw a line across the jump
      p.age = 0;
      p.life = 60 + Math.floor(r() * 90);
    };

    const frame = (t: number) => {
      const dt = last ? Math.min((t - last) / 1000, 0.05) : 0.016; // clamp tab-switch gaps
      last = t;
      const next: BandPaths[] = [];
      for (let b = 0; b < bands; b += 1) next.push({ head: '', trail: '' });
      for (const p of particles.current) {
        const v = sampleFlow(field, p.x, p.y);
        p.x += v.vx * dt;
        p.y += v.vy * dt;
        p.age += 1;
        const off = p.x < 0 || p.x > width || p.y < 0 || p.y > height;
        if (off || p.age > p.life || v.kn < 0.4) {
          respawn(p);
        } else {
          p.trail.push(p.x, p.y);
          if (p.trail.length > TRAIL_LEN * 2) p.trail.splice(0, p.trail.length - TRAIL_LEN * 2);
        }
        if (p.trail.length < 4) continue;
        // The whole streak (faint) plus its leading two points (bright) — a comet
        // that reads as flow even in light air — accumulated into its speed
        // band's two paths, so the node count stays bands × 2 however many
        // particles fly.
        const bucket = next[bands === 1 ? 0 : bandIndex(v.kn)];
        let d = `M${p.trail[0].toFixed(1)} ${p.trail[1].toFixed(1)}`;
        for (let k = 2; k < p.trail.length; k += 2) d += `L${p.trail[k].toFixed(1)} ${p.trail[k + 1].toFixed(1)}`;
        bucket.trail += d;
        const n = p.trail.length;
        bucket.head += `M${p.trail[n - 4].toFixed(1)} ${p.trail[n - 3].toFixed(1)}L${p.trail[n - 2].toFixed(1)} ${p.trail[n - 1].toFixed(1)}`;
      }
      setPaths(next);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [field, width, height, bands]);

  if (!field) return null;
  return (
    <G>
      {paths.map((p, i) => (
        <React.Fragment key={i}>
          <Path d={p.trail} stroke={bandColors[i]} strokeWidth={1} strokeLinecap="round" fill="none" opacity={TRAIL_FADE * 0.5} />
          <Path d={p.head} stroke={bandColors[i]} strokeWidth={1.6} strokeLinecap="round" fill="none" opacity={TRAIL_FADE} />
        </React.Fragment>
      ))}
    </G>
  );
};

export default WindParticles;
