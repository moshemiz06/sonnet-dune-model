// Places and short notes for the model. Herbert's maps are schematic, so lat/lon positions are
// interpretive; the text is a paraphrase of what Book One ("Dune") tells us.

export const PLANET_PLACES = [
  {
    id: 'arrakeen',
    name: 'Arrakeen',
    kind: 'city',
    lat: 32,
    lon: 9,
    text: 'The older capital of Arrakis, built against the Shield Wall at the rim of the Imperial Basin. House Atreides takes it as its seat when the fief changes hands from the Harkonnens, who had governed from Carthag.',
    enter: true,
  },
  {
    id: 'carthag',
    name: 'Carthag',
    kind: 'city',
    lat: 25,
    lon: -12,
    text: 'The Harkonnen administrative city in the Imperial Basin. For generations it was their base on Arrakis, and the Baron\'s nephew ruled the planet from here until the Emperor reassigned the fief.',
  },
  {
    id: 'basin',
    name: 'Imperial Basin',
    kind: 'region',
    lat: 29,
    lon: -2,
    text: 'The broad, relatively sheltered basin where Arrakis\'s cities sit. Rock ramparts wall it off from the open sand, so the settled land is shielded from the worst of the planet\'s storms.',
  },
  {
    id: 'shield',
    name: 'Shield Wall',
    kind: 'region',
    lat: 21,
    lon: 9,
    text: 'The mountain barrier on the basin\'s desert side. It shelters Arrakeen from the Coriolis storms that scour the open desert, and it is the last line of rock between the cities and the deep sand.',
  },
  {
    id: 'habbanya',
    name: 'Habbanya Erg',
    kind: 'region',
    lat: -14,
    lon: 42,
    text: 'An erg is a sea of dunes. Beyond the Shield Wall the great ergs belong to the sandworms and, quietly, to the Fremen. Off-worlders know almost nothing about them.',
  },
  {
    id: 'greaterg',
    name: 'Great Erg',
    kind: 'region',
    lat: -4,
    lon: -58,
    text: 'The open deep desert: unmapped dune seas, killing heat in the day, and worm territory. Spice forms here, far from any outpost.',
  },
  {
    id: 'moon1',
    name: 'First Moon',
    kind: 'moon',
    text: 'The smaller of Arrakis\'s two moons, a pale, cratered body that crosses the night sky quickly.',
  },
  {
    id: 'moon2',
    name: 'Second Moon',
    kind: 'moon',
    text: 'The Fremen see the shape of a desert mouse in its markings: the muad\'dib, a creature that survives in the open sand by cunning. Paul will later take that name.',
  },
  {
    id: 'heighliner',
    name: 'Guild Heighliner',
    kind: 'ship',
    text: 'The Spacing Guild\'s great ships hold a monopoly on interstellar travel, made possible by the spice. The Atreides households reach Arrakis aboard one.',
  },
];

export const LOCAL_PLACES = {
  residency: {
    name: 'The Residency',
    text: 'The Governor\'s Residence in Arrakeen, where Duke Leto sets up House Atreides. Thick walls, narrow windows and a sealed courtyard to hold in moisture. The green-and-black Atreides banner flies from its towers. Much of Book One happens inside it.',
  },
  city: {
    name: 'Arrakeen',
    text: 'A dense, flat-roofed desert city: stepped sandstone blocks, narrow windows and sealed doors. The old capital is laid out at the foot of the Shield Wall, at the mouth of a canyon pass the model calls the Old Gap.',
  },
  shield: {
    name: 'Shield Wall',
    text: 'A sheer, layered rock rampart behind the city. It blocks the storms from the deep desert, and its far side is where the Fremen live.',
  },
  spaceport: {
    name: 'Arrakeen Spaceport',
    text: 'The landing field east of the city. Frigates and lighters shuttle between the surface and Guild Heighliners in orbit, carrying people in and spice out.',
  },
  windtraps: {
    name: 'Windtraps',
    text: 'Tall slanted towers that pull moisture from the air as it passes through cooled chambers. On a planet this dry, windtraps and sealed buildings are what make a city possible.',
  },
  harvester: {
    name: 'Spice Harvester',
    text: 'A crawler factory that chews spice-laden sand and separates the melange. It works the open dunes and has little defence against a worm: a carryall is its lifeline.',
  },
  carryall: {
    name: 'Carryall',
    text: 'A heavy-lift ornithopter. When a worm closes on a harvester, it clamps on and lifts the whole machine clear, if it arrives in time.',
  },
  worm: {
    name: 'Shai-Hulud',
    text: 'The great sandworm, hundreds of metres long. Rhythmic vibrations on the sand draw it, and a harvester at work makes plenty. Every worm is also, in the planet\'s ecology, the source of the spice.',
  },
  ornithopter: {
    name: 'Ornithopter',
    text: 'The standard aircraft of Arrakis: a wing-beating craft whose flight suits the thin, dusty air. It carries the Duke\'s officers, the Atreides patrols and the spice surveyors.',
  },
};
