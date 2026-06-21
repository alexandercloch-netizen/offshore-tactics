# Offshore Tactics

A sailing strategy game for iOS and Android, built with **React Native**, **Expo**
and **TypeScript**. Pick an offshore race, charter a boat, sign a crew, provision
for the passage, then sail leg by leg — reading the weather and making the
tactical calls that decide whether you take line honours or limp home.

## Gameplay loop

1. **Home** — your harbour. See funds, wins and your logbook of past races.
2. **Select a Race** — a ladder of real offshore classics (Round the Island,
   Chicago–Mac, Rolex Middle Sea, Newport Bermuda, Rolex Fastnet, RORC
   Caribbean 600, Rolex Sydney Hobart, Transpac). Each shows a Corinthian
   accessibility rating and offers a **Corinthian** division (cheaper, more
   forgiving) or a **Pro** division (steeper entry, bigger purse, near-record
   pace required). Premier races **unlock** as you finish earlier ones.
3. **Choose Your Boat** — charter a boat whose speed, pointing, running and
   stability suit the course.
4. **Sign Your Crew** — fill the boat's berths. Crew skill, stamina and morale
   feed directly into boat speed and resilience.
5. **Provision the Boat** — buy food, water, medical, spares and safety gear.
   Provisions boost crew condition, hull integrity and reduce incident risk —
   all within your budget.
6. **Race** — the boat sails the **real course** continuously (pause any time),
   tracked by **distance covered / remaining, % done, speed and ETA** on a chart
   of the actual waypoints. There are no "legs" — conditions evolve and
   **tactical decisions** interrupt the race at random, just like the real
   thing. Each decision shows your current **VMG** and the projected VMG for
   every choice. Events include race-specific **signature hazards** (Gulf Stream
   eddies, Bass Strait southerly busters, light-air parking lots),
   **weather-on-the-horizon** calls, crew-morale moments, and the rare,
   high-stakes **man overboard**. Low crew morale slows the boat and makes
   incidents more likely, so look after your people.
7. **Results** — finishing position, elapsed time and prize money are tallied,
   funds updated and the result written to your logbook.

## Game model

The simulation lives in `src/engine/gameEngine.ts` and is a pure,
distance-based model (no React Native imports), which keeps it fast and fully
unit-testable:

- **Continuous distance model.** `stepRace` advances the boat a small slice of
  the course each tick, accumulating elapsed time from speed. The UI auto-plays
  these ticks; decisions are scheduled at random distances and pause the race.
- **Real geography.** Each race carries real `waypoints` (`src/engine/geo.ts`
  does haversine distance, bearings and along-track interpolation). The chart
  also draws real **land masses** (`src/data/landmasses.ts`): Natural Earth
  1:10m coastlines clipped to each course, with lakes carved out so e.g. Lake
  Michigan stays water on the Chicago–Mac map.
- **Weather routing (the route follows the wind).** The mandatory marks are
  fixed by the rules, but the path between them is computed from the wind, the
  way real navigators route a boat:
  - **Polars** (`src/engine/polar.ts`): boat speed as a function of true wind
    angle and speed, with a no-go zone — so you cannot sail straight upwind.
  - **Wind field** (`src/engine/wind.ts`): a seeded, analytic spatial +
    temporal field per race (prevailing wind + shifts, a systematic veer, a
    speed gradient and a drifting puff/hole), flavoured by the race's hazard.
  - **Isochrone router** (`src/engine/router.ts`): a time-optimal solver that
    tacks upwind and gybes downwind to the laylines, routing the active leg and
    rhumb-lining the marks beyond it.
  - **Dynamic re-routing**: as the field evolves the engine re-plans (on a wind
    shift, a mark rounding, or periodically), so the displayed track bends and
    the boat tacks through the race. The **point of sail** is the boat's real
    heading vs the local wind.
- **A real AI fleet** (`src/engine/fleet.ts`) sails the same course and wind
  field. Competitors advance on a fast velocity-made-good model (so the fleet
  spreads out under the same weather) with seeded per-boat skill — tighter and
  faster in the pro division. Your **standing is your real rank** in the fleet,
  it updates live on the chart, and a costly tactical decision lets the fleet
  sail past you. Manage the boat well or you'll drop down the order.
- **Interactive tactics.** Two dials you control live during the race:
  - **Effort** — *Conserve / Cruise / Push*. Push sails ~8% faster but wears the
    crew and hull harder and raises incident risk; Conserve nurses the boat home.
  - **Routing bias** — *Bank Left / Optimal / Bank Right*. Banking commits the
    route to a side of the course via a strategic waypoint. The autopilot only
    routes on the wind as it is *now*, so reading the **pressure hint** ("more
    breeze to the NW") and banking into a developing shift or puff can beat the
    optimizer — or cost you if you call it wrong.
- **Speed** comes from the boat's base speed, its rating for the current point of
  sail, the weather's modifier, and crew stamina/morale plus hull integrity.
- **Wear** scales with the fraction of the course sailed and the weather risk;
  tactical choices apply time/stamina/morale/hull deltas with a gamble (a failed
  risk roll, more likely when morale is low, costs extra time and damage).
- **Position** is estimated from your pace vs the division's pace target across
  the fleet; **retirement** happens if hull or crew stamina hits zero.
- **Determinism for tests.** All randomness flows through `src/engine/rng.ts`;
  tests call `setRng(mulberry32(seed))` to pin the sequence.

## Testing & CI

```bash
npm test          # run the Jest unit suite
npm run tsc       # type-check
npm run build:web # produce the static web bundle
```

The engine and data layer are covered by deterministic **Jest** unit tests
(`src/__tests__/`) using a seeded RNG — geometry, polars, the wind field, the
isochrone router (upwind legs tack and end on the mark), divisions, unlocks, a
full simulated race, decisions and result/prize logic. A **GitHub Actions**
workflow (`.github/workflows/ci.yml`) gates every push and PR on type-check,
unit tests, and a web-build smoke test.

### Regenerating coastlines

`src/data/landmasses.ts` is generated and committed, so the app and CI need no
network access. To rebuild it (e.g. after changing a course), download the
public-domain Natural Earth 1:10m sources into `/tmp`
(`ne_10m_land.json`, `ne_10m_minor_islands.json`, `ne_10m_lakes.json` from
[martynafford/natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson))
and run:

```bash
node scripts/build-coastlines.mjs   # needs the polygon-clipping dev dependency
```

State is managed with a reducer in `src/store/GameContext.tsx` and persisted to
device storage via `@react-native-async-storage/async-storage`.

## Project structure

```
App.tsx                         App entry: providers + navigation
netlify.toml                    Netlify build config (web export)
.env.example                    Supabase env var template
supabase/schema.sql             Tables + row-level security policies
src/
  types/index.ts                Shared domain & navigation types
  theme/index.ts                Nautical color palette, spacing, type scale
  lib/supabase.ts               Supabase client (offline-safe)
  data/                         Static game content
    races.ts boats.ts crew.ts provisions.ts events.ts weather.ts
    index.ts                    Re-exports + lookup helpers
  engine/
    gameEngine.ts               Core simulation (routed model, results)
    geo.ts                      Haversine, bearings, projection helpers
    polar.ts                    Boat polar (speed vs wind angle/strength)
    wind.ts                     Spatial + temporal wind field
    router.ts                   Isochrone weather routing
    fleet.ts                    AI competitor fleet & live standings
    rng.ts                      Seedable RNG for deterministic tests
  __tests__/                    Jest unit tests (engine, polar, wind, router, fleet, geo, rng)
  services/
    cloudSave.ts                Per-user cloud save (Supabase)
    leaderboard.ts              Submit/fetch global leaderboard
  store/
    storage.ts                  AsyncStorage persistence
    AuthContext.tsx             Supabase auth session + sign in/up/out
    GameContext.tsx             Reducer state, cloud sync, leaderboard
  navigation/AppNavigator.tsx   Native stack navigator
  components/
    NauticalButton.tsx StatBar.tsx WindIndicator.tsx
    RouteMap.tsx TacticalDecisionModal.tsx
  screens/
    HomeScreen.tsx AuthScreen.tsx LeaderboardScreen.tsx
    RaceSelectScreen.tsx BoatSelectScreen.tsx
    CrewSelectScreen.tsx ProvisioningScreen.tsx
    RaceMapScreen.tsx ResultsScreen.tsx
```

## Getting started

```bash
npm install
npm start          # start the Expo dev server
# then press i (iOS simulator), a (Android), or w (web)
```

Other scripts:

```bash
npm run ios        # open in the iOS simulator
npm run android    # open on an Android device/emulator
npm run web        # run in the browser
npm run tsc        # type-check the project
```

## Backend & deployment (Supabase + Netlify)

Cloud features (sign-in, per-user cloud save, global leaderboard) are powered by
**Supabase** and the web build is hosted on **Netlify**. Everything degrades
gracefully: if the Supabase env vars are absent the app still builds and runs in
local-only (offline) mode, so the site never fails to deploy.

### 1. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the contents of [`supabase/schema.sql`](supabase/schema.sql).
   This creates the `saves` and `leaderboard` tables with row-level security.
3. Under **Authentication → Providers**, ensure **Email** is enabled. For the
   smoothest demo you can disable "Confirm email" (Authentication → Settings);
   otherwise users must confirm via email before their first sign-in.
4. From **Project Settings → API**, copy the **Project URL** and the **anon
   public** key.

### 2. Configure environment variables

Both are `EXPO_PUBLIC_*` so they're inlined into the client bundle at build time.
The anon key is safe to expose — RLS protects the data.

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

- **Local:** copy `.env.example` to `.env` and fill these in.
- **Netlify:** add both under **Site settings → Environment variables**.

### 3. Deploy to Netlify

The repo includes [`netlify.toml`](netlify.toml):

```toml
[build]
  command = "npm run build:web"   # expo export --platform web
  publish = "dist"
```

Then:

1. Push this repo to GitHub.
2. In Netlify, **Add new site → Import an existing project**, pick the repo.
3. Netlify reads `netlify.toml`, so the build command and publish dir are set
   automatically. Add the two `EXPO_PUBLIC_*` env vars before the first build.
4. Deploy. Netlify runs `npm run build:web`, which produces the static `dist/`
   bundle and serves it.

To build locally and preview the production bundle:

```bash
npm run build:web
npx serve dist        # or any static file server
```

### 4. Supabase auth redirect (web)

Add your Netlify site URL (and `http://localhost:8081` for local web) to
**Authentication → URL Configuration → Redirect URLs** in Supabase so email
links resolve back to the app.

## Tech stack

- Expo SDK 51 / React Native 0.74 (web via react-native-web)
- TypeScript (strict)
- React Navigation (native stack)
- Supabase (auth, Postgres cloud save, leaderboard) with row-level security
- react-native-svg (wind compass & real-course chart)
- AsyncStorage (local persistence + offline fallback)
- Jest + ts-jest unit tests; GitHub Actions CI
- Hosted on Netlify
