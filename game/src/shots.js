// The screenshot scenes behind ?shot=title|table|win|loss. Each one plays the real
// rules forward from a fresh match, steered by simple autopilots, so the frame is what
// a real game looks like and the same seed always gives the same frame. The win scene
// pairs a sharp player autopilot against a sloppy Warden; the loss scene pairs a
// careless player against the full-strength Warden; both retry seeds until the match
// ends the way the scene needs.

import { LANES } from './config.js';
import { createRandom } from './random.js';
import {
  SIDE_AI,
  SIDE_PLAYER,
  beginTurn,
  canPlayCard,
  createMatch,
  effectivePower,
  lanePower,
  nextRound,
  passTurn,
  playCard,
  sacrificeCard,
  startMatch,
} from './engine.js';
import { chooseAction, refreshFocus } from './ai.js';
import { SCREEN_OVER, SCREEN_TABLE, SCREEN_TITLE } from './render.js';

/** One autopilot turn for `side`: the best-value play, a sacrifice, or a pass. */
function autopilotTurn(state, side, strength) {
  const pile = state.sides[side];
  const foe = side === SIDE_PLAYER ? SIDE_AI : SIDE_PLAYER;
  const ahead = [0, 1, 2].filter((lane) => lanePower(state, lane, side) > lanePower(state, lane, foe)).length >= 2;
  let best = null;
  let bestScore = ahead ? 2 : 0;
  for (const card of pile.hand) {
    if (card.cost > pile.ember) continue;
    for (let laneIndex = 0; laneIndex < LANES.length; laneIndex += 1) {
      if (!canPlayCard(state, side, card.uid, laneIndex)) continue;
      const before = lanePower(state, laneIndex, side) - lanePower(state, laneIndex, foe);
      const after = before + effectivePower(state, laneIndex, side, card);
      let score = effectivePower(state, laneIndex, side, card) - card.cost * 0.6;
      if (before <= 0 && after > 0) score += 6;
      if (card.effect === 'seal' && before > 0) score += 4;
      if (card.effect === 'surge') score += 1.5;
      if (score > bestScore) {
        bestScore = score;
        best = { kind: 'play', cardUid: card.uid, lane: laneIndex };
      }
    }
  }
  if (best && strength < 1 && state.random.next() < 0.5) best = null;
  if (best) return best;
  const spare = pile.hand.filter((card) => card.cost <= 2).sort((a, b) => a.power - b.power)[0];
  if (spare && pile.ember < 6 && state.random.next() < 0.7) return { kind: 'sacrifice', cardUid: spare.uid };
  return { kind: 'pass' };
}

function applyAutopilot(state, side, strength) {
  const action = autopilotTurn(state, side, strength);
  if (action.kind === 'play') return playCard(state, side, action.cardUid, action.lane);
  if (action.kind === 'sacrifice') return sacrificeCard(state, side, action.cardUid);
  return passTurn(state, side);
}

/** Play one full turn each side, honouring ember at each turn's start. */
function playTurnPair(state, playerStrength, aiStrength) {
  beginTurn(state, SIDE_PLAYER);
  applyAutopilot(state, SIDE_PLAYER, playerStrength);
  if (state.phase !== 'table') return;
  beginTurn(state, SIDE_AI);
  refreshFocus(state, aiStrength);
  const action = chooseAction(state, aiStrength);
  if (action.kind === 'play') playCard(state, SIDE_AI, action.cardUid, action.lane);
  else if (action.kind === 'sacrifice') sacrificeCard(state, SIDE_AI, action.cardUid);
  else passTurn(state, SIDE_AI);
}

/** Play a whole match forward until it ends, or the turn cap is hit. */
function playMatch(state, playerStrength, aiStrength) {
  startMatch(state);
  refreshFocus(state, aiStrength);
  for (let turn = 0; turn < 300 && state.phase === 'table'; turn += 1) {
    playTurnPair(state, playerStrength, aiStrength);
  }
  // A scored round waits on the round-end screen; step into the next round and keep going.
  while (state.phase === 'roundEnd') {
    nextRound(state);
    refreshFocus(state, aiStrength);
    for (let turn = 0; turn < 300 && state.phase === 'table'; turn += 1) {
      playTurnPair(state, playerStrength, aiStrength);
    }
  }
  return state.phase;
}

/** Play forward from a fresh match until the table is busy, for the mid-game shot:
 * cards in the lanes, cards still in both hands, and the round still live. If a
 * round ends on the way, step into the next one and keep playing. */
function playToTable(state) {
  startMatch(state);
  refreshFocus(state, 1);
  let pairs = 0;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (state.phase === 'roundEnd') {
      nextRound(state);
      refreshFocus(state, 1);
    }
    if (state.phase !== 'table') break;
    playTurnPair(state, 1, 1);
    pairs += 1;
    const laneCards = state.lanes.reduce((count, lane) => count + lane.cards[SIDE_PLAYER].length + lane.cards[SIDE_AI].length, 0);
    const busy = pairs >= 3 && laneCards >= 4;
    const handsLeft = state.sides[SIDE_PLAYER].hand.length >= 2 && state.sides[SIDE_AI].hand.length >= 2;
    if (busy && handsLeft && state.phase === 'table') break;
  }
  // End on the player's turn, with the Warden's focus marked, so the shot shows
  // the table as a player sees it: lit hand, readable focus, a move to make.
  if (state.phase === 'table') {
    beginTurn(state, SIDE_PLAYER);
    refreshFocus(state, 1);
  }
}

/**
 * Set `state` to the named scene (title, table, win or loss; any other name is title)
 * and return the screen to draw and the best score to show.
 */
export function stageShot(name, state, startGame, continueMatch) {
  if (name === 'table') {
    playToTable(state);
    return { screen: SCREEN_TABLE, best: 0 };
  }
  if (name === 'win' || name === 'loss') {
    const wanted = name === 'win' ? SIDE_PLAYER : SIDE_AI;
    const playerStrength = name === 'win' ? 1 : 0;
    const aiStrength = name === 'win' ? 0 : 1;
    for (let attempt = 1; attempt <= 40; attempt += 1) {
      const trial = createMatch(createRandom(attempt * 7919 + 13));
      if (playMatch(trial, playerStrength, aiStrength) === 'matchEnd' && trial.winner === wanted) {
        Object.assign(state, trial);
        state.random = trial.random;
        return { screen: SCREEN_OVER, best: name === 'win' ? 1 : 0 };
      }
    }
    // No seed in the sweep ended the way the scene needs: fall back to the last trial
    // and let the caller see the real outcome rather than a staged one.
    const fallback = createMatch(createRandom(4242));
    playMatch(fallback, playerStrength, aiStrength);
    Object.assign(state, fallback);
    state.random = fallback.random;
    return { screen: SCREEN_OVER, best: 0 };
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
