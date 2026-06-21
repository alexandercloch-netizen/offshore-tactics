# Offshore Tactics

A sailing strategy game for iOS and Android, built with **React Native**, **Expo**
and **TypeScript**. Pick an offshore race, charter a boat, sign a crew, provision
for the passage, then sail leg by leg — reading the weather and making the
tactical calls that decide whether you take line honours or limp home.

## Gameplay loop

1. **Home** — your harbour. See funds, wins and your logbook of past races.
2. **Select a Race** — from a short inshore sprint to a transatlantic passage.
   Each race has an entry fee, a prize purse, a fleet size and a course record.
3. **Choose Your Boat** — charter a boat whose speed, pointing, running and
   stability suit the course.
4. **Sign Your Crew** — fill the boat's berths. Crew skill, stamina and morale
   feed directly into boat speed and resilience.
5. **Provision the Boat** — buy food, water, medical, spares and safety gear.
   Provisions boost crew condition, hull integrity and reduce incident risk —
   all within your budget.
6. **Race** — sail the course one leg at a time. Watch the wind, hull integrity
   and crew condition, and resolve **tactical decisions** (wind shifts, squalls,
   spinnaker calls, gear failures) that trade time against risk.
7. **Results** — finishing position, elapsed time and prize money are tallied,
   funds updated and the result written to your logbook.

## Game model

The simulation lives in `src/engine/gameEngine.ts`:

- **Speed** is derived from the boat's base speed, its rating for the current
  point of sail, the weather's speed modifier, and crew stamina/morale plus hull
  integrity.
- **Each leg** wears the crew and hull (scaled by weather risk). Tactical choices
  add or save time and apply stamina/morale/hull deltas, with a gamble: a failed
  risk roll costs extra time and damage.
- **Position** is estimated each leg by comparing your pace against the course
  record, across the size of the fleet.
- **Retirement** happens if hull integrity or crew stamina hits zero.

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
  engine/gameEngine.ts          Core simulation (speed, legs, results)
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
- react-native-svg (wind compass & route map)
- AsyncStorage (local persistence + offline fallback)
- Hosted on Netlify
