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
src/
  types/index.ts                Shared domain & navigation types
  theme/index.ts                Nautical color palette, spacing, type scale
  data/                         Static game content
    races.ts boats.ts crew.ts provisions.ts events.ts weather.ts
    index.ts                    Re-exports + lookup helpers
  engine/gameEngine.ts          Core simulation (speed, legs, results)
  store/
    storage.ts                  AsyncStorage persistence
    GameContext.tsx             Reducer-based game state + actions
  navigation/AppNavigator.tsx   Native stack navigator
  components/
    NauticalButton.tsx StatBar.tsx WindIndicator.tsx
    RouteMap.tsx TacticalDecisionModal.tsx
  screens/
    HomeScreen.tsx RaceSelectScreen.tsx BoatSelectScreen.tsx
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

## Tech stack

- Expo SDK 51 / React Native 0.74
- TypeScript (strict)
- React Navigation (native stack)
- react-native-svg (wind compass & route map)
- AsyncStorage (persistence)
