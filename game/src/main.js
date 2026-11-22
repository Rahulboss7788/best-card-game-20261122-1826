// Boot and the one loop: input becomes actions, the Warden answers after a beat, and
// the renderer paints what is there. The game moves between four screens: title, table,
// round end and match end. Cards fly, embers spark and damage floats up — all of it
// driven by the events the engine reports.
//
// ?seed=N fixes the shuffle. ?shot=title|table|win|loss (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for
// a screenshot.

import { BEST_KEY, FIELD, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  SIDE_AI,
  SIDE_PLAYER,
  beginTurn,
  createMatch,
  describeEvent,
  nextRound,
  note,
  passTurn,
  playCard,
  sacrificeCard,
  startMatch,
} from './engine.js';
import { chooseAction, refreshFocus } from './ai.js';
import { createInput } from './input.js';
import { SCREEN_OVER, SCREEN_ROUND, SCREEN_TABLE, SCREEN_TITLE, computeLayout, createRenderer } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Seconds the Warden waits before answering, so its move can be followed. */
const AI_THINK_SECONDS = 0.8;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const state = createMatch(createRandom(seed));
const renderer = createRenderer(canvas);

const ui = {
  selectedUid: null,
  selectedLane: 1,
  sparks: [],
  flying: [],
  floats: [],
  laneFlash: null,
};

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best score then lasts this visit only.
  }
}

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

function burstSparks(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    ui.sparks.push({
      x: x + (state.random.next() - 0.5) * 60,
      y: y + (state.random.next() - 0.5) * 30,
      vx: (state.random.next() - 0.5) * 30,
      vy: -20 - state.random.next() * 40,
      life: 1,
      color,
    });
  }
}

function flyCard(card, fromRect, toRect, width, height, power) {
  ui.flying.push({
    card,
    from: { x: fromRect.x, y: fromRect.y },
    to: { x: toRect.x, y: toRect.y },
    width,
    height,
    power,
    t: 0,
  });
}

function laneTargetRect(laneIndex, side) {
  const layout = computeLayout(state);
  const rect = layout.lanes[laneIndex].rect;
  const count = state.lanes[laneIndex].cards[side].length;
  const cardWidth = 86;
  const x = rect.x + (rect.width - cardWidth) / 2;
  const y = side === SIDE_AI
    ? rect.y + 72 + (count - 1) * 24
    : rect.y + rect.height - 16 - 114 - (count - 1) * 24;
  return { x, y, width: cardWidth, height: 114 };
}

/** Paint the events onto the table: log lines, sparks, floats and lane flashes. */
function applyEvents(events) {
  for (const event of events) {
    note(state, describeEvent(event));
    if (event.type === 'played') {
      const target = laneTargetRect(event.lane, event.side);
      burstSparks(target.x + 43, target.y + 57, '#ff9a3d', 10);
    }
    if (event.type === 'lane' && event.winner) {
      const layout = computeLayout(state);
      const rect = layout.lanes[event.lane].rect;
      ui.floats.push({
        text: event.winner === SIDE_PLAYER ? '−3' : '−3',
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2 - 40,
        life: 1,
        color: event.winner === SIDE_PLAYER ? '#7bc96f' : '#e5534b',
      });
      ui.laneFlash = { lane: event.lane, winner: event.winner, alpha: 0.35 };
    }
    if (event.type === 'round') {
      screen = SCREEN_ROUND;
      announce(event.result.roundWinner === SIDE_PLAYER ? `Round ${event.result.round} is yours.` : `Round ${event.result.round} goes to the Warden.`);
    }
    if (event.type === 'match') {
      screen = SCREEN_OVER;
      if (event.winner === SIDE_PLAYER) {
        saveBest(readBest() + 1);
        announce('You win the match. The pact is yours.');
      } else if (event.winner === 'draw') {
        announce('The match is a draw.');
      } else {
        announce('The Warden wins the match.');
      }
    }
  }
}

let screen = SCREEN_TITLE;
let best = readBest();
let aiTimer = -1;

function announce(message) {
  status.textContent = message;
}

/** After the player's action, hand the turn to the Warden (or end the round). */
function afterPlayerAction(events) {
  applyEvents(events);
  ui.selectedUid = null;
  if (state.phase !== 'table') return;
  beginTurn(state, SIDE_AI);
  aiTimer = AI_THINK_SECONDS;
}

/** The Warden takes its one action for the turn, then hands back to the player. */
function runAiTurn() {
  refreshFocus(state, 1);
  const action = chooseAction(state, 1);
  let events = [];
  if (action.kind === 'play') {
    const card = state.sides[SIDE_AI].hand.find((held) => held.uid === action.cardUid);
    const layout = computeLayout(state);
    const from = layout.aiCards.find((slot) => slot.uid === action.cardUid) ?? { x: 640, y: 80, width: 52, height: 72 };
    events = playCard(state, SIDE_AI, action.cardUid, action.lane);
    if (card && events.length > 0) {
      const target = laneTargetRect(action.lane, SIDE_AI);
      flyCard(card, from, target, 86, 114, card.power);
    }
  } else if (action.kind === 'sacrifice') {
    events = sacrificeCard(state, SIDE_AI, action.cardUid);
  } else {
    events = passTurn(state, SIDE_AI);
  }
  applyEvents(events);
  if (state.phase !== 'table') return;
  refreshFocus(state, 1);
  beginTurn(state, SIDE_PLAYER);
}

function startGame() {
  startMatch(state);
  refreshFocus(state, 1);
  screen = SCREEN_TABLE;
  ui.selectedUid = null;
  ui.sparks = [];
  ui.flying = [];
  ui.floats = [];
  announce('Playing. Win 2 of 3 lanes to take the round.');
}

function continueMatch() {
  nextRound(state);
  refreshFocus(state, 1);
  screen = SCREEN_TABLE;
  announce(`Round ${state.round}. Your turn.`);
}

function playSelectedCard(laneIndex) {
  if (screen !== SCREEN_TABLE || state.turn !== SIDE_PLAYER || !ui.selectedUid) return;
  const card = state.sides[SIDE_PLAYER].hand.find((held) => held.uid === ui.selectedUid);
  if (!card) return;
  const layout = computeLayout(state);
  const from = layout.handCards.find((slot) => slot.uid === ui.selectedUid);
  const events = playCard(state, SIDE_PLAYER, ui.selectedUid, laneIndex);
  if (events.length === 0) return;
  if (from) {
    const target = laneTargetRect(laneIndex, SIDE_PLAYER);
    flyCard(card, from, target, 86, 114, card.power);
  }
  afterPlayerAction(events);
}

function pass() {
  if (screen !== SCREEN_TABLE || state.turn !== SIDE_PLAYER) return;
  afterPlayerAction(passTurn(state, SIDE_PLAYER));
}

function sacrifice() {
  if (screen !== SCREEN_TABLE || state.turn !== SIDE_PLAYER || !ui.selectedUid) return;
  afterPlayerAction(sacrificeCard(state, SIDE_PLAYER, ui.selectedUid));
}

function confirm() {
  if (screen === SCREEN_TITLE) startGame();
  else if (screen === SCREEN_ROUND) continueMatch();
  else if (screen === SCREEN_OVER) startGame();
  else if (screen === SCREEN_TABLE && ui.selectedUid) playSelectedCard(ui.selectedLane);
}

const input = createInput(canvas, {
  layout() {
    return computeLayout(state);
  },
  onHandCard(uid) {
    if (screen !== SCREEN_TABLE || state.turn !== SIDE_PLAYER) return;
    ui.selectedUid = ui.selectedUid === uid ? null : uid;
  },
  onLane(laneIndex) {
    ui.selectedLane = laneIndex;
    playSelectedCard(laneIndex);
  },
  onPass() {
    pass();
  },
  onSacrifice() {
    sacrifice();
  },
  onConfirm() {
    confirm();
  },
  onCycleHand(direction) {
    if (screen !== SCREEN_TABLE) return;
    const hand = state.sides[SIDE_PLAYER].hand;
    if (hand.length === 0) return;
    const current = hand.findIndex((card) => card.uid === ui.selectedUid);
    const next = current < 0 ? (direction > 0 ? 0 : hand.length - 1) : (current + direction + hand.length) % hand.length;
    ui.selectedUid = hand[next].uid;
  },
  onCycleLane(direction) {
    ui.selectedLane = (ui.selectedLane + direction + 3) % 3;
  },
  onEscape() {
    ui.selectedUid = null;
  },
});

function stepAnimations(dt) {
  for (const spark of ui.sparks) {
    spark.x += spark.vx * dt;
    spark.y += spark.vy * dt;
    spark.vy += 60 * dt;
    spark.life -= dt * 1.4;
  }
  ui.sparks = ui.sparks.filter((spark) => spark.life > 0);
  for (const fly of ui.flying) fly.t += dt * 2.4;
  ui.flying = ui.flying.filter((fly) => fly.t < 1);
  for (const float of ui.floats) {
    float.y -= 30 * dt;
    float.life -= dt * 0.8;
  }
  ui.floats = ui.floats.filter((float) => float.life > 0);
  if (ui.laneFlash) {
    ui.laneFlash.alpha -= dt * 0.5;
    if (ui.laneFlash.alpha <= 0) ui.laneFlash = null;
  }
}

function runShot(name) {
  const staged = stageShot(name, state, startGame, continueMatch);
  screen = staged.screen;
  best = staged.best;
  let painted = 0;
  function paint() {
    renderer.draw(state, screen, ui, best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      stepAnimations(STEP);
      if (aiTimer > 0) {
        aiTimer -= STEP;
        if (aiTimer <= 0 && state.phase === 'table' && state.turn === SIDE_AI) runAiTurn();
      }
      accumulator -= STEP;
    }
    renderer.draw(state, screen, ui, best);
  }
  document.addEventListener('visibilitychange', () => {
    // A hidden tab just pauses the Warden's clock; nothing is lost.
    if (document.hidden) aiTimer = Math.max(aiTimer, 0.1);
  });
  announce('Ember Pact. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// A handle for scripted play-tests: the state, the screen and the ui, read-only in use.
window.__ember = { state, ui, get screen() { return screen; } };

if (shot) runShot(shot);
else runGame();
