// The card catalogue: every card Ember Pact can deal, with its suit, ember cost,
// power and effect. Names, suits and effects are all original to this game.
//
// Effects:
//   surge   — gain +2 ember at the start of your next turn.
//   kindle  — +1 power to every Flame card in this lane (including this one).
//   flow    — +1 power to every Tide card in this lane (including this one).
//   bulwark — +1 power to every Stone card in this lane (including this one).
//   wash    — when played, -2 power from the strongest enemy card in this lane.
//   snare   — +1 power for each enemy card already in this lane.
//   pact    — +2 power when you already have 2 or more cards in this lane.
//   seal    — when played, lock this lane: no more cards may enter it this round.
//   bargain — costs 0 ember, but you lose 2 life when you play it.

export const EFFECT_TEXT = {
  surge: 'Surge: +2 ember',
  kindle: 'Kindle: +1 Flame',
  flow: 'Flow: +1 Tide',
  bulwark: 'Bulwark: +1 Stone',
  wash: 'Wash: −2 foe',
  snare: 'Snare: +1 per foe',
  pact: 'Pact: +2 with 2 allies',
  seal: 'Seal: locks lane',
  bargain: 'Bargain: −2 life',
};

export const CARDS = [
  { id: 'ember-imp', name: 'Ember Imp', suit: 'flame', cost: 1, power: 2, effect: null },
  { id: 'cinder-whelp', name: 'Cinder Whelp', suit: 'flame', cost: 2, power: 4, effect: null },
  { id: 'kindle-spark', name: 'Kindle Spark', suit: 'flame', cost: 2, power: 1, effect: 'surge' },
  { id: 'flamecaller', name: 'Flamecaller', suit: 'flame', cost: 3, power: 5, effect: 'kindle' },
  { id: 'pyre-drake', name: 'Pyre Drake', suit: 'flame', cost: 5, power: 8, effect: null },
  { id: 'ash-phoenix', name: 'Ash Phoenix', suit: 'flame', cost: 6, power: 9, effect: 'surge' },
  { id: 'tide-sprite', name: 'Tide Sprite', suit: 'tide', cost: 1, power: 2, effect: null },
  { id: 'mist-wisp', name: 'Mist Wisp', suit: 'tide', cost: 2, power: 2, effect: 'surge' },
  { id: 'river-herald', name: 'River Herald', suit: 'tide', cost: 2, power: 3, effect: 'wash' },
  { id: 'deep-current', name: 'Deep Current', suit: 'tide', cost: 3, power: 5, effect: 'flow' },
  { id: 'storm-leviathan', name: 'Storm Leviathan', suit: 'tide', cost: 6, power: 10, effect: null },
  { id: 'thorn-sprout', name: 'Thorn Sprout', suit: 'thorn', cost: 1, power: 3, effect: null },
  { id: 'vine-serpent', name: 'Vine Serpent', suit: 'thorn', cost: 2, power: 4, effect: 'snare' },
  { id: 'briar-wolf', name: 'Briar Wolf', suit: 'thorn', cost: 3, power: 5, effect: null },
  { id: 'rootwarden', name: 'Rootwarden', suit: 'thorn', cost: 4, power: 6, effect: 'seal' },
  { id: 'pebble-guard', name: 'Pebble Guard', suit: 'stone', cost: 1, power: 2, effect: 'bulwark' },
  { id: 'stone-golem', name: 'Stone Golem', suit: 'stone', cost: 3, power: 6, effect: null },
  { id: 'pact-keeper', name: 'Pact Keeper', suit: 'stone', cost: 4, power: 5, effect: 'pact' },
  { id: 'mountain-king', name: 'Mountain King', suit: 'stone', cost: 7, power: 11, effect: null },
  { id: 'ember-bargain', name: 'Ember Bargain', suit: 'flame', cost: 0, power: 4, effect: 'bargain' },
];

/** Look a card definition up by id. */
export function cardById(id) {
  return CARDS.find((card) => card.id === id) ?? null;
}

/** How many copies of each card a deck holds: two of the cheap workhorses, one of the rest. */
const DECK_COUNTS = {
  'ember-imp': 2,
  'cinder-whelp': 2,
  'kindle-spark': 2,
  flamecaller: 1,
  'pyre-drake': 1,
  'ash-phoenix': 1,
  'tide-sprite': 2,
  'mist-wisp': 2,
  'river-herald': 2,
  'deep-current': 1,
  'storm-leviathan': 1,
  'thorn-sprout': 2,
  'vine-serpent': 2,
  'briar-wolf': 2,
  rootwarden: 1,
  'pebble-guard': 2,
  'stone-golem': 1,
  'pact-keeper': 1,
  'mountain-king': 1,
  'ember-bargain': 1,
};

/** A fresh shuffled deck of card instances (each with its own uid) for one side. */
export function buildDeck(random) {
  const ids = [];
  for (const [id, count] of Object.entries(DECK_COUNTS)) {
    for (let copy = 0; copy < count; copy += 1) ids.push(id);
  }
  const shuffled = random.shuffle(ids);
  return shuffled.map((id, index) => ({ uid: `c${index}-${id}`, ...cardById(id), weakened: 0 }));
}
