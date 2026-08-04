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
        bustBody:
          'You drove at the Rock with everything standing and the Celtic Sea called it — a night of green water and load alarms, the wardrobe one blown seam from a very long swim home. You rounded, in the end, on a boat that had aged a season in a watch.',
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
        bustBody:
          'You bet east on the warm eddy and found cold water — the thermometer never moved, the current never came, and the miles you spent hunting it are on the wrong side of the ledger. The Stream keeps its rivers where it pleases.',
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
        bustBody:
          'You punched into the change and the Strait charged full rate — hours of upwind punishment for miles the fleet made back the moment the pressure evened out. The Buster was not impressed, and the boat has the bruises to prove it.',
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
        bustBody:
          'You shot for the Needles gate and the tide table won — the stream turned early and stood the overfalls up in your face, the fleet\'s sterns disappearing west while you clawed past the wreck at two knots over the ground. The gate does not negotiate.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You tucked in under the cliffs and crept through the back eddy, out of the worst of the foul stream. No glory in it, and the gate-runners made their minutes — but you never stopped dead in the tide-line the way the gamblers who mistimed it did.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You shaded toward the gate and kept your escape route — close enough to catch some of the fair tide, cautious enough not to be caught out if it shut early. A half-tide rounding, honestly bought of the Needles, the race still there to be sailed down the back of the island.',
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
        bustBody:
          'You took the inside line past the Manitous and the islands took their toll — the night breeze you were promised never made it down the passage, and you sat in the shadow watching mastheads slide by outside. The lake keeps its own counsel.',
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
        bustBody:
          'You went at Messina on your own arithmetic and the strait had different numbers — the stream turned while you were still mid-channel, and Scylla and Charybdis charged you both tolls. The old monsters are patient. They can afford to be.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held a steady line down the middle of the strait and took the average of it — no slingshot, but no foul-tide trap either. The boats that timed the ribbon got clean away at Messina; you simply refused to gamble the race on a tide table.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You worked toward the fair stream with one eye on the exit to the navigator\'s window — a foot in the ribbon, a foot in clear water. A measure of the slingshot, none of the risk of being flushed the wrong way: a careful threading of Messina.',
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
        bustBody:
          'You dove south for the promised pressure and bought nothing but distance — the trades filled late and filled everywhere, and the great-circle boats got the same wind without the detour. The High forgives nobody\'s extra miles.',
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
        body: 'Days of cold green water and aching arms up the Inside Passage, the tide doing as much of the racing as the wind. Ahead lies Seymour Narrows — the gap every R2AK crew dreads, where the whole Pacific tries to squeeze through a slot and this water drowned ships for a century. The navigator is sleeping with the tide tables.',
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
        bustBody:
          'You sent it at the Narrows on the last of the ebb and the gate called your bluff — the flood arrived early and stood you still mid-channel, sixteen knots of somewhere else\'s water deciding your afternoon. The tree and its ten thousand dollars got further away.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You tucked into the eddy and waited out the flood for slack water, then walked the boat through the Narrows in the calm. Hours gone, and the gate-runners away up the passage — but Ripple Rock ate ships for a century before they blew it flat — and the current it fed is still all there, and you weren\'t one of them.',
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
        bustBody:
          'You loaded up for the funnel and the funnel won — a gust off Saba\'s shoulder that put the rail under and the kite in ribbons, and after that you sailed the trade like everyone else, minus one sail and a layer of pride.',
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

  // -- Cowes–Dinard–St Malo: the Alderney Race tidal gate ---------------------
  {
    raceId: 'race-cowes-dinard',
    theme: 'The oldest offshore race of them all — and the fiercest tide in the Channel.',
    stakes:
      'A hundred and fifty-one miles from the Squadron line to St Malo, sailed since 1906, and the whole crossing is a sum done before the gun: when will you reach the Alderney Race, and which way will it be running? The stream through that gap runs faster than most of the fleet sails. Arrive fair and it slings you down onto Guernsey; arrive foul and you park in mid-Channel while the boats that did the arithmetic disappear south.',
    coached:
      "Navigator: the Race is the whole crossing. I've worked the tide back from the gate — hold pace and we carry the fair stream through, a slingshot past Alderney. Fall behind the sum and the stream turns in the gap; then we stand west of the Casquets and take the long, kind water instead. Speed made good between here and there decides which race we sail.",
    beats: [
      {
        kind: 'briefing',
        body: 'Out past the Needles the Island drops astern and the Channel opens grey and wide, a hundred boats settling onto the same rhumb. Somewhere ahead, invisible, the tide is already running through the Alderney Race — and every navigator below is working the same sum against the same clock.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Alderney Race',
        body: 'Alderney lifts out of the haze to starboard, Cap de la Hague fine to port, and the water ahead is seamed where the stream runs through the gap. The window is real but closing. Shoot the Race on the fair tide and take the slingshot south — or bear away west of the Casquets and sail the longer, safer water to Les Hanois?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You shot the Alderney Race on the last of the fair stream and it flung you down past the Casquets toward Les Hanois like a thing possessed, the log reading numbers the wind never made. The boats that hesitated met the turn in the gap — and stopped. That is how Dinard races have been won for a century.',
        bustBody:
          'You bet the crossing on the Alderney Race and arrived to find the door already swinging shut — the first of the foul stream boiling back through the gap, the Casquets flashing their told-you-so. You got through, eventually. So did everyone behind you, faster.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood west of the Casquets and gave the overfalls their room, sailing the long way round the gate. The Race-runners who timed it stole miles you never got back — but the ones who mistimed it spent the afternoon going backwards past Alderney, and you were already reaching for Les Hanois.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You shaded toward the Race without betting the crossing on the tide table — close enough to catch the edge of the fair stream, far enough out to escape if the gate shut. A pilot\'s passage of the Channel Islands: no slingshot, no trap, and the race to St Malo still open.',
      },
    ],
  },

  // -- Tri-State Regatta: the evening lake shutdown ---------------------------
  {
    raceId: 'race-tri-state',
    theme: 'Friday dusk out of Chicago — and a lake that goes to sleep before you get there.',
    stakes:
      'Fifty-one miles on the diagonal, Chicago to St. Joseph, sailed on Labor Day weekend for seventy-odd years — the friendliest overnight in fresh water, and one of the trickiest. The lake breeze dies with the sun, mid-crossing, nearly every year. The fleet that finds the surviving pressure ghosts into Michigan before dawn; the fleet that doesn\'t sits on a black mirror listening to the halyards slat.',
    coached:
      "Navigator: the gradient's soft and the sun's going down — the lake will let go of its breeze somewhere out here, it always does. There's better pressure standing off to windward of the rhumb; commit out to it and we keep sailing all night. Hold the short line and we save the miles, but if it glasses off on us we're parked with everyone who thought the same.",
    beats: [
      {
        kind: 'briefing',
        body: 'The gun goes off Chicago at dusk, the skyline lighting up astern as the fleet stretches out onto the long diagonal. It\'s warm, it\'s gentle, and every old hand aboard is watching the water to windward — because somewhere between here and St. Joe, the lake is going to stop breathing.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Mid-Lake Michigan',
        body: 'Mid-lake, midnight. The breeze has gone patchy and soft, the telltales lifting and dying. Off to windward there\'s a band of darker water still moving — real pressure, real miles away from the rhumb. Commit offshore to the breeze that\'s left, or hold the short line and gamble the night air keeps a pulse?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You sailed away from the rhumb and out into the dark water, and the pressure held — the boat slipping along all night while the short-line fleet sat slatting on the glass behind you. St. Joe\'s pierhead lights came up before dawn, and the hard miles were the fast ones.',
        bustBody:
          'You committed offshore after the darker water and it was a mirage — the pressure line dissolved as you reached it, and the rhumb-line boats ghosted past on air you had given away for nothing. The lake shut down without paying you.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held the rhumb and banked the distance, drifting through the soft patch with the rest of the direct-line thinkers. No detour, no drama — and when the night air finally stirred, the short road was still the short road. Not glorious, but in a fifty-mile race, miles are money.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You bowed out to windward of the rhumb — a few degrees toward the pressure, the short line still in reach. Some of the breeze, most of the distance saved: the cautious read of a lake that punishes both the greedy and the stubborn in equal measure.',
      },
    ],
  },

  // -- Malta–Syracuse: the wind shadow at Capo Murro di Porco -----------------
  {
    raceId: 'race-malta-syracuse',
    theme: 'The Med\'s oldest offshore race — decided in the shadow of one Sicilian cape.',
    stakes:
      'Eighty miles from Marsamxett to Siracusa, sailed since 1952 — an overnight sprint across the Malta Channel that the island\'s whole fleet turns out for. The channel crossing is honest enough; the trap is the far shore. The night breeze thins under the Sicilian land, and Capo Murro di Porco stands its wind shadow across the final miles like a doorman. Boats have led for seventy-five miles and parked within sight of the finish.',
    coached:
      "Navigator: the crossing will sail itself — it's the last five miles that need deciding now. Capo Murro di Porco throws a shadow at night, and the short road to the line runs straight through it. Cut close under the cape and there are puffs off the cliffs if you're lucky; stand wide and the sea breeze lives, but the miles are real. Leaders park there every year, skipper.",
    beats: [
      {
        kind: 'briefing',
        body: 'Out of Marsamxett in the golden evening, Valletta\'s bastions astern, the fleet fanning north into the Malta Channel as the light goes. Sicily is a rumour beyond the horizon. Below, the navigator is already thinking about a cape nobody can see yet — because that\'s where this race has always been won and lost.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Capo Murro di Porco',
        body: 'The Sicilian shore is close now, the lighthouse on Capo Murro di Porco blinking over a sea gone quiet under the land. The short road to Siracusa runs tight under the cape — through its shadow. Cut close and gamble on the puffs off the limestone, or stand wide in the living breeze and sail the long way round the dead air?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You cut in under Capo Murro di Porco and the cape let you pass — katabatic breaths off the cliffs walking you along the short road while the wide boats sailed their insurance miles. You carried your way round the corner and into Siracusa with the race in hand. The locals will say you sailed it like one of them.',
        bustBody:
          'You shaved Capo Murro for the short corner and the cape took its cut — the shadow reached further than the chart suggested, and the wide boats carried their sea breeze past while you drifted under the headland\'s silence.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood wide of the cape and kept the sea breeze, sailing real miles in real wind while the inshore gamblers flirted with the shadow. Some of them ghosted through; some of them are still there. You rounded into the great harbour with steerage way and your race intact — the navigator\'s finish.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You rounded at half a mile — inside the insurance line, outside the graveyard — feeling the shadow\'s edge the whole way. A little of the corner saved, none of the parking lot: a careful, local-knowledge rounding of the cape that guards Siracusa.',
      },
    ],
  },

  // -- Annapolis to Newport: the bay-mouth parking lot ------------------------
  {
    raceId: 'race-annapolis-newport',
    theme: 'A hundred miles of bay, then an ocean — and the doorway between them jams.',
    stakes:
      'Four hundred and seventy-five miles from Annapolis to Newport, and the race is really two races: a light-air, current-riddled chess match down the Chesapeake, then a proper ocean passage past Montauk to Castle Hill. The hinge is the bay mouth. Dawn at Cape Henry is notorious glass — the bay exhales, the gradient hasn\'t woken, and a fleet that raced a hundred miles of tide tables sits watching the ships go by. Get out the door and the ocean is yours.',
    coached:
      "Navigator: everything I've done down this bay buys us one thing — arriving at Cape Henry with the ebb still running. If it goes glassy at the capes, and it will, the ship channel's current is the only thing moving. Ride it out to sea before the flood, or hold wide of the lanes and wait for the sea breeze to fill offshore. The bay gives you the race; the bay mouth can take it back.",
    beats: [
      {
        kind: 'briefing',
        body: 'Off Annapolis the gun echoes across a river of boats, and the longest small-boat corridor in American racing opens south: a hundred miles of Chesapeake, thin air, thick current, crab pots and patience. The ocean is two days away. The navigator has the tide tables out before the spinnaker is drawing.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Cape Henry',
        body: 'Dawn at the capes, and the bay has exhaled: glass from shore to shore, the fleet\'s wakes the only texture on it. But the ebb still drains out the ship channel — a moving road through the parking lot, with freighters on it. Ghost into the channel and ride the current to sea, or hold wide of the lanes and bet on the sea breeze filling first offshore?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You eased into the ship channel and let the ebb do the racing — the land sliding by while the boats parked either side of the lanes shrank astern. By the time the flood turned, you were at sea in the new breeze with the bay closed behind you. The one moving road out of the parking lot, and you took it.',
        bustBody:
          'You ghosted into the ship channel to ride the ebb and the Bay called slack early — no current, no wind, just a parked boat between buoys while the patient fleet found the first of the new southerly outside. The Bay pays whom it pleases.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held wide of the shipping lanes and waited on the sea breeze, trading the current\'s free ride for open water and no freighters in the fog of dawn. When the southerly filled offshore, you were first to feel it — and the passage race to Newport began with the boat whole and the crew unhurried.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You worked the edge of the channel — a lane on the fringe of the ebb, clear of the ships, a way out if the current died with the tide. A portion of the push, none of the white-knuckle crossings: a delivery skipper\'s exit from the Chesapeake, with the whole ocean leg still to race.',
      },
    ],
  },

  // -- Antigua 360: the dive into the island's lee ----------------------------
  {
    raceId: 'race-antigua-360',
    theme: 'One island, one lap — and a wind shadow lying across the road home.',
    stakes:
      'Forty-eight miles around Antigua at full noise: trade-wind reaching up the wild east side, reef-dodging through the north, and then the decision the whole lap funnels into — the west coast. It\'s the short road home and it\'s dead in the island\'s lee, a wind shadow miles wide where the trade simply isn\'t. Carry your way through it and the lap is a record run; park in it and you watch the offshore boats reach round the outside with everything you lost.',
    coached:
      "Navigator: the east side will sail itself — big trade, big smiles. The race is the far corner. Round Boon Point and the island's shadow owns the short line down the west coast; there are zephyrs under the hills if the day's kind, and nothing at all if it isn't. Dive into the lee and we cut the corner to English Harbour. Stand offshore and the trade never leaves us — but the miles are real.",
    beats: [
      {
        kind: 'briefing',
        body: 'Out of English Harbour into a fat February trade, the fleet cracking sheets up the east coast with the Atlantic swell under the quarter. It\'s glorious, and everyone knows it\'s a loan — because on the other side of the island the same hills that make the harbour calm make a hole in the wind, and the lap runs straight at it.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Boon Point',
        body: 'Boon Point drops astern and the west coast opens ahead — the short road to the finish, glassy and pale in the island\'s shadow, the trade streaking the sea a mile further out. Dive into the lee and gamble the zephyrs under the hills carry you home, or stand offshore in pressure and sail the long way round the shadow?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You dove into the lee and the island was kind — cat\'s-paws off the hills handing you along the short road while the offshore boats sailed their big, honest miles in the trade. You slipped past Cades Reef with the lap sewn up and ghosted into English Harbour ahead of boats that never stopped moving. Robbery, done politely.',
        bustBody:
          'You dived deep into the lee for the short water and the island closed its hand — glassy calm under the cliffs while the offshore boats carried their breeze around you. Robbery was attempted. The island pressed charges.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood offshore and kept the trade, reaching round the outside of the shadow with the rail down while the corner-cutters inshore slatted in the glass. More water under the keel, never a slow mile on it — and at English Harbour the lee had given back most of what the short road promised.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You ran the seam — the line where the shadow meets the pressure — carrying half the corner and keeping a lane back out to the breeze. When the lee breathed you gained; when it didn\'t you escaped. A local\'s line down the west coast, and the lap decided on the last reach.',
      },
    ],
  },

  // -- Cabbage Tree Island Race: cheating the EAC -----------------------------
  {
    raceId: 'race-cabbage-tree',
    theme: 'North against the river — the current that helps you to Hobart is the enemy tonight.',
    stakes:
      'A hundred and seventy-two miles, Sydney to Cabbage Tree Island and back — the classic Hobart qualifier, and a race sailed against the grain. The East Australian Current pours south down this coast at better than a knot, a river in the sea running exactly the wrong way. The fleet that hugs the beach, working headland to headland inside the stream, cheats it; the fleet that stands out into the dark water donates a knot to the ocean, all night. Round the island, turn south, and the river becomes your friend for the ride home.',
    coached:
      "Navigator: the EAC's running hard and it's foul the whole way north. Inside the current line, tight under the headlands, there's relief — and bricks. Hug the beach and we cheat the river all the way to Cabbage Tree, but it's tacks, rocks and no sleep. Hold the offshore lane and we sail in peace and give the current a knot for the privilege. Coming home it's all fair — the race is won going north.",
    beats: [
      {
        kind: 'briefing',
        body: 'Off Point Piper the gun sends the fleet down the harbour and out through the Heads into the late-November evening, bows turning north — against the East Australian Current, against the grain of every Hobart ever sailed. Somewhere off Port Stephens, in the dark, a bird-sanctuary island is waiting to be rounded. The navigator is drawing the current line on the chart like a fence.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Norah Head',
        body: 'Norah Head\'s light swings overhead and the choice is on the table: inside, the beach glows under the moon and the current is thin — headland to headland, close enough to hear the surf. Outside, clean water, sea room, and the river running foul at a knot and more. How hard do you hug the coast to cheat the EAC?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You hugged the beach the whole way north, surf on the beam and the depth sounder honest, cheating the river out of every southbound yard while the offshore boats paid their knot to the ocean. You rounded Cabbage Tree with a lead the current built for you — and turned south to let it carry you home.',
        bustBody:
          'You hugged the beach out of the current and found the current\'s little brother — holes and headers under the cliffs while the offshore fleet paid the EAC\'s toll and kept their wind. Some tolls are cheaper than the detour.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held the offshore lane and took the EAC on the chin — a knot of foul current, paid in full, in exchange for sea room, clean air and a crew that never once heard breakers in the dark. The beach-crawlers beat you to the island; the ride home on the fair stream kept your race alive.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You worked the mid-ground — inside the worst of the river, outside the surf line — buying back part of the current without ever betting the boat on a moonlit headland. A seamanlike passage north, and the run home from Cabbage Tree still fair for everyone.',
      },
    ],
  },

  // -- Islands Race: Catalina's lee in the dark -------------------------------
  {
    raceId: 'race-islands-race',
    theme: 'A winter night among the islands — and Catalina\'s shadow across the road south.',
    stakes:
      'A hundred and forty-two miles from the LA start to Point Loma, sailed in February, mostly in the dark — seaward of Catalina, seaward of San Clemente, then the long board into San Diego. The catch is the timing: the winter gradient goes home with the sun, and the fleet reaches Catalina\'s West End just as the island\'s lee grows teeth. Cut the corner through the shadow and the race is yours by midnight; park in it and you spend the night watching masthead lights reach round the outside.',
    coached:
      "Navigator: we make the West End right at shutdown — the gradient's dying and Catalina's lee will be a mile-wide hole by the time we're in it. There's sometimes a land breeze draining off the hills at night, enough to carry a boat through the corner. Cut inside and we bank real miles on the fleet. Stand offshore and the westerly's last breath is ours, for the price of the long way round.",
    beats: [
      {
        kind: 'briefing',
        body: 'The start off Point Fermin goes in pale winter sunshine, kites up for the slide down to Catalina with the island standing black against the afternoon glare. It\'s pretty now. By the West End it will be dark, the gradient will be dying, and the first real decision of a long cold night will be waiting under the island\'s shoulder.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Catalina West End',
        body: 'The West End light blinks overhead and the breeze is already going soft. South, the short road to San Clemente runs tight under Catalina\'s black shoulder — through her lee. Offshore, the last of the westerly still streaks the water. Cut the corner through the shadow and gamble on the night drainage off the hills, or stand out in the breeze and sail the miles?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You cut the corner through Catalina\'s lee and the island breathed for you — a thread of land breeze off the hills walking the boat through the dark while the offshore fleet sailed the long way round in the dying westerly. You came out the far side with miles in the bank and San Clemente next on the list.',
        bustBody:
          'You cut the corner into Catalina\'s shadow and the shadow was home — an hour of slatting sails under the dark loom of the island while the seaward fleet sailed round you in pressure you had declined. The lee always looks shorter than it is.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood offshore and kept the last of the gradient, sailing honest miles in moving air while the corner-cutters ghosted into the shadow and, mostly, stayed there. The long road south was never quick — but it never stopped, and a boat that keeps sailing on a February night wins more Islands Races than one that doesn\'t.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You shaved the shadow\'s edge — most of the corner, with a lane back out to the westerly if the lee went dead on you. Half a gain when the drainage breathed, a quick escape when it didn\'t: a watch captain\'s line past Catalina, with the whole cold night still to race.',
      },
    ],
  },

  // -- Swiftsure: the Bank rounding in the fog --------------------------------
  {
    raceId: 'race-swiftsure',
    theme: 'The Lightship Classic — a hundred boats, one fog bank, and an ebb with a deadline.',
    stakes:
      'A hundred and thirty-eight miles from Victoria to the edge of the open Pacific and back — Swiftsure, the Northwest\'s great race since 1930. The Strait of Juan de Fuca is a tide machine: the ebb sluices you west past Race Rocks, the flood slams the door, and out at Swiftsure Bank the shallows stand the whole thing on end when wind and stream disagree. Then there\'s the fog. Most years the Bank rounding happens inside a wall of grey, on instruments and nerve, with the ebb-gate clock running the whole time.',
    coached:
      "Navigator: the Bank is in that fog and the ebb turns in a couple of hours — round it on the fair stream and the flood carries us home; miss the window and we beat back against the whole strait. I can put us on the mark blind, on the plot, close aboard in the grey. Or we stand off until it thins and round it with our eyes — and give the gate away. Fog, ships, tide: pick two to fight, skipper.",
    beats: [
      {
        kind: 'briefing',
        body: 'Off Clover Point the fleet starts west into the strait, Race Rocks already boiling ahead and the Olympics standing white to port. Somewhere past the entrance the forecast says fog — it usually does. The navigator is running the tide sums for a bank of gravel at the edge of the Pacific that nobody expects to actually see.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Swiftsure Bank',
        body: 'The world has gone grey — a fog bank swallowing sea, sky and fleet, the Bank somewhere inside it and the ebb running out its last hours. Foghorns somewhere to seaward. Round the mark now, blind on the instruments, and hook the fair stream home — or stand off in clear water until the grey thins and the gate is gone?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You ran into the grey on the numbers, called the Bank close aboard without ever seeing it, and came round onto the fair stream as the ebb\'s last hour drained east — the flood carrying you up the strait while the fleet behind waited for eyes. A blind rounding, perfectly plotted: the kind Swiftsure legends are made of.',
        bustBody:
          'You ran the fog blind on the instruments and the instruments were honest about it: you overstood the Bank in a white room, and the horn you finally heard was a boat that had already rounded. Faith is a heading, not a fix.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood off in clear water and let the fog have the Bank until it thinned, rounding late with your eyes open and the ships accounted for. The gate went with the ebb, and the beat home against the flood was long and honest — but nobody aboard will ever wonder what you nearly hit out there.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You felt your way in along the depth contour, a lookout forward and the plot updating, rounding the Bank slow and sure inside the murk. Not the full slingshot, never quite blind: a fisherman\'s rounding of Swiftsure Bank, with most of the fair stream saved and all of the boat.',
      },
    ],
  },

  // -- Rolex Giraglia: the dusk rounding at the rock -------------------------
  {
    raceId: 'race-giraglia',
    theme: 'The Ligurian crossing — and a lighthouse rock where the wind goes to die.',
    stakes:
      'Two hundred miles from the gulf of Saint-Tropez to Genoa, hinged on a lonely rock off Cap Corse. The Giraglia is rounded at dusk more often than not, just as the sea breeze folds — and the boats that read the night wind first are gone before the rest know it has arrived.',
    coached:
      'Navigator: the thermal quits with the sun, and the night gradient fills from seaward of Cap Corse — usually. Round wide and hunt it, or take the short water up the Corsican shore and pray the island does not park us.',
    beats: [
      {
        kind: 'briefing',
        body: 'The gulf empties in a spinnaker haze and the fleet strings out across the Ligurian Sea, Corsica a blue shadow on the bow. Everyone is doing the same arithmetic: hull speed against sunset, and the rock arriving exactly when the wind leaves.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Giraglia Rock',
        body: 'The lighthouse takes shape in the last of the light, the sea breeze soft and softening. Off to seaward there is a darker line of water that might be the night wind arriving. Round wide and go find it — or take the short rounding under the island and trust the fjord-flat calm to spare you.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You gave the rock searoom and sailed out into the dark after a rumour of wind — and found it, heeling to the night gradient while the inshore boats sat mirrored under Cap Corse. The long way round the Giraglia was the short way to Genoa.',
        bustBody:
          'You sailed out into the dark after a rumour of wind and it stayed a rumour — the night gradient filled inshore instead, along the very cliffs you had left behind, and Genoa got further away with every patient offshore mile.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You rounded clean and kept your options, neither betting the race on the shore nor spending miles on a rumour. The dusk lottery paid some boats and parked others; you sailed through the middle of it, unspectacular and still racing.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
      body:
        'You hugged the Corsican shore for the short road home, and the island let you keep it — a lift off the cliffs where the chart promised shadow, Genoa creeping closer while the offshore gamblers were still hunting their rumour. Some nights the land pays the patient.',
      },
    ],
  },

  // -- Sydney–Gold Coast: north against the river ----------------------------
  {
    raceId: 'race-sydney-goldcoast',
    theme: 'Winter miles north — with the East Australian Current running the wrong way.',
    stakes:
      'Three hundred and eighty miles from the Heads to Southport, every one of them against the EAC. The current is a river two knots strong and forty miles wide, and the whole race is one long argument about where to cross it, dodge it, or pay it.',
    coached:
      'Navigator: the current line shows hard at Smoky Cape. Inside is out of the river but starved of breeze under the land at night; outside is two knots foul and full of wind. We will not win this by sailing the rhumb line.',
    beats: [
      {
        kind: 'briefing',
        body: 'Out through the Heads into a bright winter southerly, the fleet turns left and the arithmetic starts: the shortest way to the Gold Coast is up the beach, and the beach is where the sea breeze dies at dark. The EAC waits offshore like a toll gate.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Smoky Cape',
        body: 'Smoky Cape light on the bow and the sea surface split in two: confused warm water offshore where the current runs, long dark lanes inshore where the back-eddies live. The night is coming. Thread the eddies in the dark, or stand out and pay the river for its breeze?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You went beach-crawling in the dark, boat-length by boat-length through the back-eddies while the offshore boats paid their two knots. It took nerve and a depth sounder — and it bought you the cape while the fleet fought the river.',
        bustBody:
          'You threaded the beach eddies in the dark and the beach kept the change — back-eddies that were really just holes, a bar\'s worth of confused water, and the offshore boats paying the current and banking the breeze all night long.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood offshore and took the current on the bow as the price of honest pressure all night. The log flattered and the ground made good sulked — but the boat kept sailing while the inshore gamblers sat in the holes under the land.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You rode the current line itself, where the water is lumpy and undecided — half out of the river, half in the breeze. A coast-hugger\'s bargain: nobody aboard was ever thrilled, and nothing ever went badly wrong.',
      },
    ],
  },

  // -- China Sea Race: the squall line -----------------------------------------
  {
    raceId: 'race-china-sea',
    theme: 'Across the South China Sea on the dying monsoon — through whatever it throws.',
    stakes:
      'Five hundred and seventy miles from Victoria Harbour to Subic Bay, on a monsoon that is fading but not finished. The squall lines come through like freight trains — forty knots on the face, a glass hole behind — and the podium usually belongs to whoever kept sailing through both.',
    coached:
      'Skipper\'s note: when the squall line shows, we choose fast — carry sail and surf its face for free miles, shorten early and keep the boat whole, or duck the cell and sail round the worst. The radar gives us minutes, not hours.',
    beats: [
      {
        kind: 'briefing',
        body: 'Hong Kong falls astern in a grey northeast breeze and the fleet spreads onto the great empty reach of the South China Sea. The forecast is the same as it has been for sixty years of this race: trades, squalls, and a windless hole behind every one of them.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Mid-Channel (South China Sea)',
        body: 'A black wall walks down the trade toward you, rain smoking under it, the breeze going cold and fitful ahead of it. Under that cloud is forty knots for twenty minutes — and behind it, nothing at all. Sail plan, skipper: carry, shorten, or run round it?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You carried sail into the squall and took the ride — rail buried, helm loaded, the log touching numbers the boat may never see again. It spat you out ahead of the fleet and slightly bent, which around here is called a good trade.',
        bustBody:
          'You carried sail into the squall line and the squall line carried some of it away — a knockdown, a shredded luff, and the hole behind the cell swallowing whatever the surf had gained. The monsoon posts its terms in advance.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You reefed before it hit and went through the squall line like a well-run ship: wet, upright, and unbroken. The surfers made miles on you; the swimmers, further down the fleet, made none at all.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You bore away round the blackest of the cell and re-crossed behind it, trading distance for dry decks. Not the hero\'s line, not the coward\'s: the navigator logged it as "avoiding action", and the boat never noticed it happened.',
      },
    ],
  },

  // -- Cape to Rio: the South Atlantic High ----------------------------------
  {
    raceId: 'race-cape2rio',
    theme: 'The great southern crossing — with a continent of calm parked in the road.',
    stakes:
      'Three thousand three hundred miles from Table Bay to Guanabara, and the South Atlantic High sits somewhere in the middle of all of them, moving when it pleases. Sail round it and the trades carry you to Brazil; cut through it and you may write letters home from the middle of a mirror.',
    coached:
      'Navigator: the High is the race. The gribs age fast out here — by the time we reach the gate the ridge will have moved. The wide arc is insurance we pay in miles; the rhumb line is a loan the High may never let us repay.',
    beats: [
      {
        kind: 'briefing',
        body: 'Table Mountain drops astern under its cloth of cloud and the Benguela lifts the fleet north into the trade. Ahead lies the emptiest racecourse on earth, and in the middle of it — somewhere — the High, drawn on every chart aboard as a circle of nothing.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'High Gate',
        body: 'This is the gate: the last position report puts the ridge dead on the rhumb line, mirror-calm at its heart. The router wants the long arc west with pressure the whole road. The shortest way to Rio is straight through the glass. Commit.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You committed to the arc and sailed the extra hundred miles with the trade never dropping below a working breeze. The rhumb-line boats parked in the ridge and watched their water run low; you came round the outside with the kite up the whole way to Brazil.',
        bustBody:
          'You arced wide around the ridge and the ridge came with you — the High slumped south as you did, and the pressure you sailed for stayed a forecast. Extra miles, ordinary wind, and the rhumb-line boats never knew you had gone.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held the rhumb line and took the glass as it came, the crew swimming at noon and whistling for wind at midnight. Patience is also a tactic: the High moved off in its own time, and you had banked the miles the arc boats spent.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You skirted the ridge\'s shoulder — close enough to smell the calm, far enough to keep steerage — and shaved the arc without ever quite stopping. The navigator called it threading the isobars; the crew called it three slow days; Rio called it a finish.',
      },
    ],
  },

  // -- Bayview Mac: the Huron glass-off --------------------------------------
  {
    raceId: 'race-bayview-mac',
    theme: 'The other Mac — up a lake that sleeps at sunset.',
    stakes:
      'Two hundred miles up Lake Huron from Port Huron to the island, and the lake keeps its own hours: sea breeze by afternoon, dead calm by midnight, and a private land breeze under the Michigan shore for the boats bold enough to go find it in the dark.',
    coached:
      'Navigator: Huron shuts down at dusk, regular as a diner. The play is the night land breeze off the dunes — if it drains. Commit to the shore and we ghost while the lake sleeps; stay out and we trust the rhumb line to keep a pulse.',
    beats: [
      {
        kind: 'briefing',
        body: 'The fleet funnels out of the river and opens onto a Huron afternoon, all sparkle and sea breeze. Every navigator aboard is already thinking about ten o\'clock tonight, when the lake will hold its breath — because that is when this race is actually sailed.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Thunder Bay offing',
        body: 'The sun goes down off Thunder Bay and takes the wind with it, the lake flattening to pewter. Under the Michigan shore there is a rumour: the night drain off the dunes, a private breeze for whoever closes the beach. Commit to the shore, or hold the rhumb and keep ghosting?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You closed the shore in the dark and the land breeze came down off the dunes like a favour — a private six knots while the mid-lake fleet sat on a mirror. By dawn you were gone, and the rhumb-line boats were still explaining the night to each other.',
        bustBody:
          'You closed the Michigan shore for the night drain and the dunes slept in — flat water, dead air, and the mid-lake fleet ghosting north on the rumour\'s other half. The land breeze is a gift, not a wage.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You held the rhumb line and kept the boat ghosting on what the night left behind. No jackpot under the shore, no glue either — just patient trimming through the small hours, and a boat still moving when the morning breeze arrived to count the survivors.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You angled shoreward without betting everything on the beach, and caught the edge of the drain when it came — half the private breeze, none of the total shutdown. A each-way ticket on the Huron night, cashed for a modest, honest gain.',
      },
    ],
  },

  // -- Van Isle 360: the Narrows with an ocean to follow ---------------------
  {
    raceId: 'race-van-isle',
    theme: 'Around the island — rapids first, then the whole Pacific.',
    stakes:
      'Five hundred and twenty miles around Vancouver Island: a tide-gated sprint up the inside, a surf-swept rounding at Cape Scott, and the long Pacific slide home. Seymour Narrows gates the whole affair — and unlike the sprint races, whatever you spend there you will miss on the west coast.',
    coached:
      'Navigator: the Narrows window is the same as ever — but this time the race does not end in Ketchikan-style relief. The west coast is three hundred miles of open Pacific, and the crew we burn shooting the gate is crew we will want off Brooks Peninsula.',
    beats: [
      {
        kind: 'briefing',
        body: 'Nanaimo slips astern and the inside passage closes in, green and tide-ruled. Somewhere ahead the Narrows is running its sixteen knots, and beyond it — the thing the inside boats try not to think about — the open Pacific side of the island, waiting with its own weather.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Seymour Narrows',
        body: 'The Narrows again: the ebb easing, the window opening, the boil flattening by the minute. But this is a lap of the whole island — spend the crew shooting the last of the gate, slip through neat on the turn, or anchor, bank the rest, and start the west coast whole?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You shot the closing gate at full stretch and the Narrows slung you into Johnstone Strait ahead of the tide and the fleet. The price came due off Cape Scott, where the Pacific met a crew already spent — but the miles were banked, and miles are what this lap is made of.',
        bustBody:
          'You spent the crew shooting the closing gate and the gate shut anyway — spat back into the holding pool to wait like everyone else, minus the reserves you burned proving the tide table right. The west coast collected the balance later.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You anchored out the foul stream and let the gate have its tantrum without you, the crew fed and horizontal. The bold boats bought an hour; you bought a west coast sailed fresh — and the island\'s outside third is where that trade pays out.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You timed the turn and slipped through on the slack, no heroics, no anchor — the seamanlike middle of the Narrows ledger. Through with the tide\'s permission rather than against its will, and the whole Pacific side still ahead with a crew to sail it.',
      },
    ],
  },

  // -- Newport–Ensenada: the Coronados at midnight ---------------------------
  {
    raceId: 'race-ensenada',
    theme: 'The tequila run — with a black hole parked on the rhumb line.',
    stakes:
      'A hundred and twenty-eight miles from Newport Beach to Ensenada, most of them easy — and then the Coronados at midnight, where the gradient dies and the islands cast a wind shadow you can anchor in. Whole fleets have parked there within sight of the finish.',
    coached:
      'Navigator: the islands arrive at exactly the wrong hour. Inside is the rhumb line and the famous glass; outside costs a mile and keeps what breeze the night leaves. The margaritas taste the same either way — the trophies do not.',
    beats: [
      {
        kind: 'briefing',
        body: 'The start off Newport is a postcard — a thousand sails on a westerly sparkle, Mexico somewhere under the afternoon haze. The old hands are not looking at the postcard; they are looking at the clock, doing the arithmetic that ends with the Coronados at midnight.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Islas Coronados',
        body: 'The islands stand black against the last of the light, dead on the rhumb line, and the breeze is already going soft. Inside is shorter and famously still; outside keeps the gradient alive. Midnight at the Coronados — choose your lane.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You cut inside the islands and the night air held — barely, a whisper down the channel that kept the boat sliding while the offshore boats sailed their insurance miles. The shortest road to Ensenada, sailed on nerve and a depth contour.',
        bustBody:
          'You threaded inside the Coronados at midnight and the islands were waiting — the gradient died in their shadow and left you drifting under bare stars, margarita money sailing past a mile to seaward. The inside lane is only short when it moves.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood offshore of the lee, paid the extra mile, and kept sailing all night while the inside gamblers sat under the islands watching their tell-tales hang. The gradient survived out there, exactly as promised — and so did your race.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You shaved the windward shore of the islands, close enough to save most of the distance, far enough to duck out if the shadow reached for you. It half-worked, which off the Coronados at midnight is better than most boats managed.',
      },
    ],
  },

  // -- Block Island Race: The Race, twice ------------------------------------
  {
    raceId: 'race-block-island',
    theme: 'Down the Sound and back — through the sluice gate both ways.',
    stakes:
      'A hundred and eighty-three miles from Stamford round Block Island and home, with The Race — the tide-gate at the Sound\'s eastern door — standing in the road both directions. Four knots of stream run through it at strength; the whole racecourse turns on catching it fair.',
    coached:
      'Navigator: the ebb serves The Race for the run out — if we are there when it runs. Miss the window and the options are the overfalls against the flood, or Plum Gut\'s side door and the extra miles. We will meet the same gate again coming home.',
    beats: [
      {
        kind: 'briefing',
        body: 'The Sound opens ahead in the Friday evening light, and every navigator aboard every boat is working the same tide table: The Race, hours away, where four knots of water will either carry you out to Block Island like a king or stand you straight up.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'The Race',
        body: 'The ebb is at full pour and The Race is a moving staircase of standing waves, four knots of free transport under the chaos. Centre of the gate for the full sling and the green water, the shoulder for most of the ride, or Plum Gut\'s quiet side door?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You took the centre of the gate at full ebb — green water over the bow, the log reading tide-assisted nonsense — and The Race slung you out toward Block Island ahead of everything that flinched. The foredeck may forgive you by Sunday.',
        bustBody:
          'You rode The Race\'s sluice a half-hour late and the overfalls collected — a standing wall of water that stopped the boat like a hand on the chest, four knots of yesterday\'s transport running the wrong way. The gate keeps its own clock.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You took Plum Gut\'s side door and left the overfalls to the brave, trading a handful of miles for an upright boat and a dry crew. The sluice boats beat you to the island; the boats that mistimed the sluice did not beat you anywhere.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You rode the shoulder of the gate — most of the fair stream, the smaller half of the standing waves — and came out the far side wet but whole with the tide\'s change in hand. A Sound sailor\'s line through The Race, which is the highest compliment the Sound pays.',
      },
    ],
  },

  // -- Færder Race: midsummer calm at the light ------------------------------
  {
    raceId: 'race-faerder',
    theme: 'A thousand boats, a night without dark — and a lighthouse ringed in glass.',
    stakes:
      'Seventy-one miles down the Oslofjord and back to Horten on a midsummer night that never goes black. The fjord breeze dies with the light — such as the light ever leaves — and the rounding at the Færder lighthouse is sailed, most years, at steerage way in a fleet of a thousand drifting sails.',
    coached:
      'Navigator: the southerly quits before the lighthouse, count on it. The drainage air runs the Vestfold shore in the small hours — sometimes. East keeps the old gradient longest. This race is won at one knot, by whoever keeps the boat that knot.',
    beats: [
      {
        kind: 'briefing',
        body: 'The evening start pours a thousand boats down the fjord on the last of the day\'s southerly, spinnakers stacked to the horizon like laundry. It is beautiful and everyone knows it is a trap: somewhere past Bastøy the wind has an appointment to vanish.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Færder Lighthouse',
        body: 'The lighthouse stands in a ring of glass, the pale night hanging on the horizon, the fleet ghosting on private zephyrs. There is a whisper of drainage air under the Vestfold shore and a memory of southerly out east. Pick your poison — at one knot, wrong is forever.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You ghosted down the Vestfold shore after the drainage breeze and it came — a cat\'s-paw, then a whisper, then two honest knots while the fleet at the light hung mirrored. In a race sailed at steerage way, two knots is a gale, and you owned it.',
        bustBody:
          'You ghosted down the Vestfold shore chasing drainage air that never drained — the pale night hung windless over the whole fjord, and the eastern boats kept the old southerly you had traded away. At one knot, wrong is forever.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stood east and banked the dying gradient, sailing known breeze while the shore-gamblers chased rumours. It faded, as everything fades at Færder — but later than the alternatives, and the boat never quite stopped, which on this night was the whole art.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You held the middle and kept way on, trimming to every breath the fjord exhaled, committed to nothing but boatspeed. No jackpot, no park-up: a rounding at the Færder earned one boat-length at a time, in the pale gold light of a night that never arrived.',
      },
    ],
  },

  // -- Marion–Bermuda: the meander -------------------------------------------
  {
    raceId: 'race-marion-bermuda',
    theme: 'The cruiser\'s crossing — and a river in the ocean that moved since the chart.',
    stakes:
      'Six hundred and forty-five miles from Buzzards Bay to St. David\'s Head, sailed the old way — shorthanded, sextant-friendly, unsponsored. The Gulf Stream crosses the middle of it regardless of anybody\'s ethos, and its meanders can hand a cruising boat two free knots or quietly take the race away.',
    coached:
      'Navigator: our Stream picture is three days old the moment we need it. The trace shows a warm meander bowing east — a conveyor, if it is still there. Chase it and we buy miles for a ride; cross square and we take the shortest wet road and no favours.',
    beats: [
      {
        kind: 'briefing',
        body: 'Marion empties on a June morning, the fleet motoring-out-and-sailing in that unhurried Corinthian way — and then Buzzards Bay opens, the shelf drops away, and six hundred miles of Atlantic get serious. Taped to the chart table: a satellite picture of a river that has already moved.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Gulf Stream Crossing',
        body: 'The water goes deep blue and warm, and the Stream is under you. The trace promises a meander east — two knots of conveyor toward Bermuda, if you believe a three-day-old photograph of moving water. Chase it, cross square, or hunt the quiet entry?',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You bought the miles east and the meander was there — the thermometer spiking, the current under the keel, Bermuda arriving two knots faster than the wind alone could manage. An old picture, a live river, and a navigator who will dine on this for years.',
        bustBody:
          'You chased the meander on a three-day-old picture and the river had moved on — cold water where the conveyor should have run, and the miles east bought nothing but distance. The Stream is a rumour that redraws itself nightly.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You crossed square — the shortest, lumpiest, most honest road through the Stream — and were out of the river before it could develop opinions. The meander-chasers gambled on an old photograph; you gambled on nothing at all.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You detoured to the pilot chart\'s soft spot and crossed gently, part conviction, part caution. Less current against you than the square road, less windfall than the meander paid — the kind of quietly sensible Stream crossing this race was invented for.',
      },
    ],
  },
  {
    raceId: 'race-cowes-day1',
    theme: 'The week opens — and the Bramble deals the first hand.',
    stakes:
      'Five days of Solent racing decide the week, and day one sets the tone. The Bramble Bank sits mid-course with four metres of water and half the tide over it: shave it and the fleet is behind you by the first mark; touch it and the whole regatta watches you stop.',
    coached:
      'Navigator: the Bramble is the short line and I have the height of tide worked to the minute. We carry enough water — just — on the top third of the bank. Over it and we lead at Hill Head; round it and we join the queue. Your call, skipper.',
    beats: [
      {
        kind: 'briefing',
        body: 'Cowes on the first morning of the week: a hundred flags, a thousand crews, and the Squadron cannons waiting. Beyond the line the Solent is already striped with wind lanes and tide, and the Bramble sits mid-stream like a dealt card, face down until the fleet arrives.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Bramble Bank',
        body: 'The fleet converges on the bank in one breathing pack — depth alarms, shouted water calls, and the short line over the shallows opening for whoever trusts their tide sum.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You took the short line over the Bramble with the sounder singing and came off the bank clear ahead — the queue still rounding the deep-water mark astern as you stretched for Hill Head. The week opened with your bow in front, and the dock knew it by lunchtime.',
        bustBody:
          'You took the short line over the Bramble and the tide sum was a boat-length optimistic — a soft touch, a heart-stopping graunch, and the fleet streaming past while you worked her off the bank. The week opened with a story about you, and not the one you wanted.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You skirted the bank\'s edge with a boat-length of margin — most of the shortcut, none of the drama, and a top-third rounding at Hill Head. A seamanlike opening to a long week.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You rounded the deep-water mark with the procession and kept the keel where the water was. Points banked, boat whole — the week is long, and the Bramble will still be there on Friday.',
      },
    ],
  },
  {
    raceId: 'race-cowes-day5',
    theme: 'The Decider — the week comes down to one last beat.',
    stakes:
      'Four days of scores are on the table and the discard is spent. Whatever the week has been, it ends here: one more Solent lap, one rival within reach of the silverware, and a choice between covering them home and sailing your own race for the gun.',
    coached:
      'Navigator: the table says it\'s us and one other boat for the week. Match-race them and we guarantee beating THEM — but the fleet decides the day, and the day still counts. Split and sail our own water and we race for the win. Points or glory, skipper — pick before the Bramble.',
    beats: [
      {
        kind: 'briefing',
        body: 'The last morning of the week, and the arithmetic is done on every boat: who needs what, who covers whom, who is safe and who must gamble. The Squadron line is the same as Monday. Nothing else is.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Bramble Bank',
        body: 'The rival is two lengths back, sailing in your shadow, and the Bramble is where the week\'s last big choice gets made — break the cover, or carry it all the way home.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You broke the cover at the Bramble and bet the week on your own water — and the Solent paid. Around the last mark clear ahead, the rival\'s challenge dissolved astern, and the cannon that ended the race ended the argument.',
        bustBody:
          'You broke the cover at the Bramble and the Solent kept the change — the shift you split for never came, and the rival sailed the ladder past you with the week in their pocket. Bold was right for the day you needed; the fleet just didn\'t vote your way.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You covered loosely — between the rival and the mark without living in their tacks — and sailed the last beat like a points accountant with a poet\'s finish. The week ended the way good weeks do: undramatically, in front.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You matched them tack for tack to the line, the week\'s maths riding every cross. It cost you the day and saved the story — sometimes the trophy is won by the boat that refused to lose it.',
      },
    ],
  },
  {
    raceId: 'race-beercan-wk1',
    theme: 'Opening night on the lakefront - and the sky going green over the Loop.',
    stakes:
      'The first Wednesday of the summer off the Monroe line. Half this crew has not been on a boat since September and one of them has never set a kite at all. That is the whole point of beer cans - but the radar has a line of cells walking off the plains toward the lakefront, and they do not care that this is meant to be the friendly one.',
    coached:
      'Navigator: that line is fifteen minutes out, maybe twenty. We can round the crib ahead of it and reach home in the new breeze - fast, and hard on a crew still finding the winches. Or we get the kite down early and take it on a white sail. Or we go in, and nobody on the Aft Deck asks. Your call, skipper.',
    beats: [
      {
        kind: 'briefing',
        body: 'Monroe Harbor on a June Wednesday: thirty boats milling behind the line, a committee boat full of volunteers, and the city stacked up gold behind the fleet. Somebody hands the new hand a winch handle and tells them which end goes in.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Four Mile Crib',
        body: 'Two miles out, the skyline turns the colour of a bruise. The crib is dead ahead, the kite is full, and the leading edge of the squall is a hard grey line on the water behind the fleet.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You carried it, rounded the crib with the line still astern, and came home reaching in the first of the new breeze while the fleet wrestled kites behind you. The new hand did not let go of anything they were not supposed to. First Wednesday of the summer, and the Aft Deck heard about it twice.',
        bustBody:
          'You carried it a minute too long. The front arrived with the kite still up and a crew who had never taken one down in thirty knots - a shrimped sail, a broach, and a long wet reach home at the back of the fleet. Everybody was fine, and everybody was going to hear about it all summer.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You got the kite down while there was still time to do it tidily, and took the front on a white sail with the boat upright and the new hand watching how it is meant to go. Mid-fleet, dry, and a crew that will come back next Wednesday.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You turned for the harbour mouth and watched the squall walk over the fleet from the safety of the fairway. It is a Wednesday in June. The beer is the same temperature either way.',
      },
    ],
  },
  {
    raceId: 'race-beercan-wk6',
    theme: 'The last Wednesday - the series, the dying breeze, and the nine o clock fireworks.',
    stakes:
      'Six Wednesdays comes down to this one, and to the boat two lengths to leeward that has been beating you all summer. The shore band is dying with the sun. There is still pressure out east, but it is a long way off the direct line, and the discard is already spent.',
    coached:
      'Navigator: the dark water is out there, I can see it - but it is a proper commitment and they will not follow us. Or we forget the racecourse and sail THEM, which wins the series and nothing else. Or we sit in the shore band and trust it to hold the last mile. Points or pressure, skipper.',
    beats: [
      {
        kind: 'briefing',
        body: 'The last Wednesday of the series. The whole lakefront in one lap, the standings tight enough that the Aft Deck has been arguing about them since Monday, and the sun already low enough to be in the helmsman eyes on port tack.',
      },
      {
        kind: 'beat',
        pinnedWaypoint: 'Four Mile Crib',
        body: 'At the crib the fleet parts: the offshore boats reaching out toward the dark line on the water, the shore boats tucking in under the buildings, and the summer resting on which band holds through sunset.',
      },
      {
        kind: 'debrief',
        outcome: 'bold',
        body: 'You went out for the pressure, found it honest, and came in over the top of the whole shore band with the last of the breeze. The rival never followed and never recovered. The fireworks went up off the pier as you crossed - a summer decided by one call at the crib.',
        bustBody:
          'You went out for the pressure and the dark water turned out to be the last of it. The band closed behind you, the shore boats ghosted home in a breeze you could see and not reach, and the series went to the boat that did not gamble. The fireworks were lovely from where you were parked.',
      },
      {
        kind: 'debrief',
        outcome: 'hedge',
        body: 'You forgot the racecourse and sailed the rival - covered them from the crib to the line and beat them by a length that never felt safe. The day went to somebody else entirely and the series came home in your pocket.',
      },
      {
        kind: 'debrief',
        outcome: 'safe',
        body: 'You stayed in the shore band and it held, just, all the way to the line. Not the finish that wins a summer, but a clean sail on a warm night with the city going by - which is what the Wednesdays were always for.',
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
