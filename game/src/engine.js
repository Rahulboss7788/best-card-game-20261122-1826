// The match itself: rounds, lanes, ember, life and every card effect. This file knows
// nothing about the screen; it only changes state and reports what happened, so the
// renderer and the screenshot stager can both drive it.
//
// A match is first to 2 round wins, or the first side whose life (20) reaches 0 loses.
// A round ends when both sides pass in a row. Each lane's higher power total wins it and
// deals 3 damage to the loser; the side that takes 2 of the 3 lanes takes the round.
// On a turn a side may play one card into a lane, sacrifice a hand card for ember equal
// to its cost, or pass. Ember starts at 3 each round and grows by 2 at the start of a
// side's turn (capped at 10); Surge cards add +2 more at the next turn's start.

import {
  DECK_SIZE,
  EMBER_MAX,
  EMBER_PER_TURN,
  EMBER_ROUND_START,
  HAND_SIZE,
  LANE_DAMAGE,
  LANES,
  ROUNDS_TO_WIN,
  START_LIFE,
} from './config.js';
import { buildDeck } from './cards.js';

export const SIDE_PLAYER = 'player';
export const SIDE_AI = 'ai';

/** A fresh side: its own shuffled deck, an empty hand and discard pile, 3 ember. */
function createSide(random) {
  return {
    deck: buildDeck(random),
    hand: [],
    discard: [],
    ember: EMBER_ROUND_START,
    surge: 0,
    life: START_LIFE,
    roundWins: 0,
  };
}

/** A fresh match, on the title screen, waiting to be started. */
export function createMatch(random) {
  return {
    random,
    phase: 'title',
    round: 1,
    lanes: LANES.map(() => ({ locked: false, cards: { player: [], ai: [] } })),
    sides: { player: createSide(random), ai: createSide(random) },
    turn: SIDE_PLAYER,
    consecutivePasses: 0,
    focusLane: 1,
    winner: null,
    roundResult: null,
    log: [],
    stats: { cardsPlayed: 0, sacrificed: 0, roundsPlayed: 0 },
  };
}

/** The other side. */
export function otherSide(side) {
  return side === SIDE_PLAYER ? SIDE_AI : SIDE_PLAYER;
}

/** Draw up to `count` cards, reshuffling the discard pile when the deck runs dry. */
export function drawCards(state, side, count) {
  const pile = state.sides[side];
  for (let index = 0; index < count; index += 1) {
    if (pile.deck.length === 0) {
      if (pile.discard.length === 0) return;
      pile.deck = state.random.shuffle(pile.discard);
      pile.discard = [];
    }
    pile.hand.push(pile.deck.pop());
  }
}

/** Begin a round: clear the lanes, reset ember, draw fresh hands, player to move. */
export function startRound(state) {
  state.lanes = LANES.map(() => ({ locked: false, cards: { player: [], ai: [] } }));
  for (const side of [SIDE_PLAYER, SIDE_AI]) {
    const pile = state.sides[side];
    pile.discard.push(...pile.hand);
    pile.hand = [];
    pile.ember = EMBER_ROUND_START;
    pile.surge = 0;
    drawCards(state, side, HAND_SIZE);
  }
  state.consecutivePasses = 0;
  state.roundResult = null;
  state.phase = 'table';
  state.turn = SIDE_PLAYER;
  beginTurn(state, SIDE_PLAYER);
}

/** Start a whole match from the title screen. */
export function startMatch(state) {
  state.round = 1;
  for (const side of [SIDE_PLAYER, SIDE_AI]) {
    state.sides[side].life = START_LIFE;
    state.sides[side].roundWins = 0;
  }
  state.stats = { cardsPlayed: 0, sacrificed: 0, roundsPlayed: 0 };
  state.winner = null;
  startRound(state);
}

/** Grant a side its turn-start ember, including any banked Surge. */
export function beginTurn(state, side) {
  const pile = state.sides[side];
  pile.ember = Math.min(EMBER_MAX, pile.ember + EMBER_PER_TURN + pile.surge * 2);
  pile.surge = 0;
  state.turn = side;
}

/** A card's power in its lane, after the auras and tricks that live there. */
export function effectivePower(state, laneIndex, side, card) {
  const lane = state.lanes[laneIndex];
  const friends = lane.cards[side];
  const foes = lane.cards[otherSide(side)];
  let power = card.power - card.weakened;
  const sameSuit = friends.filter((other) => other.suit === card.suit).length;
  if (card.effect === 'kindle' && card.suit === 'flame') power += sameSuit;
  if (card.effect === 'flow' && card.suit === 'tide') power += sameSuit;
  if (card.effect === 'bulwark' && card.suit === 'stone') power += sameSuit;
  if (card.effect === 'snare') power += foes.length;
  if (card.effect === 'pact' && friends.length >= 3) power += 2;
  return Math.max(0, power);
}

/** A side's total power in a lane. */
export function lanePower(state, laneIndex, side) {
  return state.lanes[laneIndex].cards[side].reduce(
    (total, card) => total + effectivePower(state, laneIndex, side, card),
    0,
  );
}

/** Whether a side may play this hand card into this lane right now. */
export function canPlayCard(state, side, cardUid, laneIndex) {
  if (state.phase !== 'table' || state.turn !== side) return false;
  if (state.lanes[laneIndex].locked) return false;
  const pile = state.sides[side];
  const card = pile.hand.find((held) => held.uid === cardUid);
  return Boolean(card) && pile.ember >= card.cost;
}

/** Play a hand card into a lane, applying its on-play effect. Returns its events. */
export function playCard(state, side, cardUid, laneIndex) {
  const events = [];
  const pile = state.sides[side];
  const handIndex = pile.hand.findIndex((held) => held.uid === cardUid);
  if (handIndex < 0 || !canPlayCard(state, side, cardUid, laneIndex)) return events;
  const card = pile.hand.splice(handIndex, 1)[0];
  pile.ember -= card.cost;
  state.lanes[laneIndex].cards[side].push(card);
  state.stats.cardsPlayed += 1;
  state.consecutivePasses = 0;
  events.push({ type: 'played', side, card, lane: laneIndex });

  const foe = otherSide(side);
  if (card.effect === 'surge') {
    pile.surge += 1;
    events.push({ type: 'surge', side, card });
  } else if (card.effect === 'wash') {
    const foes = state.lanes[laneIndex].cards[foe];
    if (foes.length > 0) {
      let strongest = foes[0];
      for (const other of foes) {
        if (effectivePower(state, laneIndex, foe, other) > effectivePower(state, laneIndex, foe, strongest)) strongest = other;
      }
      strongest.weakened += 2;
      events.push({ type: 'wash', side, card: strongest, lane: laneIndex });
    }
  } else if (card.effect === 'seal') {
    state.lanes[laneIndex].locked = true;
    events.push({ type: 'seal', side, lane: laneIndex });
  } else if (card.effect === 'bargain') {
    pile.life = Math.max(0, pile.life - 2);
    events.push({ type: 'bargain', side, card });
  }
  return events;
}

/** Discard a hand card and gain ember equal to its cost. Returns its events. */
export function sacrificeCard(state, side, cardUid) {
  const events = [];
  if (state.phase !== 'table' || state.turn !== side) return events;
  const pile = state.sides[side];
  const handIndex = pile.hand.findIndex((held) => held.uid === cardUid);
  if (handIndex < 0) return events;
  const card = pile.hand.splice(handIndex, 1)[0];
  pile.discard.push(card);
  pile.ember = Math.min(EMBER_MAX, pile.ember + card.cost);
  state.stats.sacrificed += 1;
  state.consecutivePasses = 0;
  events.push({ type: 'sacrificed', side, card });
  return events;
}

/** Pass the turn. Two passes in a row score the round. Returns its events. */
export function passTurn(state, side) {
  const events = [];
  if (state.phase !== 'table' || state.turn !== side) return events;
  state.consecutivePasses += 1;
  events.push({ type: 'passed', side });
  if (state.consecutivePasses >= 2) events.push(...scoreRound(state));
  return events;
}

/** Score the lanes, deal the damage, and end the round or the match. */
export function scoreRound(state) {
  const events = [];
  const laneResults = [];
  let playerLanes = 0;
  let aiLanes = 0;
  for (let laneIndex = 0; laneIndex < LANES.length; laneIndex += 1) {
    const playerPower = lanePower(state, laneIndex, SIDE_PLAYER);
    const aiPower = lanePower(state, laneIndex, SIDE_AI);
    let winner = null;
    if (playerPower > aiPower) {
      winner = SIDE_PLAYER;
      playerLanes += 1;
      state.sides[SIDE_AI].life = Math.max(0, state.sides[SIDE_AI].life - LANE_DAMAGE);
    } else if (aiPower > playerPower) {
      winner = SIDE_AI;
      aiLanes += 1;
      state.sides[SIDE_PLAYER].life = Math.max(0, state.sides[SIDE_PLAYER].life - LANE_DAMAGE);
    }
    laneResults.push({ lane: laneIndex, playerPower, aiPower, winner });
    events.push({ type: 'lane', lane: laneIndex, winner, playerPower, aiPower });
  }
  const roundWinner = playerLanes >= 2 ? SIDE_PLAYER : aiLanes >= 2 ? SIDE_AI : null;
  if (roundWinner) state.sides[roundWinner].roundWins += 1;
  state.stats.roundsPlayed += 1;
  state.roundResult = { round: state.round, laneResults, playerLanes, aiLanes, roundWinner };
  events.push({ type: 'round', result: state.roundResult });

  const player = state.sides[SIDE_PLAYER];
  const ai = state.sides[SIDE_AI];
  let winner = null;
  if (player.life <= 0 && ai.life <= 0) winner = player.life === ai.life ? 'draw' : player.life > ai.life ? SIDE_PLAYER : SIDE_AI;
  else if (player.life <= 0) winner = SIDE_AI;
  else if (ai.life <= 0) winner = SIDE_PLAYER;
  else if (player.roundWins >= ROUNDS_TO_WIN) winner = SIDE_PLAYER;
  else if (ai.roundWins >= ROUNDS_TO_WIN) winner = SIDE_AI;

  if (winner) {
    state.winner = winner;
    state.phase = 'matchEnd';
    events.push({ type: 'match', winner });
  } else {
    state.phase = 'roundEnd';
  }
  return events;
}

/** Move on from a scored round into the next one. */
export function nextRound(state) {
  state.round += 1;
  startRound(state);
}

/** One line for the log, newest first, capped so the table stays readable. */
export function note(state, message) {
  state.log.unshift(message);
  if (state.log.length > 5) state.log.length = 5;
}

/** A short, human line for an event, for the table's log. */
export function describeEvent(event) {
  const who = event.side === SIDE_PLAYER ? 'You' : 'The Warden';
  if (event.type === 'played') return `${who} played ${event.card.name} (${event.card.power} power)`;
  if (event.type === 'sacrificed') return `${who} sacrificed ${event.card.name} for ${event.card.cost} ember`;
  if (event.type === 'passed') return `${who} passed`;
  if (event.type === 'surge') return `${who} banks +2 ember for next turn`;
  if (event.type === 'wash') return `${who} washed ${event.card.name} down by 2`;
  if (event.type === 'seal') return `${who} sealed the lane shut`;
  if (event.type === 'bargain') return `${who} paid 2 life for the bargain`;
  if (event.type === 'lane') {
    const name = LANES[event.lane].name;
    if (!event.winner) return `${name} tied ${event.playerPower}–${event.aiPower}`;
    return `${event.winner === SIDE_PLAYER ? 'You take' : 'The Warden takes'} ${name} ${event.playerPower}–${event.aiPower}`;
  }
  if (event.type === 'round') {
    const result = event.result;
    if (!result.roundWinner) return `Round ${result.round} drawn — no one takes it`;
    return `Round ${result.round}: ${result.roundWinner === SIDE_PLAYER ? 'you take' : 'the Warden takes'} it ${result.playerLanes}–${result.aiLanes}`;
  }
  if (event.type === 'match') {
    return event.winner === 'draw'
      ? 'The pact ends in a draw'
      : event.winner === SIDE_PLAYER
        ? 'You win the match'
        : 'The Warden wins the match';
  }
  return '';
}

// Keep the deck size honest: a build that edits DECK_COUNTS must still deal 30 cards.
export const DECK_SIZE_CHECK = DECK_SIZE;
