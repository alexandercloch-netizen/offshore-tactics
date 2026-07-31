# CLAUDE.md — working notes for Claude (and humans)

This game was designed and built by **Claude**. This file is the guide for any
Claude session (or developer) picking it up. Keep it accurate as the code
evolves.

## What this is

**Offshore Tactics** — a sailing strategy game (React Native + Expo +
TypeScript) that runs on iOS, Android and the web. Pick a real offshore race,
build/charter a boat, sign a crew, provision, study the briefing, then sail the
real course leg by leg, reading the weather and making tactical calls. See
`README.md` for the player-facing overview.

## Commands

```bash
npm install        # install dependencies (Node 20 — see .nvmrc)
npm run web        # play in a browser (Expo web)
npm run tsc        # type-check — our "linter"; must be clean
npm test           # unit tests (Jest)
npm run test:ci    # unit tests as CI runs them
npm run build:web  # production web bundle (also the CI smoke test)
npm run e2e        # Playwright end-to-end playthrough (needs a browser; see below)
```

Quality gates that must pass: **`npm run tsc`**, **`npm test`**, **`npm run
build:web`**, and the **`e2e`** playthrough. CI runs all of them.

## Architecture

The simulation is a **pure, deterministic engine** with a thin React UI on top.

- **`src/engine/`** — the game logic, no React. Pure & unit-tested:
  - `gameEngine.ts` — orchestration: race setup, per-tick `stepRace`, decisions
    (`applyDecision`), results (corrected/handicap time via `ratingTccFor`),
    costs, progression/unlocks. Also the speed model (`boatSpeedFor`),
    `estimateRouteHours` (the briefing's finish-ETA preview), and the in-race
    tactical instruments (`polarTargetSpeed`, `laylines`, `tacticalRead`).
  - `wind.ts` — the analytic wind field (`createWindField`/`sampleWind`): the
    seasonal baseline (from the baked `data/weatherClimatology.ts`), multiple
    drifting puffs/holes, a travelling front, a diurnal cycle and fine texture.
    Also the chart grid (`sampleWindGrid`), the headline feature (`featureState`),
    forecast (`weatherOutlook`), and pressure hints. The **forecast model**
    (`forecastConfidence`/`sampleForecast`) blurs the *displayed* forecast away
    from the true field as you look further ahead — a sharp Navigator
    (`navigatorSkill`) keeps it trustworthy longer; the race still sails the true
    field, so it stays fair and deterministic. **KNOWN ISSUE — a few long courses
    finish unrealistically slowly** (notably the Middle Sea Race). The old note
    here blamed a "light field" and prescribed tempering `speedMul` / a mean-neutral
    front; a headless `stepRace`+tide probe across the long courses **disproved
    that**: the seeded field means are healthy (Fastnet ~15 kn, Transpac ~12 kn,
    Middle Sea ~8 kn — all near or above their baked baselines), yet the boat makes
    good only a fraction of its potential speed. The lever is therefore MADE-GOOD
    EFFICIENCY (deep downwind VMG angles, and `med_fickle`'s ±34° shift whipping the
    router into endless re-tacks), NOT field magnitude — so tempering `speedMul`
    would windier-up an already-healthy field without touching the loss, and would
    re-open the dead-angle balloon. Note too that some long finishes are simply
    REALISTIC for a cruising boat (a Transpac cruiser is genuinely 14–21 days; the
    130 h record is a maxi surfing the trades) — the true outlier to chase is Middle
    Sea (~26 days), a per-race routing subtlety, not a global constant.
    **FIXED (this pass) — the tide-balloon half.** The foul-tide made-good floor
    was RELATIVE for the player (20 % of its own tide-free speed) but ABSOLUTE for
    the fleet (0.2 kn), so in light air the player could crawl far below the fleet
    and a 130 h Fastnet ballooned past 500 h — the very "tide-nonlinearity" that
    destabilised every earlier wind tweak. Both sides now share one ABSOLUTE floor
    (`TIDE_FLOOR_KN` in `engine/current.ts`; see the tide block in `gameEngine.ts`
    and `advanceFleet` in `fleet.ts`). Probe: ballooned Fastnet seeds fell 290 h →
    131 h with nothing else regressing; the goldens re-blessed once (offshore only —
    see `goldenRace.test.ts`). The remaining made-good/routing work is a dedicated
    follow-up that MUST be validated against the full `stepRace` loop with tide (the
    tide-free `cleanRunHours` can't see it). `racePlausibility.test.ts` guards the
    STRUCTURAL inputs (distance, dead-calm floor, honest start read, fleet spread);
    it gains a made-good-efficiency assertion when that work lands stably.
  - `polar.ts` / `polarTable.ts` / `polarImport.ts` — boat speed from polar
    diagrams (parametric for catalogue boats, real tables for custom boats).
  - `sails.ts` — the wardrobe: `effectivePolar` (base lifted by every owned
    sail — the *planner's* boat: routing, targets, the fleet benchmark) and the
    **flown-sail spine** (`flownSailMul`/`raceWardrobe`): the ONE sail actually
    flying multiplies the BASE polar — a specialist earns its boost in its
    envelope and bites *below* base grossly outside it; the working set is
    exactly 1.0 and indestructible. Catalogue boats carry their class wardrobe
    free (`Boat.boatType`); custom boats their purchased sails. Manual changes
    go through `resolveSailChange` (gameEngine): time cost + a Bowman-weighted
    seeded bungle + a heavy-air blow-out roll — **exactly two RNG draws, only
    on a committed distinct change**, so a zero-change race is byte-identical
    to the pre-wardrobe game (pinned by `goldenRace.test.ts` — never re-bless
    those pins; fix the code instead). Event choices write the same
    `progress.activeSailId` via `TacticalChoice.setsSail`.
  - `router.ts` — isochrone-ish weather routing along the course. Takes an
    optional `WindSampler`; the briefing passes a forecast sampler (blurred by
    Navigator skill) so the *planned* route/ETA reflect the believed forecast,
    while the race loop routes on the true field.
  - `fleet.ts` — the AI competitors. Each is paced to a per-boat target finish
    derived from `fleetBenchmarkHours` → `cleanRunHours` (a deterministic headless
    run of *the player's own boat* through the real `stepRace` movement+wear model,
    not a route-only ETA — the latter drifts 2–3× off the lived finish in light,
    shifty air). Anchoring on the player's boat self-calibrates difficulty across
    courses *and* boats, so every race is a fight whatever you charter. A bounded
    boat-speed `edge` gives a quicker hull a modest lead across the line; the
    fleet's handicap is centred on the player's boat rating backed out by that
    edge, so **corrected (handicap) time is boat-neutral** — you win it by sailing
    above your rating (crew, effort, calls), not by buying speed. Course-side bias
    + variance shuffle the standings, and `FLEET_FRICTION` (pro 1.10, corinthian
    1.0) pads par so it's a clean run *in a real race*, not a frictionless cruise.
    **The fleet advance is FRICTIONLESS** — a competitor has no condition at all
    (`advanceFleet` carries a constant `paceScale`, no wear/effort/sail/decision
    time), so it never fades. The player DOES wear, so effort and wear are the
    player's lever *and* liability: on a long/light course, push + many sail changes
    can crater `conditionFactor` and turn a first-half lead into a back-half collapse
    against a fleet that holds pace. Handicap ratings are ORC-style, derived from the
    boat's polar (`engine/orc.ts`; authored `Boat.ratingTcc` is an override).
  - `geo.ts` — projections, bearings, distances. `rng.ts` — seedable RNG.
  - `recommend.ts` — home-screen race recommendation from the player profile.
  - `start.ts` — the race start: the start-line geometry (`startLineGeo`), the
    Navigator's pre-gun read (`startRead` — favoured end, OCS risk, hedged by
    confidence), and `resolveStart`, which turns the three start calls (end /
    approach / first beat) into the opening leg's advantage **resolved against the
    real wind & tide** (clean-/dirty-air `startSpeedMul` faded over the first leg,
    a committed bias, OCS/time penalty). Pure; the only chance is an injected roll.
  - Tactical decisions (`data/events.ts`) tagged `field: true` are *resolved
    against the real wind* in `applyDecision` via `resolveFieldDelta` (the single
    source of truth the cockpit preview shares, so the card can't promise what the
    resolution won't deliver) — a bold call only pays when the field supports it,
    and the edge decays (`edgeDecay`) if the boat sails past the trigger point.
    `tacticalRead` gives the Navigator's (confidence-hedged) hint; `vmgPreview`
    projects a field choice as an honest confidence *band* plus a per-choice
    downside line. `applyDecision` returns a typed `resolution` (bold/safe/hedge,
    paid-off/bungled) whose summary is the race-log line. **Crew roles are
    load-bearing** (`roleSkill`): the Navigator drives read confidence, the
    Tactician forgives part of a misread bold call, Bowman/Trimmer steady bungles
    on choices tagged `crewSkill`, the Skipper trims heavy-weather risk — all
    capped so a call never drops below half its authored risk
    (`decisionBungleChance`). Choices can `set` a transient situation
    (`RaceProgress.pendingSituation`, distance-bounded) that makes matching
    `followsFrom` follow-on events eligible & preferred in `pickEventForRace`;
    with nothing pending the draw is byte-identical to the plain picker (tested).
- **`src/data/`** — content & catalogues: `races.ts`, `boats.ts`, `crew.ts`,
  `provisions.ts`, `events.ts` (tactical decisions), `weather.ts`,
  `landmasses.ts`, `polarLibrary.ts`, `sails.ts`, `onboarding.ts`. `index.ts`
  re-exports and holds economy constants.
- **`src/store/`** — `gameReducer.ts` (the PURE economy/progression state machine:
  `(state, action) => state`, no React/Supabase — imports types/data/engine/reseed
  only, so it unit-tests in isolation; holds `INITIAL_STATE`, the affordability
  guards, and every persistent flag like `tutorialSeen`/`scoringSeen`), `GameContext`
  (wraps that reducer with persistence, cloud sync and the imperative race
  lifecycle), `authValidation.ts` (pure `validateCredentials`/`mapAuthError`, no
  Supabase), `AuthContext` (Supabase auth + the login gate), `storage.ts`
  (AsyncStorage; `keyFor` namespaces each account's cache), `reconcile.ts`
  (local↔cloud save merge). New persistent state folds in `gameReducer`, NEVER in
  `stepRace`/`applyDecision` (the determinism contract).
  **Free Sailing** (`GameState.freeSailing`) switches the whole budget layer off:
  the six reducer money cases (`ADD_FLEET_BOAT`/`BUY_SAIL`/`SELL_SAIL`/
  `BEGIN_RACE`/`FINISH_RACE`/`PREPARE_NEXT_RACE`) are the ONLY places money moves,
  and each one no-ops its funds math under the flag — funds freeze, boats become
  charters (`BEGIN_RACE` skips `ownedBoatIds`), results/career/honours still count.
  The engine NEVER reads the flag (goldens untouched); screens only hide money UI
  and relax afford gates. It's a TWO-WAY preference: newest save wins in
  `reconcile.ts` (never OR-union it like `tutorialSeen` — that would lock it on),
  and `RESET_CAMPAIGN` preserves it. If you add a new money source, route it
  through a reducer case and honour the flag there, not in a screen.
- **`src/screens/`** — one per screen; bottom tabs (Race/Fleet/Leaderboard/
  Profile) live under `Main`, with setup/race screens pushed over them. The
  setup→race flow is Provisioning → Briefing → **StartSequence** (the pre-gun
  start tactics; applies `resolveStart`'s outcome via the `APPLY_START` action) →
  RaceMap. The `ResultsScreen` debrief contrasts the sailed track with the optimal
  line (`RaceResult.trail`/`optimalRoute`/`optimalHours`, captured in `buildResult`).
- **`src/components/`** — `RouteMap` (the SVG chart, incl. the wind-speed
  heatmap), `PolarViewer`, `WindIndicator`, `ForecastScrubber` (briefing
  forecast timeline), `ForecastGraph` (the briefing meteogram — wind over the
  passage), `WindScaleLegend`, `windScale.ts` (the shared kn→colour ramp), etc.
  **`components/cockpit/`** is the racing screen's fixed frame: `RaceCockpit`
  (the flex contract — chart floor 260/300, the 2-D rail rule `width ≥ 900 OR
  usableHeight < 640`), `StatusRibbon` (elapsed + corrected standing/gap),
  `InstrumentBand`/`InstrumentCell` + `cells.ts` (exactly six cells; the pure
  cell builders + tint rules), `ControlDock`/`OverflowSheet`, and
  `DecisionDock` — the ONE docked lane decisions, the sail picker and the
  debrief ribbon all render through. The sim **HOLDS while a key decision is
  on the table** (any docked event, not just MOB — the free-running pace was
  unplayable; this is the second player-feedback swing on the ruling), but
  the hold blocks NOTHING else: the sail picker opens and commits over a held
  decision (the decision reclaims the lane, reads refreshed), every
  instrument and readout stays live. The picker and the ribbon alone never
  hold. The engine's live-opportunity machinery stays (draw-free
  `expireDecision`, event suppression on `progress.decisionTriggerNm`,
  `edgeDecay`) — "hold course" still retracts a decision draw-free; the edge
  simply cannot drain under a held card, so the UI no longer shows the bar.
  Sail changes commit at commit-time state, picker open or not. The
  ribbon's auto-continue is an independent `setTimeout`, never tick-driven.
  There is no racing Modal: `TutorialOverlay` is an inline coach strip.
  Motion comes from `lib/motion.ts` + `lib/useReducedMotion.ts` (core RN
  `Animated` only).
  **`components/harbour/`** is the home-screen dashboard (`HomeScreen` owns the
  weather fetch + demotion clocks; the dashboard stays props-driven). Its charts
  (`WorldChart` + `WindParticles`/`particleSwarm.ts`) paint the PredictWind look:
  a per-row heat wash + a colour-banded comet swarm. **Motion means live** — a
  live field (per-course/board/lattice ECMWF, `flowMotion` true) flies the
  swarm; a seasonal wash holds perfectly still (baked ERA5 world climatology in
  `data/worldClimatology.ts`, keyed off the `data/worldLattice.ts` ocean grid).
  The **global** map paints a real 36×13 ocean lattice (`fetchWorldFlow`),
  **never** IDW-across-oceans; a **region** map flies a live per-region lattice
  (`fetchRegionFlow`), else blends its course samples where
  `blendCoverageOk`/`regionBlendAllowed` clears the 500 km honesty gate, else
  (an ocean-sized box: usEast/usWest/ausNz) paints the **world field clipped to
  the box** (`worldField.ts` `regionWorldWash`/`resampleWorldToBounds` — live
  world lattice or baked seasonal world, real data everywhere, never a blank
  sea).
  Every painted chart carries a `provenance.ts` chip (live "as of HH:MM" /
  "Seasonal pattern · ERA5 · <Month>" / "Seasonal · indicative"). Reduced-motion
  swaps the swarm for still streamlets. All display-only; the engine and goldens
  never see any of it.
- **`src/services/`** — Supabase I/O (`cloudSave`, `leaderboard`, `profile`).
- **`src/navigation/AppNavigator.tsx`** — the navigator + the auth gate.
- **`supabase/schema.sql`** — the backend schema (tables, RLS, RPCs). Idempotent.

### Mental model of a race
`createWindField` seeds an evolving wind field for the course. Each tick,
`stepRace` advances the boat along its weather-routed track, samples the local
wind, derives boat speed from the polar × crew/hull condition × effort, wears
the boat, ranks against the AI fleet, and occasionally fires a decision. The
signature hazard is a set-piece tied to its mark (`Race.hazardWaypoint`).

## Conventions

- **TypeScript strict**; no `any` escapes. `npm run tsc` must be clean.
- **The engine is pure and deterministic** — all randomness goes through
  `engine/rng.ts` so tests can seed it (`setRng(mulberry32(seed))`).
- **Comments explain _why_**, not what — match the existing voice (concise,
  nautical, purposeful). Look at neighbouring files before adding code.
- **Theme tokens only** for styling (`src/theme`), never hard-coded colours.
- **Cloud is optional.** With no Supabase env vars the app runs local-only
  (guest, no login wall, no leaderboard) — keep that path working; it's also how
  CI/e2e run.

## Testing

- Unit tests live in `src/__tests__/`, one file per engine/data module. Prefer
  testing the pure engine over the UI; seed the RNG for determinism.
- **`goldenRace.test.ts` is the determinism contract**: three seeded headless
  playthroughs of the real `stepRace` loop pinned to exact outcomes AND the
  exact RNG draw count. If a pin moves, the change broke stream neutrality —
  fix it, don't re-bless. (A *deliberate* physics change — e.g. the wind-field
  pacing fixes — does move the pins; re-bless once, and only the pins the change
  provably explains: a field change re-seeds the whole run, a fleet/benchmark
  change moves only fleet-relative pins + the fleet-lifetime `rngDraws`. The GALE
  case sails a synthetic field, so it's the fleet-only canary.)
- **`racePlausibility.test.ts` is the per-race structural guardrail**: for EVERY
  race it asserts the structural inputs a fair race needs — declared `distanceNm`
  matches the waypoint geometry (±10%), the seeded field is never a dead calm, and
  the fleet is paced to a bounded spread. Cheap and deterministic (no headless race
  per course). It catches the RORC-600-class distance bug (600 authored vs 461
  sailed → "finished" at 77% progress). The stronger field-mean-vs-baseline
  assertion is deferred with the wind-lightness fix (see `wind.ts` above). Add a
  race → it must pass here (see "Adding content").
- Cockpit **render tests** (`*.test.tsx`) run under the same node jest against
  the lightweight react-native mock in `src/testing/` (mapped via
  `jest.config.js` moduleNameMapper) — they assert the TREE (no Modal
  mid-race, the chart outside every scroller, six cells), not pixels.
- The **e2e** (`e2e/playthrough.spec.ts`) plays a full race in the web build.
  Note: the dev sandbox often **cannot download the Playwright browser**
  (network policy), so e2e is validated by **CI**, not locally. Keep its
  selectors in sync when you change the onboarding/setup/race flow.

## Workflow & standards (important)

- **Branch:** develop on the session's designated branch; **always re-sync
  `main` before starting a PR** (`git fetch origin main` → branch off it). A past
  bug came from building a PR on top of an unmerged branch — don't repeat it.
- **PRs auto-merge on green.** The repo has "Allow auto-merge" on and branch
  protection requiring the `build-and-test` and `e2e` checks. Open a PR, enable
  auto-merge (squash), and it merges itself when CI passes — then Netlify
  deploys `main`. Only gate a merge manually when it changes production
  behaviour (e.g. the auth wall).
- **CI runs once per PR** (push triggers only on `main`; PRs validate via the
  `pull_request` event) and cancels superseded runs.
- **Secrets:** never commit them. `.env.example` documents the Supabase vars;
  real values live in `.env` (gitignored) and Netlify. The anon key is safe to
  ship; RLS protects data.
- **Schema changes:** edit `supabase/schema.sql` (idempotent) and tell the user
  to re-run it in their Supabase project — code degrades gracefully until then.
- Commit messages: clear and descriptive; end with the required co-author
  trailer.

## Adding content (races & boats)

Content lives in `src/data/`. Additions are validated by the **data-integrity
tests** in `src/__tests__/engine.test.ts` and by the **type system**, so a
missing piece fails loudly — `npm run tsc` and `npm test` are your checklist.

**Add a race** — append a `Race` to `src/data/races.ts`:
- Real `waypoints` (first `type: 'start'`, last `'finish'`), `prevailingWind`,
  `distanceNm`/`recordTimeHours` (gameplay-tuned), `corinthianRating` (1–5),
  both `divisions`, a `season`, and an optional `unlockAfter` (an existing race
  id) to slot it into the ladder.
- **`distanceNm` must match the sailed geometry** — `courseLengthNm(waypoints)`,
  within ±10% (`racePlausibility.test.ts` enforces it). It's the `total` the
  progress fraction divides by while the boat sails the *geometric* length, so a
  mismatch puts the finish line early/late from the gun (the RORC-600 bug: 600
  authored vs 461 sailed → "77% covered" at the start). Set it to `round(geo)`;
  the real-event distance is flavour for the description, not this field.
- **`recordTimeHours`** is the outright course record (often a maxi/multihull),
  used for provisioning day-count and forecast horizon — NOT a cruise yardstick.
  The fleet paces off `cleanRunHours` (a real cruise of the player's boat), so the
  benchmark is legitimately several× the record; don't "fix" a high ratio by
  slowing the record. `prevailingWind` squares the start line and seeds the start
  read — keep its direction roughly aligned with the baked climatology
  (`weatherClimatology.ts`) the race actually sails, or the pre-gun favoured-end
  read is computed against a breeze the fleet never sees.
- Pick a `hazard` and set `hazardWaypoint` to **one of the race's waypoint
  names** — the signature decision fires there.
- **Reusing an existing hazard?** Done. **New hazard?** Add the key to
  `HazardKey` (`types`) and TypeScript will then *force* you to complete it:
  an entry in `HAZARD_EVENTS` (`data/events.ts`) and `HAZARD_WEATHER_BIAS`
  (`data/weather.ts`). Optionally add a `hazardProfile` case in
  `engine/wind.ts` (it has a sensible default) and list the race under its
  region in `REGION_RACES` (`data/onboarding.ts`) so onboarding recommends it.
- **Generate the coastline.** Re-run `node scripts/build-coastlines.mjs` (it
  reads the waypoints straight from `races.ts`, so there's nothing to hand-sync)
  to regenerate `src/data/landmasses.ts`, then commit it. This both draws land on
  the chart **and** makes the router route *around* it — a land-locked or coastal
  course will otherwise sail straight over land. The `coastline coverage` test in
  `src/__tests__/land.test.ts` fails loudly if a race has no entry, and the
  per-race land audit there proves the routed track stays in the water. (Sources:
  Natural Earth files in `/tmp` — see the script header — plus the
  `polygon-clipping` dev dep. A genuinely open-ocean course can keep an empty
  `[]` entry, but the key must exist.)
- **Bake the weather.** Re-run `node scripts/build-weather.mjs` (it also reads
  `races.ts`) to regenerate `src/data/weatherClimatology.ts` — the realistic
  seasonal baseline `createWindField` seeds from. With `api.open-meteo.com`
  reachable it pulls real wind stats for the course's waters in its season;
  offline it writes a deterministic `seed` baseline from the prevailing wind, so
  the file is always complete (CI/e2e never touch the network). The `weather
  climatology coverage` test in `src/__tests__/wind.test.ts` fails loudly if a
  race has no entry. Gotchas: the `sampledAt` field is the *build* date, not the
  month sampled (the query uses each race's `season`, so the stats ARE season-
  correct — the label just misleads); and the baseline samples the **waypoint
  centroid**, which for a long, sheltered course (r2ak up the Inside Passage) can
  land in dead air and read too light — re-vet the sample point for such courses.
- See the **Race to Alaska** (`race-r2ak`, hazard `tidal_rapids`) as the worked
  example of a brand-new hazard done end to end.

**Add a boat** — append a `Boat` to `src/data/boats.ts` with a non-zero
`crewCapacity` (or the crew screen blocks signing), a price, `baseSpeed`, and
0–100 `upwind`/`downwind`/`stability`. Give it a realistic `ratingTcc` (IRC-style
handicap; corrected time = elapsed × TCC — heavier/faster boats rate higher and
owe time); custom builds derive one via `ratingTccFor`. Catalogue boats use the
parametric polar; players build custom boats (real polars) via the Boat Builder.

**Add crew** — append a `CrewMember` to `src/data/crew.ts` with a `tier`
(`pro` | `corinthian`), a `role`, `age`/`homePort`/`bio` (keep the wit), and
0–100 `skill`/`stamina`/`morale`. The tier is load-bearing: Corinthian races are
**amateur-only and unpaid** (`wage: 0`), the Pro division hires `pro` sailors and
pays their `wage`. `skill` feeds boat speed (`crewSkillFactor`) and steadies
decisions, so rate it honestly. The crew-integrity tests in
`src/__tests__/crew.test.ts` enforce the roster shape (four sailors per role per
tier, unpaid Corinthians) — keep them in sync.

**Add a provision** — append a `Provision` to `src/data/provisions.ts`. Set its
`kind`: a **`consumable`** (Food/Water) needs a `crewDaysPerUnit` (how many
crew-days one unit feeds) — the boat must be stocked for `crew × passage days`
(`provisioningPlan`/`estimatePassageDays`), and short rations dent starting crew
condition. **`equipment`** (Medical/Spares/Safety) is a one-off fit-out:
`repairBoost` resists hull wear, `safetyBoost` cuts incident/retirement risk,
both with saturating returns. Auto-provision presets (`autoProvision`) and the
effects are covered by `src/__tests__/provisioning.test.ts`.

## Gotchas

- After a squash-merge, your local `main` is behind — re-fetch before the next PR.
- `resolveBoatById` substitutes a custom boat's **effective polar** (base +
  sails) for racing; don't bypass it.
- Wear accrues by geometric progress (`df` sums to ~1 over a race), so wear
  coefficients are "points lost over a whole race". Only a destroyed hull
  retires you; an exhausted crew just sails slowly.
- **The tide floor is now ABSOLUTE and symmetric.** A foul stream can slow the
  made-good rate but never below `TIDE_FLOOR_KN` (0.2 kn), and it's the SAME floor
  for the player (`stepRace`, `gameEngine.ts`) and the fleet (`advanceFleet`,
  `fleet.ts`) — both import it from `engine/current.ts`. It used to be RELATIVE for
  the player (20 % of the boat's own tide-free speed), which in light air let the
  player crawl far below the fleet's absolute floor and ballooned long races. If you
  touch this, keep the two sides on the one shared constant — the asymmetry was a
  real, hard-to-find balloon. Algebraically the tide term is a no-op unless a strong
  foul stream trips the floor, so a slack-tide race is byte-identical (two of the
  three goldens are — only the offshore, tide-fed one re-blessed).
- **The wear-differential trap.** The player wears; the AI fleet never does
  (`advanceFleet` is frictionless). So an exhausted crew doesn't just "sail slowly"
  — it bleeds ground to a fleet holding pace, and on a long race can drop a leader
  through the whole fleet late. `push` (`EFFORT_WEAR`) and each sail change (the
  saturating stamina tax in `resolveSailChange`) are the drains; the aggressive
  auto-helm firing many changes was a big one. These wear INPUTS are golden-safe to
  tune (goldens sail cruise/manual); the `conditionFactor` floors are NOT (they gate
  `cleanRunHours`, moving every golden's player pins). If push/aggressive "feels like
  a self-destruct," that's the differential — tune the inputs, not the floor.
- **The auto-helm can be its OWN trap** (separate from wear). The real drain from
  over-trading isn't the stamina tax — it's the **flown-sail speed penalty**: a
  specialist hoisted then left up as the wind moves outside its envelope multiplies
  the polar by <1 (`sails.ts` `OUT_OF_BOX_PENALTY`), and the anti-flap **dwell gate**
  used to trap that losing sail up for the whole dwell window (auto "Balanced" nearly
  *doubled* a lived race). Fix in `autoSailTarget` (`gameEngine.ts`): a **protective
  douse** — the flown sail biting below base at the live point — bypasses the dwell
  and returns to the indestructible working set immediately. All auto-sail knobs are
  golden-safe (goldens sail `DEFAULT_STRATEGY` = cruise + `sailMode` undefined, so
  `autoSailTarget`/`resolveSailChange` never fire).
