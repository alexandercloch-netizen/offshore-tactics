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
    (`applyDecision`), results, costs, progression/unlocks.
  - `wind.ts` — the analytic wind field (`createWindField`/`sampleWind`), the
    chart grid (`sampleWindGrid`), the drifting puff/hole (`featureState`),
    forecast (`weatherOutlook`), and pressure hints.
  - `polar.ts` / `polarTable.ts` / `polarImport.ts` — boat speed from polar
    diagrams (parametric for catalogue boats, real tables for custom boats).
  - `sails.ts` — specialist-sail wardrobe → effective polar.
  - `router.ts` — isochrone-ish weather routing along the course.
  - `fleet.ts` — the AI competitors (skill + course-side bias + variance).
  - `geo.ts` — projections, bearings, distances. `rng.ts` — seedable RNG.
  - `recommend.ts` — home-screen race recommendation from the player profile.
- **`src/data/`** — content & catalogues: `races.ts`, `boats.ts`, `crew.ts`,
  `provisions.ts`, `events.ts` (tactical decisions), `weather.ts`,
  `landmasses.ts`, `polarLibrary.ts`, `sails.ts`, `onboarding.ts`. `index.ts`
  re-exports and holds economy constants.
- **`src/store/`** — `GameContext` (the game state reducer + persistence + cloud
  sync), `AuthContext` (Supabase auth + the login gate), `storage.ts`
  (AsyncStorage), `reconcile.ts` (local↔cloud save merge).
- **`src/screens/`** — one per screen; bottom tabs (Race/Fleet/Leaderboard/
  Profile) live under `Main`, with setup/race screens pushed over them.
- **`src/components/`** — `RouteMap` (the SVG chart), `PolarViewer`,
  `WindIndicator`, `TacticalDecisionModal`, etc.
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
- Pick a `hazard` and set `hazardWaypoint` to **one of the race's waypoint
  names** — the signature decision fires there.
- **Reusing an existing hazard?** Done. **New hazard?** Add the key to
  `HazardKey` (`types`) and TypeScript will then *force* you to complete it:
  an entry in `HAZARD_EVENTS` (`data/events.ts`) and `HAZARD_WEATHER_BIAS`
  (`data/weather.ts`). Optionally add a `hazardProfile` case in
  `engine/wind.ts` (it has a sensible default) and list the race under its
  region in `REGION_RACES` (`data/onboarding.ts`) so onboarding recommends it.
- Coastline on the chart is **optional** — `RouteMap` draws sea + the route
  without it; add a `LANDMASSES[raceId]` entry (see `scripts/build-coastlines.mjs`)
  later if you want land drawn.
- See the **Race to Alaska** (`race-r2ak`, hazard `tidal_rapids`) as the worked
  example of a brand-new hazard done end to end.

**Add a boat** — append a `Boat` to `src/data/boats.ts` with a non-zero
`crewCapacity` (or the crew screen blocks signing), a price, `baseSpeed`, and
0–100 `upwind`/`downwind`/`stability`. Catalogue boats use the parametric polar;
players build custom boats (real polars) via the Boat Builder.

## Gotchas

- After a squash-merge, your local `main` is behind — re-fetch before the next PR.
- `resolveBoatById` substitutes a custom boat's **effective polar** (base +
  sails) for racing; don't bypass it.
- Wear accrues by geometric progress (`df` sums to ~1 over a race), so wear
  coefficients are "points lost over a whole race". Only a destroyed hull
  retires you; an exhausted crew just sails slowly.
