import React, { useEffect, useMemo, useRef, useState } from 'react';
import { G, Path } from 'react-native-svg';
import { buildFlowField, FlowCell, FlowField, FlowLayer } from './flowField';
import { windHeatColor } from './windScale';
import {
  COMET_TIERS,
  isCompactStage,
  pxScaleFor,
  seedSwarm,
  stepSwarm,
  streamletPaths,
  swarmCount,
  SwarmParticle,
  TierPaths,
  trailLenFor,
} from './particleSwarm';

export type { FlowCell, FlowLayer } from './flowField';
export { windCells, tideCells } from './flowField';

// A live, PredictWind-style flow animation: hundreds of particles drifting with
// the wind (or the tide), seeded across the chart and advected by the sampled
// field. Each streak is a three-tier comet (faint tail, readable middle, bright
// head) tinted by the LOCAL flow speed under it, quantised into a handful of
// colour bands so the whole swarm still renders as a bounded set of SVG <Path>
// nodes (bands × fade tiers — never one per particle), updated on a
// requestAnimationFrame loop capped at 30fps. Pure react-native-svg, identical
// on iOS, Android and web (no canvas/WebGL, no platform fork). Purely visual:
// it reads the same field the engine routes on but never feeds back into it,
// so determinism is untouched.
//
// With motion off (the player prefers reduced motion — passed as a prop so this
// stays presentational) or on a host with no rAF at all, the same field renders
// as STATIC flow-aligned streamlets in the same band paths: direction and speed
// survive, nothing moves, and nothing crashes.

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

// The wind/gust streak palette: band centres (kn) on the shared kn→colour ramp,
// lifted almost to foam-white so the streaks read as near-monochrome MOTION over
// the colour wash beneath them — the paint carries the speed, the streaks carry
// the flow. Seven bands keeps a whisper of hue while keeping the SVG node count
// fixed at bands × three fade tiers.
const WIND_BAND_KN = [3, 8, 12, 16, 21, 28, 40];
const STREAK_LIGHTEN = 0.8;

// The 30fps cap: with two charts animating, half the setPaths is free headroom
// — the life survives (PredictWind mobile runs about this) and the main thread
// breathes. dt accumulates across skipped frames so speed stays true.
const MIN_FRAME_S = 1 / 30;

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

interface XY {
  x: number;
  y: number;
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
  // false = the player prefers reduced motion: render the static streamlets
  // instead of running the animation loop. A prop, not a hook — the component
  // stays a pure function of its inputs plus its own frame clock.
  motion?: boolean;
}

export const WindParticles: React.FC<WindParticlesProps> = ({
  cells,
  cols,
  rows,
  project,
  layer,
  color,
  count,
  width,
  height,
  motion = true,
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

  const compact = isCompactStage(width, height);
  const swarm = count ?? swarmCount(width, height);

  // View-only motion degrades, never crashes: a host with no RAF (the node
  // render tests, SSR) gets the same still streamlets a reduced-motion player
  // asked for.
  const still = !motion || typeof requestAnimationFrame === 'undefined';

  const particles = useRef<SwarmParticle[]>([]);
  const rng = useRef(lcg(0x9e3779b1));
  const [paths, setPaths] = useState<TierPaths[]>([]);

  // (Re)seed the swarm whenever the swarm size or the drawable area changes —
  // and ONLY then: a field swap (a live lattice landing over the instant IDW)
  // keeps every particle flying.
  useEffect(() => {
    if (still) return;
    particles.current = seedSwarm(swarm, width, height, rng.current);
  }, [still, swarm, width, height]);

  useEffect(() => {
    if (!field || still) return undefined;
    let raf = 0;
    let last = 0;
    let acc = 0;
    const stepOpts = {
      width,
      height,
      trailLen: trailLenFor(width, height),
      pxScale: pxScaleFor(width, height),
      bands,
      bandOf: bandIndex,
    };

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      acc += last ? Math.min((t - last) / 1000, 0.05) : 0.016; // clamp tab-switch gaps
      last = t;
      if (acc < MIN_FRAME_S) return; // 30fps cap — carry the dt into the next frame
      const dt = Math.min(acc, 0.05);
      acc = 0;
      setPaths(stepSwarm(particles.current, field, dt, stepOpts, rng.current));
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [field, still, width, height, bands]);

  // The still frame: flow-aligned streamlets in the same band buckets (≤ one
  // path per band), computed once per field — no state, no clock.
  const stillPaths = useMemo(
    () => (still && field ? streamletPaths(field, width, height, bands, bandIndex) : null),
    [still, field, width, height, bands]
  );

  if (!field) return null;
  if (stillPaths) {
    return (
      <G testID="flow-streamlets">
        {stillPaths.map((d, i) =>
          d ? (
            <Path
              key={i}
              d={d}
              stroke={bandColors[i]}
              strokeWidth={compact ? 0.9 : 1.1}
              strokeLinecap="round"
              fill="none"
              opacity={0.55}
            />
          ) : null
        )}
      </G>
    );
  }
  return (
    <G testID="flow-swarm">
      {paths.map((p, i) => (
        <React.Fragment key={i}>
          {COMET_TIERS.map(({ tier, opacity, width: sw, compactWidth }) => (
            <Path
              key={tier}
              d={p[tier]}
              stroke={bandColors[i]}
              strokeWidth={compact ? compactWidth : sw}
              strokeLinecap="round"
              fill="none"
              opacity={opacity}
            />
          ))}
        </React.Fragment>
      ))}
    </G>
  );
};

export default WindParticles;
