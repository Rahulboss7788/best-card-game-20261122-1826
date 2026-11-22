// The Warden, the opponent. It plays by the same rules and the same ember, and it
// telegraphs its plan: the lane it means to contest is marked on the table while you
// decide, so its choices can be read and countered. It is strong enough to punish a
// careless hand, and weak enough to lose to a player who answers its focus.
//
// Its thinking, in order: win a lane it is close to taking; answer the lane where you
// are strongest; spend ember rather than sit on it; bank ember with Surge when it has
// nothing good to play; pass when it is ahead on two lanes and the table is settled.

import { LANES } from './config.js';
import {
  SIDE_AI,
  SIDE_PLAYER,
  canPlayCard,
  effectivePower,
  lanePower,
  otherSide,
} from './engine.js';

/** How much a card is worth to the Warden in a lane, before its cost is counted. */
function cardValue(state, laneIndex, card) {
  const lane = state.lanes[laneIndex];
  const friends = lane.cards[SIDE_AI];
  const foes = lane.cards[SIDE_PLAYER];
  let value = effectivePower(state, laneIndex, SIDE_AI, card);
  if (card.effect === 'wash' && foes.length > 0) value += 2;
  if (card.effect === 'seal' && lanePower(state, laneIndex, SIDE_AI) > lanePower(state, laneIndex, SIDE_PLAYER)) value += 4;
  if (card.effect === 'surge') value += 1.5;
  if (card.effect === 'bargain') value -= 1;
  // A card that flips a lane is worth far more than one that only pads a lead.
  const before = lanePower(state, laneIndex, SIDE_AI) - lanePower(state, laneIndex, SIDE_PLAYER);
  const after = before + effectivePower(state, laneIndex, SIDE_AI, card);
  if (before <= 0 && after > 0) value += 6;
  if (before > 0 && after <= 0) value -= 3;
  // Do not waste a big card on a lane already won by a mile.
  if (before > 6) value -= 2;
  return value;
}

/**
 * The lane the Warden means to contest next: the one where its best play flips the
 * lane, else the one where you lead by the least. Shown on the table as its focus.
 */
export function chooseFocusLane(state, strength = 1) {
  const ai = state.sides[SIDE_AI];
  let bestLane = 1;
  let bestScore = -Infinity;
  for (let laneIndex = 0; laneIndex < LANES.length; laneIndex += 1) {
    if (state.lanes[laneIndex].locked) continue;
    const gap = lanePower(state, laneIndex, SIDE_PLAYER) - lanePower(state, laneIndex, SIDE_AI);
    let score = -gap;
    for (const card of ai.hand) {
      if (card.cost > ai.ember) continue;
      score = Math.max(score, cardValue(state, laneIndex, card) - gap);
    }
    // A weaker Warden sometimes stares at the wrong lane: that is the tell to exploit.
    if (strength < 1) score += state.random.next() * 4 - 2;
    if (score > bestScore) {
      bestScore = score;
      bestLane = laneIndex;
    }
  }
  return bestLane;
}

/**
 * Pick the Warden's one action for its turn: { kind: 'play', cardUid, lane } or
 * { kind: 'sacrifice', cardUid } or { kind: 'pass' }. Strength 1 plays to win; 0 is
 * sloppy on purpose, for the staged win screenshot.
 */
export function chooseAction(state, strength = 1) {
  const ai = state.sides[SIDE_AI];
  const playerLanes = [0, 1, 2].filter((lane) => lanePower(state, lane, SIDE_AI) > lanePower(state, lane, SIDE_PLAYER)).length;
  const ahead = playerLanes >= 2;

  // Ahead on two lanes and nothing cheap to add: sit on the lead and pass.
  if (ahead && strength >= 1) {
    const cheap = ai.hand.some((card) => card.cost <= 1 && ai.ember >= card.cost);
    if (!cheap) return { kind: 'pass' };
  }

  let best = null;
  let bestScore = 0;
  for (const card of ai.hand) {
    if (card.cost > ai.ember) continue;
    for (let laneIndex = 0; laneIndex < LANES.length; laneIndex += 1) {
      if (!canPlayCard(state, SIDE_AI, card.uid, laneIndex)) continue;
      // The Warden mostly plays into its focus lane; a weaker one wanders.
      const focusBonus = laneIndex === state.focusLane ? 1.5 : 0;
      const score = cardValue(state, laneIndex, card) - card.cost * 0.6 + focusBonus;
      if (score > bestScore) {
        bestScore = score;
        best = { kind: 'play', cardUid: card.uid, lane: laneIndex };
      }
    }
  }

  // A sloppy Warden passes up good plays sometimes.
  if (best && strength < 1 && state.random.next() < 0.4) best = null;
  if (best) return best;

  // Nothing worth playing: trade a dead cheap card for ember, or pass.
  const spare = ai.hand
    .filter((card) => card.cost <= 2)
    .sort((a, b) => a.power - b.power)[0];
  if (spare && ai.ember < 6 && state.random.next() < 0.7) {
    return { kind: 'sacrifice', cardUid: spare.uid };
  }
  return { kind: 'pass' };
}

/** The Warden's focus for the coming turn, refreshed so the player can read it. */
export function refreshFocus(state, strength = 1) {
  state.focusLane = chooseFocusLane(state, strength);
}

/** Name shown on the table for the opponent. */
export const AI_NAME = 'The Warden';
export const AI_TITLE = 'Keeper of the Ember Gate';
