// Every tuning number, colour and name in one place. The table is a fixed 1280x720
// logical area; the renderer scales it to the window, so no rule depends on screen size.

export const FIELD = { width: 1280, height: 800 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Life each side starts a match with. */
export const START_LIFE = 20;

/** Ember a side starts each round with, and gains at the start of each of its turns. */
export const EMBER_ROUND_START = 3;
export const EMBER_PER_TURN = 2;
export const EMBER_MAX = 10;

/** Damage dealt to the loser of a lane when the round is scored. */
export const LANE_DAMAGE = 3;

/** Cards drawn at the start of each round, and the size of each deck. */
export const HAND_SIZE = 5;
export const DECK_SIZE = 30;

/** Round wins needed to take the match. */
export const ROUNDS_TO_WIN = 2;

/** The three lanes, in table order. */
export const LANES = [
  { id: 'ashen', name: 'Ashen Field', hint: 'Where the first ember fell' },
  { id: 'gate', name: 'Ember Gate', hint: 'The pact is sealed here' },
  { id: 'hollow', name: 'Frost Hollow', hint: 'Cold ground, hot hearts' },
];

/**
 * The four suits. Each is told apart by colour AND by a drawn shape, never by text alone:
 * Flame is a triangle, Tide a droplet, Thorn a diamond leaf, Stone a square.
 */
export const SUITS = {
  flame: { name: 'Flame', color: '#e5534b', dark: '#8f2a24', shape: 'triangle' },
  tide: { name: 'Tide', color: '#4fc3f7', dark: '#1d5f86', shape: 'droplet' },
  thorn: { name: 'Thorn', color: '#7bc96f', dark: '#2f6b2a', shape: 'diamond' },
  stone: { name: 'Stone', color: '#f2c94c', dark: '#8a6d1a', shape: 'square' },
};

export const PALETTE = {
  backdrop: '#17100c',
  felt: '#241812',
  feltEdge: '#3a241a',
  lane: '#2c1e15',
  laneEdge: '#4a2f1e',
  laneLocked: '#1d1a24',
  panel: '#2e2018',
  panelEdge: '#5a3d28',
  cardBack: '#3d2b1d',
  cardFace: '#f5ead6',
  cardEdge: '#241812',
  text: '#f5ead6',
  muted: '#b8a58e',
  ember: '#ff9a3d',
  emberHot: '#ffd23d',
  life: '#e5534b',
  good: '#7bc96f',
  bad: '#e5534b',
  focus: '#ffd23d',
  button: '#7a4a22',
  buttonEdge: '#ffb35c',
  shadow: 'rgba(0,0,0,0.45)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the match wins are kept between visits (this browser only). */
export const BEST_KEY = 'ember-pact.wins';
