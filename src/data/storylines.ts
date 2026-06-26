import { SignatureOutcome, StoryBeat, Storyline } from '../types';

// ---------------------------------------------------------------------------
// Per-race storylines (PR1: three flagships only).
//
// Each storyline is SELF-CONTAINED — a theme, the stakes, a coached tactical
// note, a briefing scene, the pinned signature beat (tied to the race's
// hazardWaypoint, and linked from the matching HAZARD_EVENT via `storyBeat`),
// and three short debrief variants keyed to the bold / safe / hedge outcome.
// No cross-race continuity and no persisted meta-state. Un-storied races simply
// have no entry, so `storylineForRace` returns undefined and nothing changes.
//
// The signature beat's `pinnedWaypoint` must be a real waypoint name on the
// race (asserted by the storyline tests); the engine fires the pinned event
// there, exactly once.
// ---------------------------------------------------------------------------

export const STORYLINES: Storyline[] = [
  // -- Rolex Fastnet: the gale approach to the Rock --------------------------
  {
    raceId: 'race-fastnet',
    theme: 'The long beat to the Rock — and the Celtic Sea snarling to meet you.',
    stakes:
      "Six hundred and ninety-five miles of Channel and Atlantic stand between Cowes and Cherbourg, and the whole race hinges on one grey lump of granite. Round the Fastnet clean and the fleet is behind you; round it badly and the Celtic Sea makes you pay all the way home.",
    coached:
      'Navigator: the gale fills in as we close the Rock. Carry sail and we round before the worst — but the rig and the crew take a hammering. Ease early and we round safe but slow. Your call, skipper.',
    beats: [
      {
        kind: 'briefing',
        body: "Out past the Lizard the swell lengthens and the sky to the west goes the colour of old pewter. Everyone aboard knows the story — the Rock is where this race is won or lost, and the forecast says it won't be gentle.",
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Fastnet Rock',
        body: 'The Fastnet looms out of the murk, the light wheeling overhead, the sea heaping up white on the granite. The barometer is still falling. Get round now, hard, before the front lands — or shorten down and round her safe in the building gale.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You carried sail and drove her round the Rock with the rail down and water over the deck. Bold, and it bought you miles on the boats that flinched — but the boat and the crew wear the marks of it all the way to Cherbourg.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You shortened down and rounded the Fastnet under control, the boat looked after and the crew dry-ish. The bolder boats stole a march at the Rock — but a kept boat is a finishing boat, and you brought her home whole.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You threaded it — enough sail to keep her driving, enough caution to keep her safe — and rounded the Rock without drama. No heroics, no disasters: a navigator\'s rounding, and the race still all to sail.',
      },
    ],
  },

  // -- Newport Bermuda: the Gulf Stream warm-eddy hunt -----------------------
  {
    raceId: 'race-newport-bermuda',
    theme: 'The Thrash to the Onion Patch — and the river of warm water in the way.',
    stakes:
      "Six hundred and thirty-five miles to Bermuda, and a band of moving ocean decides them all. The Gulf Stream spins off warm eddies that can hand you a two-knot lift toward the finish — or a foul meander that quietly drowns your race. Find the right water and St David's is yours.",
    coached:
      "Navigator: I've plotted a warm eddy spinning off the Stream, off to the side of the rhumb. Divert and we hook a fair push toward Bermuda — extra miles for a real gain. Hold the line and we save the distance, but we gamble on what the Stream is doing under us.",
    beats: [
      {
        kind: 'briefing',
        body: "The sea-surface charts come aboard before the start: the Stream lies across the course like a coiled snake, warm filaments curling north and south of the rhumb. Bermuda is downstream of a decision nobody can see from the deck — only read from the water temperature and the navigator's nerve.",
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Gulf Stream',
        body: 'The water temperature jumps and the sea turns that deep Gulf-Stream blue. The navigator has a warm eddy plotted off to one side — a favourable current, if it\'s really there. Divert and ride it toward Bermuda, or hold the rhumb line and trust the Stream not to bite?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You committed to the eddy, sailed the extra miles, and hooked the warm push toward Bermuda. When the current is with you it feels like cheating — the log reading nonsense and the miles to St David\'s melting away.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held the rhumb line and refused the detour, banking the distance over the gamble. No two-knot windfall — but no foul meander either, and the navigator slept easier for the call.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You shaded toward the warm water without fully committing to the eddy — a foot in both camps. A touch of the favourable push, none of the big risk: the cautious read of a tricky Stream crossing.',
      },
    ],
  },

  // -- Rolex Sydney Hobart: the Southerly Buster across Bass Strait ----------
  {
    raceId: 'race-sydney-hobart',
    theme: 'Boxing Day south — and the Southerly Buster waiting in Bass Strait.',
    stakes:
      "Six hundred and twenty-eight miles down to Hobart, and Bass Strait is where the race shows its teeth. A violent southerly change can slam across the Strait in minutes, turning a downwind charge into a brutal beat into breaking seas. How you meet the Buster decides whether you race to Hobart or merely survive to it.",
    coached:
      'Navigator: the southerly change is on us, fast and mean across the Strait. Drive the boat hard into it and we hold our line for the miles — but she\'ll take a beating and so will the crew. Run off and we ride it out safe, giving ground to live and fight south of it.',
    beats: [
      {
        kind: 'briefing',
        body: 'Past the Heads the fleet stretches south in a fair nor\'easter, spinnakers up, Hobart on everyone\'s mind. But the synoptic chart has a front marching up from the Southern Ocean — and Bass Strait is exactly where it will catch you.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Bass Strait',
        body: 'The Buster hits — the wind backs hard into the south and slams on in the space of a few minutes, the sea standing up grey and breaking. Drive the boat into it for the hard-won miles, or bear away and run off to ride out the worst?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You drove her straight into the change, punching the breaking seas for every yard. Brutal on the boat and brutal on the crew — but you held your line through the Strait while others bore away, and that is how Hobart is won.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You bore away and ran off ahead of the worst, easing the loads and keeping crew and boat in one piece. You gave up ground in the Strait — but the boats that pressed too hard left gear and skin out there, and you didn\'t.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You met the Buster on a working angle — neither charging into it nor fleeing it — and worked the boat through the change under control. A seamanlike passage of Bass Strait, with the race still open south of the Strait.',
      },
    ],
  },
];

// Lookup: the storyline authored for a race, or undefined for an un-storied one.
export function storylineForRace(raceId?: string): Storyline | undefined {
  return STORYLINES.find((s) => s.raceId === raceId);
}

// The pinned signature beat for a storyline (the one tied to a course mark).
export function signatureBeat(story: Storyline): StoryBeat | undefined {
  return story.beats.find((b) => b.kind === 'beat');
}

// The debrief beat matching a signature outcome, for the results screen.
export function debriefBeat(
  story: Storyline,
  outcome: SignatureOutcome
): StoryBeat | undefined {
  return story.beats.find((b) => b.kind === 'debrief' && b.outcome === outcome);
}
