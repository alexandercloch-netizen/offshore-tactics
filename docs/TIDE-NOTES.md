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

## Enabled, with a UI (done)

Tide is live with a **tide readout** in the race HUD + briefing and **current
arrows** on the chart (`sampleCurrentGrid` + the `current` prop on `RouteMap`).

## Which races carry a tide, and why these strengths

Tide is on every race that genuinely sails a **tidal stream** (oscillating
flood/ebb). Skipped: Chicago Mac (freshwater), Caribbean 600 (negligible Carib
tides), Transpac & Sydney–Hobart (ocean/weather-dominated), and Newport Bermuda
(the **Gulf Stream is an ocean current** — steady and banded, not a tidal stream;
a future "ocean current" feature, not this oscillating model).

| Race | base kn | gates | one-time validated shift* |
|------|--------:|-------|---------------------------|
| Round the Island | 0.5 | Needles, St Catherine's | +13% |
| Fastnet | 1.1 | Portland Bill, Cap de la Hague | −1% |
| Race to Alaska | 0.5 | Seymour Narrows, Dixon Entrance | −5% |
| Middle Sea | 0.3 | Strait of Messina | −15% |

\* mean change in the player's corrected placing when tide is switched on, as a
fraction of fleet size (boat-tempest, pro, several seeds). Bounded and
mixed-direction — a tactical factor, not the old ~100% runaway.

### The gentle-gate rule (a model limitation)

Only the **base** tide (sampled everywhere) is *perfectly* fair: the player and
every fleet boat feel it. **Tide gates are radius-limited**, but the fleet spreads
laterally off the rhumb (leverage, up to ~30 nm on a long course), so biased
boats partly **miss** a gate the player rounds — skewing the result by the gate's
strength. So gates must stay **gentle** (gain ≲ 1, generous radius) and the base
carries the main fair effect. A *dramatic* gate (e.g. the real Seymour Narrows or
Messina) would need the fleet to **route through the marks** like the player —
i.e. the full per-boat routing deferred earlier. Middle Sea is the weakest case
(the Med is tideless apart from Messina, so there's little fair base to lean on);
it's kept deliberately light.

The `tide is fair in the standings` test guards Round the Island (fast,
representative of the mechanism); the long ocean races were validated one-time
(table above) rather than in CI, as a full race each is too slow for the suite.
