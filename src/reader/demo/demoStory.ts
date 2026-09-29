// Static text for the reading demo (#/play/demo) until real engines arrive (S1.3). Original text written for
// Inkventure (MIT, like the app). Lines starting with "> " are echoed player commands. It is long enough to span many
// pages on every e-reader viewport and includes a paragraph longer than a small page, to exercise paragraph splitting.
import type { ReaderBlock } from '../paginator';

export const DEMO_TITLE = 'The Keeper of Saltmere Light';

const LONG =
  'The logbook is a heavy thing bound in oilcloth, its pages swollen by forty winters of sea air. The first ' +
  'entries are written in a careful copperplate hand: wind from the north-west, glass falling, lamp lit at a ' +
  'quarter past four, the tender Marguerite sighted off the point and signalled. Later the hand grows looser and ' +
  'the entries longer, as if the keeper had begun to write for company rather than for the record. There are notes ' +
  'on the gulls that nested under the gallery rail, on a seal that came every spring to sleep on the landing stage, ' +
  'on the price of paraffin and the slowness of the post. There is a page about a storm in which the keeper did not ' +
  'sleep for three nights and wound the clockwork of the lens by hand when the weights jammed, and the writing on ' +
  'that page is so cramped and hurried that you have to hold the book close to the window to read it. Further on, ' +
  'the keeper describes a light seen far out beyond the reef, low on the water, where no ship could safely be: a ' +
  'green light that burned for an hour and then went out. The next entry says only that the keeper rowed out at ' +
  'dawn and found nothing. The one after that is dated a full month later, and it is written in a different ink, ' +
  'a brown ink that has faded almost to nothing, and it says that the lamp must never again be allowed to go dark, ' +
  'not for a single night, not for any reason, whatever the Board may decide and whatever anyone in the village ' +
  'may say. After that the entries return to wind and weather and paraffin, as if nothing had happened at all, ' +
  'but in the margin of every page, in the same brown ink, someone has drawn a small green circle.';

const TEXT: string[] = [
  'THE KEEPER OF SALTMERE LIGHT',
  'An interactive demonstration. Tap the right of the page to read on, the left to go back.',
  'You wake to the sound of the sea. For a moment you do not know where you are; then the smell of salt and ' +
    'paraffin brings it back. The lighthouse. The Board sent you here yesterday afternoon, on the last boat before ' +
    'the weather turned, to keep the light at Saltmere until a new keeper can be found.',
  '> look',
  'Keeper’s Room',
  'A round room at the foot of the tower, whitewashed long ago and grey with damp since. A narrow bed stands ' +
    'against the curve of the wall, beside a stove that has gone cold in the night. A table holds a tin plate, a ' +
    'candle stub and a thick logbook. Stairs spiral upward into the dark; a heavy door leads out to the landing ' +
    'stage.',
  '> examine stove',
  'An iron stove, black and squat, its door hanging open. A few coals still glow orange deep inside, but most of ' +
    'the fire has burned down to ash. A coal scuttle stands beside it, nearly empty.',
  '> put coal in stove',
  'You shovel the last of the coal onto the embers and close the door. After a while the stove begins to tick and ' +
    'mutter to itself, and the chill goes out of the room.',
  '> examine logbook',
  LONG,
  '> read last entry',
  'The last entry is short. “Glass falling fast. Stores low. Tender overdue. Lamp lit at four. If the Marguerite ' +
    'does not come tomorrow I shall go up to the village myself.” There is no entry for the next day.',
  '> go up',
  'You climb the stairs, one hand on the cold iron rail. They wind round and round the inside of the tower, past ' +
    'narrow windows full of grey sky, until your legs ache and the sound of the sea has become a distant hush.',
  'Lamp Room',
  'The top of the tower is almost entirely glass. In the middle of the room stands the great lens, taller than you ' +
    'are, a beehive of prisms and brass that throws your reflection back at you a hundred times over. Below it sits ' +
    'the lamp itself, cold and dark. A door leads out onto the gallery.',
  '> examine lens',
  'The lens is made of rings of glass, each one angled so precisely that the light of a single small flame is ' +
    'gathered and sent twenty miles out to sea. It rests on a bed of mercury so that it can turn at the lightest ' +
    'touch. A crank handle for the clockwork is fixed to its base.',
  '> examine lamp',
  'A paraffin burner with a mantle of woven silk, surrounded by a chimney of thick glass. The reservoir is dry.',
  '> go out',
  'Gallery',
  'The wind hits you like a hand as soon as you open the door. The gallery is a narrow iron walkway running right ' +
    'round the outside of the lamp room, with a rail at waist height. Far below, the sea throws itself against the ' +
    'rocks and falls back white. To the east you can see the village of Saltmere, a scatter of roofs and a church ' +
    'tower along the curve of the bay. To the west there is nothing but water all the way to the edge of the sky.',
  '> look west',
  'The reef runs out from the point in a long ragged line, marked by a band of white water. Beyond it the sea is ' +
    'dark and empty. You watch for a long time, but you see no ship, and no light.',
  '> look east',
  'Smoke rises from a few of the village chimneys. A figure is walking along the harbour wall, too far away to ' +
    'make out. On the hill above the village a flag is flying from the coastguard hut: a red flag, snapping ' +
    'straight out in the wind. A gale warning.',
  '> go in',
  'You pull the door shut behind you and the roar of the wind drops away to a moan.',
  '> go down',
  'You make your way back down the long spiral of the stairs.',
  'Keeper’s Room',
  'The stove has warmed the room a little. The logbook lies open on the table where you left it.',
  '> open door',
  'You lift the latch. The door swings inward with a gust of spray and the full noise of the sea.',
  '> go out',
  'Landing Stage',
  'A stone jetty juts out from the foot of the tower into a sheltered cove. Iron rings are set into the stone for ' +
    'mooring, but there is no boat. A wooden shed stands at the landward end, its door held shut by a loop of rope. ' +
    'A path climbs the headland toward the village.',
  '> open shed',
  'You work the wet knot loose with cold fingers and pull the door open. Inside, in the dim light, you can make ' +
    'out coils of rope, a stack of lobster pots, a pair of oars and, at the back, a row of paraffin cans.',
  '> take can',
  'You try each of the cans in turn. All of them are empty except the last, which sloshes when you lift it. It is ' +
    'perhaps a quarter full: enough for one night, if you are careful. Two nights, if you are lucky.',
  '> examine oars',
  'Long ash oars, worn pale at the grips. Someone has carved a small circle into the blade of each one.',
  '> go up path',
  'You start up the path toward the village, but the wind is rising and the light is already beginning to go. ' +
    'Halfway up the headland you stop and look back. The tower stands dark against a darkening sky. If you go on to ' +
    'the village now, you will not be back before nightfall, and there will be no one to light the lamp.',
  'You turn round and go back down to the lighthouse.',
  'Landing Stage',
  '> go in',
  'Keeper’s Room',
  '> go up',
  'You climb the stairs again with the can of paraffin bumping against your leg.',
  'Lamp Room',
  '> fill lamp',
  'You unscrew the cap of the reservoir and pour in the paraffin, slowly, so as not to waste a drop. When the can ' +
    'is empty the reservoir is barely a third full.',
  '> light lamp',
  'You strike a match, turn up the wick and hold the flame to the mantle. For a moment nothing happens. Then the ' +
    'silk catches and flares, and a white light blooms inside the glass, so bright that you have to look away.',
  '> wind clockwork',
  'You turn the crank handle until it will turn no further. Somewhere below you the weights begin their slow ' +
    'descent through the tower, and with a faint grinding sound the great lens starts to revolve. Beams of light ' +
    'sweep out across the water, one after another, steady as a heartbeat.',
  '> wait',
  'Time passes. Outside, the last of the daylight drains out of the sky. The beams of the lighthouse turn and ' +
    'turn, lighting the rain, the reef, the white tops of the waves.',
  '> look west',
  'You press your face to the glass and look out past the reef. The sea is black. The beam passes over it, and the ' +
    'dark closes in again behind it. The beam passes over it again.',
  'And then, low on the water, far out beyond the reef where no ship could safely be, you see a small green light.',
  '> wait',
  'The green light does not move. It burns steadily, neither brighter nor dimmer, while the beam of the lighthouse ' +
    'sweeps over it and away, over it and away. You find that you are holding your breath.',
  '> wait',
  'After what might be an hour, the green light goes out.',
  'You stand at the glass for a long time afterwards, watching the place where it was. Then you go down to the ' +
    'keeper’s room, take up the pen, and open the logbook at a clean page.',
  '> write in logbook',
  'You write the date, the wind and the state of the glass. You write that the lamp was lit at a quarter to five. ' +
    'Then, after a moment’s thought, you draw a small green circle in the margin.',
  'That is the end of the demonstration. The real adventures, with a command bar under the last page, arrive with ' +
    'the game engines.',
];

export const DEMO_BLOCKS: ReaderBlock[] = TEXT.map((text) =>
  text.indexOf('> ') === 0 ? { kind: 'input', text: text } : { kind: 'text', text: text },
);
