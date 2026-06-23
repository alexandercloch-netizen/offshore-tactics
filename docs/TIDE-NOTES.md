# Tidal currents — status & the path to enabling them

The tidal-current **engine** is built and tested (`src/engine/current.ts`,
`TideProfile`/`TidalField` types, wiring in `stepRace`, `estimateRouteHours`,
`advanceFleet`, and `GameContext`). It is **dormant**: no race ships a `tide`
profile, so `createTidalField` returns a slack field and the game (and the tuned
fleet balance) is unchanged. `current.test.ts` covers the field, the fair/foul
projection, the ETA integration and the live `stepRace` wiring.

## Why it isn't switched on yet

Enabling a felt tide on a race keeps **skewing the fleet standings**, and the
cause is now understood (measured, not guessed):

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

### Models tried (all skewed the standings)

1. Tide baked into the benchmark → a fast boat finished **last on corrected**.
2. Symmetric live tide along heading → **everyone wins**.
3. Symmetric along course → **bimodal** (1st or last by seed).
4. 2-D made-good fleet + course tide → **runaway**.
5. Player **set & drift** (tide as drift over time, not route distance) — more
   physically correct and reduces some seeds, but still a runaway/bimodal,
   because the fleet's made-good pace still spans the cycle differently.

## The path that should work

Move the **AI fleet through the same engine the player sails** so their tide
exposure matches by construction:

- Each competitor gets a real position and weather-routes per leg (cheap
  isochrone or a shared per-side route), advancing via the reference polar in the
  local wind **plus the same set & drift** the player gets.
- Closed-form calibration keeps difficulty intact: sail the reference polar
  scaled by `paceScale = speedMul / edge`, which makes the tide-free finish land
  on the existing `targetHours` (so the #42 balance is preserved).
- With player and fleet on one model, tide cancels in the standings; gates and
  timing become genuine, fair tactics.

This also lays the groundwork for the **2-D fleet leverage** Phase 2 item.

## When enabling, also ship (so tide is legible and playable)

- A **tide readout** (set, rate, fair/foul) in the race instruments + briefing.
- **Current arrows** on the chart (`RouteMap`).
- Re-validate the full boat × race × division × phase balance matrix with tide
  **on** and **off** before turning a race's profile live.

## Suggested first race to enable

Round the Island (the Solent is tide-dominated). A worked profile to start from:

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
