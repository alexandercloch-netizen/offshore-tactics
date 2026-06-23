# Tidal currents — status & the path to enabling them

The tidal-current **engine** is built and tested (`src/engine/current.ts`,
`TideProfile`/`TidalField` types, wiring in `stepRace`, `estimateRouteHours`,
`advanceFleet`, and `GameContext`). It is **dormant**: no race ships a `tide`
profile, so `createTidalField` returns a slack field and the game (and the tuned
fleet balance) is unchanged. `current.test.ts` covers the field, the fair/foul
projection, the ETA integration, the live `stepRace` wiring and — since the
fairness fix below — that tide does not systematically shift the standings.

## Fairness — SOLVED (the fleet now sails the player's model)

The standings skew is fixed. Two coordinated changes made the player and the
fleet respond to the stream identically, so it cancels:

- **Fleet** (`advanceFleet`): each boat now makes good the **reference polar's
  absolute speed in the real wind** (no normalising clamp), scaled by a per-boat
  `paceScale` calibrated against the reference boat's tide-free made-good finish
  (`refMadeGoodHours`). The tide-free finish still lands on target, so the #42
  balance is preserved, but the fleet's speed now swings between light and fresh
  air exactly as the player's does — which is what makes its tide sensitivity
  match.
- **Player** (`stepRace`): tide is applied as **set & drift** — it carries the
  boat over the ground by rate × time (mutating the route's start so the set
  accumulates), not folded into the tack-inflated route step. This stops the old
  ±6 h over-amplification.

Measured (Round the Island, peak 1.5 kn, Needles/St Catherine's gates, 6 seeds,
boat-tempest pro): mean corrected placing moved 35.2 → 42.8 — a small, safe-side
shift (tide makes it marginally harder, never an automatic win), versus the old
runaway. What remains is genuine, high-variance gate tactics. Guarded by the
`tide is fair in the standings` test.

## History — why it was hard (kept for context)

Earlier the felt tide kept **skewing the fleet standings**; the cause (measured,
not guessed):

- The player sails a **2-D routed track** (tacks, reroutes) at real polar speed.
- The AI fleet holds a **calibrated made-good pace** along the course.
- Tide is **time-varying**. Because the two move on different models, the player
  and the fleet pass each point at different times and **accumulate different
  net tide**, so it does not cancel in the standings.

Instrumented finding (Round the Island, peak 1.5 kn, gates at the Needles / St
Catherine's): the player's net-tide effect on finish time swung roughly
**−6 h to +6 h** by tide phase, while the fleet's median moved only ~0–3 h. The
mismatch tracks how much of the flood/ebb cycle each side spans before
finishing.

### Models tried before the fix (all skewed the standings)

1. Tide baked into the benchmark → a fast boat finished **last on corrected**.
2. Symmetric live tide along heading → **everyone wins**.
3. Symmetric along course → **bimodal** (1st or last by seed).
4. 2-D made-good fleet (normalised, clamped windFactor) + course tide → **runaway**.
5. Player set & drift alone (fleet still made-good-paced) → still runaway/bimodal,
   because the clamped pace didn't swing with the wind like the player's speed.

The fix (above) was #5's set & drift **plus** giving the fleet the reference
polar's *unclamped absolute* speed, so both sides' tide sensitivity matches.

## What remains: enable it on a race (the playable feature)

The engine is fair; switching tide on is now a content + UI task:

- Add a `tide` profile to **Round the Island** (the Solent is tide-dominated) —
  start from the worked profile below and tune `peakRateKn` so the gate stakes
  feel right without over-random results.
- A **tide readout** (set, rate, fair/foul) in the race instruments + briefing.
- **Current arrows** on the chart (`RouteMap`), reusing `sampleCurrent`.
- Re-check the `tide is fair in the standings` test (and spot-check other boats)
  with the live profile before shipping.

```ts
tide: {
  floodDeg: 90,
  peakRateKn: 1.4,
  gates: [
    { waypoint: 'The Needles', gain: 0.5, radiusNm: 4 },
    { waypoint: "St Catherine's Point", gain: 0.4, radiusNm: 5 },
  ],
}
```
