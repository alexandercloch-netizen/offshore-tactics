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

  // -- Round the Island: the Needles tidal gate ------------------------------
  {
    raceId: 'race-round-island',
    theme: 'Fifty miles, one tide — and the gate at the Needles that decides them.',
    stakes:
      'A thousand boats and a single morning to lap the Wight. The race is a clock as much as a course: the Solent stream turns foul off the Needles, and the fleet that slips through before the gate slams sails away from the fleet that doesn\'t. Make the gate and the back of the island is a procession; miss it and you stand still while the tide does the racing.',
    coached:
      'Navigator: the ebb is about to set hard against us at the Needles. Carry pace and we shoot the gap on the last of the fair tide — but it\'s a knife-edge, and a miss leaves us pinned. Tuck inshore under the cliffs and we cheat the worst of the foul stream, slower but certain.',
    beats: [
      {
        kind: 'briefing',
        body: 'Out of the Solent in the morning press, spinnakers blooming, the chimney of the Needles lighthouse already fine on the bow. Every navigator aboard is doing the same sum — tide height, time to the gate, and whether the stream turns before or after you get there.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'The Needles',
        body: 'The Needles rear up white off the bow and the tide-line stands clear on the water — fair stream this side, a foul wall of it the other. The gate is closing. Drive hard and shoot it on the last of the ebb, or duck in tight under the cliffs and creep through the back eddy?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You sent it at the gate and shot the Needles on the dying ebb, the fleet behind you sliding to a halt as the stream turned. Timed to the minute — the back of the island opened up clear and you were gone before they could follow.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You tucked in under the cliffs and crept through the back eddy, out of the worst of the foul stream. No glory in it, and the gate-runners stole a march — but you never stopped dead in the tide-line the way the gamblers who mistimed it did.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You shaded toward the gate without fully committing — close enough to catch some of the fair tide, cautious enough not to be caught out if it shut early. A navigator\'s rounding of the Needles, the race still there to be sailed down the back of the island.',
      },
    ],
  },

  // -- Chicago–Mac: inside vs outside the Manitous ---------------------------
  {
    raceId: 'race-chicago-mac',
    theme: 'Three hundred miles up the lake — and the fork at the Manitous.',
    stakes:
      'No tides on Lake Michigan, only patience and a hard choice in the narrows. At the Manitou Islands the fleet splits: inside the islands through the passage, short and sheltered but liable to go glassy in the lee; or outside in the open lake, more miles but live air. Pick the side the breeze rewards and Mackinac is yours; pick the parking lot and you watch the rest sail by.',
    coached:
      'Navigator: the Manitous are the whole race. Inside the passage saves us miles and gives a lee out of the chop — but if it goes light in there we sit. Outside is open water and steadier breeze for the extra distance. It\'s a pure read of where the wind holds, skipper.',
    beats: [
      {
        kind: 'briefing',
        body: 'A day and a night up the lake, the Wisconsin shore a low smudge to port, and the navigator already chalking the islands. The Manitous are coming — and somewhere past midnight you\'ll have to call which side of them to take.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Manitou Passage',
        body: 'The dark loom of the Manitou Islands fills the bow. The fleet is fanning out — lights peeling off inshore for the passage, others holding wide for the open lake. Take the inside line and bank the miles in the lee, or stay outside in the live breeze?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You cut inside the Manitous and the gamble held — the breeze stayed in the passage and you banked the miles in flat water while the outside boats sailed the long way round. The short road paid, and you came out the top end with a lead.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held outside in the open lake, trading the short cut for breeze you could trust. More miles under the keel — but you kept the boat moving while the inside fleet risked the glass-off, and steady speed up a long lake is never the wrong answer.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You split the difference — edged toward the islands but kept an exit to the open lake, refusing to bet the race on one side of the Manitous. A touch of the short road, none of the trap: the cautious passage of the lake\'s big fork.',
      },
    ],
  },

  // -- Rolex Middle Sea: the Strait of Messina current ribbon ----------------
  {
    raceId: 'race-middle-sea',
    theme: 'Round Sicily by Stromboli\'s light — and through the ribbon at Messina.',
    stakes:
      'Six hundred miles of fickle Mediterranean air around Sicily, and the race squeezes to a thread at the Strait of Messina. A real tidal stream runs the narrows — the Scylla and Charybdis of the old charts — and it can slingshot you north or stop you cold. Time the ribbon right and Stromboli\'s glow is a victory lap; time it wrong and the strait spits you out at the back.',
    coached:
      'Navigator: Messina is a current ribbon, not a wind call. The stream sets north through the narrows on the flood and I have the window plotted — commit to it and we slingshot through. Hesitate or play it safe down the middle and we take whatever the strait gives us, which on a foul tide is precious little.',
    beats: [
      {
        kind: 'briefing',
        body: 'Up the east coast of Sicily in the dark, Etna a black mass to port and the lights of Messina drawing the fleet into the funnel. The navigator is watching the tide tables harder than the wind — the strait runs to its own clock, and the gun gave you no say over when you\'d arrive.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Strait of Messina',
        body: 'The Strait of Messina narrows ahead, the water seamed and swirling where the stream runs hard between Sicily and the toe of Italy. The navigator has the fair-tide ribbon plotted up the eastern shore. Commit to the window and ride the slingshot north — or hold a steady, cautious line down the middle?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You committed to the ribbon and the stream took you — Messina flushed you north past Scylla like a cork from a bottle, the log reading speeds the wind alone could never make. A current-rider\'s passage of the strait, and miles banked toward Stromboli.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held a steady line down the middle of the strait and took the average of it — no slingshot, but no foul-tide trap either. The boats that timed the ribbon stole a march at Messina; you simply refused to gamble the race on a tide table.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You worked toward the fair stream without fully committing to the navigator\'s window — a foot in the ribbon, a foot in clear water. A measure of the slingshot, none of the risk of being flushed the wrong way: a careful threading of Messina.',
      },
    ],
  },

  // -- Transpac: the dive south past the Pacific High ------------------------
  {
    raceId: 'race-transpac',
    theme: 'The sleigh ride to Diamond Head — and where you choose to round the High.',
    stakes:
      'Twenty-two hundred downwind miles to Hawaii, and the whole race is one routing call made days out: how far south to dive around the Pacific High. Cut the corner on the great circle and you risk sailing into the windless heart of the High and parking for a day. Dive deep for the trades and you sail extra miles for breeze that never quits. Get the angle right and it\'s a sleigh ride; get it wrong and it\'s a drift.',
    coached:
      'Navigator: the models can\'t agree on the High. Dive south and we sail extra distance but stay in pressure all the way to Diamond Head — a committed route, paid back in boatspeed. Hold the rhumb and we save the miles, but if the High bulges we park in the middle of the ocean with nothing to do but whistle.',
    beats: [
      {
        kind: 'briefing',
        body: 'Out past Catalina the land sinks astern and the navigator spreads the routing charts — the Pacific High squatting between you and Hawaii like a slack-aired island you can\'t see. The kite goes up for the long run, and the only real decision of the race is already on the table: how far south to go.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Mid-Pacific (Trades)',
        body: 'Out in the middle of the ocean the breeze is softening at the edge of the High, and the fleet is making its call — some diving south for the trades, some holding the rhumb to save the distance. Commit south for guaranteed pressure and the extra miles, or take the short road and trust the High not to swallow you?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You dove south and committed to the pressure, and the trades filled in hard and stayed — a sleigh ride the whole way down, surfing under the kite while the rhumb-line boats withered at the edge of the High. The long road around the High was the fast one.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held the rhumb and banked the distance, betting the High would stay off your road. No deep dive, no extra miles — and you kept enough breeze to keep moving while the southern boats sailed the long way. The short road home, sailed without flinching.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You shaded south without fully committing to the deep dive — a hedge against the High, miles kept in hand. Some of the trade-wind pressure, none of the big detour: a navigator\'s compromise on the one call that makes the Transpac.',
      },
    ],
  },

  // -- Race to Alaska: the slack-water gate at Seymour Narrows ---------------
  {
    raceId: 'race-r2ak',
    theme: 'Engineless up the Inside Passage — and the sixteen-knot gate at Seymour.',
    stakes:
      'Seven hundred miles to Ketchikan on wind and grit alone, and the whole passage funnels through one terrifying gap: Seymour Narrows, where the tide runs to sixteen knots over Ripple Rock. Hit the slack-water window and you slide through; arrive on the flood and the gate is shut — you anchor against the cliff and watch the race row past, or get spat back the way you came. There is no horsepower to bully it. Only the tide table, and your nerve to trust it.',
    coached:
      'Navigator: Seymour is the gate that ends careers. The Narrows runs sixteen knots and there\'s no engine to fight it — we go on the last of the ebb or we don\'t go at all. Send it and we shoot through on the fair stream, but the window is minutes wide. Tuck in and wait for slack and we lose hours, but we lose them safe.',
    beats: [
      {
        kind: 'briefing',
        body: 'Days of cold green water and aching arms up the Inside Passage, the tide doing as much of the racing as the wind. Ahead lies Seymour Narrows — the gap every R2AK crew dreads, where the whole Pacific tries to squeeze through a slot and the rock below has drowned ships. The navigator is sleeping with the tide tables.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Seymour Narrows',
        body: 'Seymour Narrows boils ahead, the ebb still draining hard through the slot, whirlpools spinning off the walls. The slack window is minutes away — and minutes wide. Shoot the gap now on the last of the fair ebb, or tuck into the back eddy and wait for the safe slack?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You shot Seymour on the last of the ebb, the current flinging you through the slot faster than the boat has ever sailed, walls of whirling water either side. Heart-in-mouth and perfectly timed — you were through and gone while the cautious crews were still waiting on slack.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You tucked into the eddy and waited out the flood for slack water, then walked the boat through the Narrows in the calm. Hours gone, and the gate-runners away up the passage — but Ripple Rock has eaten boats that gambled it, and you weren\'t one of them.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You edged toward the slot as the ebb eased, neither charging the gate nor sitting it out — feeling for the moment the boil flattened enough to slip through. A wary, watermanlike passage of Seymour, the worst of the risk left on the table.',
      },
    ],
  },

  // -- RORC Caribbean 600: the Saba acceleration zone ------------------------
  {
    raceId: 'race-caribbean-600',
    theme: 'Eleven islands at full noise — and the funnel screaming off Saba.',
    stakes:
      'Six hundred warm miles weaving the Leewards, festive on the dock and ferocious between the headlands. The trade wind compresses around the high volcanic islands and fires out the gaps in screaming acceleration zones — nowhere harder than the funnel off Saba. Load up and ride the blast and you carve miles out of the fleet; mishandle it and the gust knocks you flat or shreds your kite. It\'s the race\'s signature: big air, no warning, between the islands.',
    coached:
      'Navigator: the Saba channel is going to honk — the trades squeeze round the island and accelerate through the gap, well over the gradient breeze. Sail high and load up and we carry the speed when it hits, real miles in the blast. Bear away and play it safe and we give that up to keep the boat on her feet.',
    beats: [
      {
        kind: 'briefing',
        body: 'Off English Harbour in a fat trade wind, the fleet stringing north past Barbuda and Nevis toward the high cones of the Leewards. Everyone knows where the race bites — the channels between the islands, where the wind doubles in a boat-length and the acceleration zones lie in wait.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Saba',
        body: 'Saba rises sheer off the bow and you can see the gust already — the sea darkening and streaking where the trade funnels round the island and fires through the gap. Sail high and load up to carry the speed into the acceleration zone, or bear away and ease through it under control?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You sailed high into the Saba funnel and the gust hit like a wall — the boat lit up, rail down, log spinning, miles carved out of the fleet in a few screaming minutes. You rode the acceleration zone for everything it had and came out the far side ahead.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You bore away and eased through the Saba gap, taking the safe angle as the trade fired through. The bold boats stole speed in the blast — but you kept the rig in the boat and the kite in one piece, and a whole boat is a fast boat over six hundred miles.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You met the funnel on a working angle — high enough to load up, eased enough to stay on your feet — and worked the boat through the acceleration zone under control. A trimmed, seamanlike pass of Saba, with the islands still ahead to race.',
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
