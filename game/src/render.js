// Everything the player sees, painted on one canvas: the title screen, the table with
// both hands and both life totals, the round and match end screens, and the little
// flourishes — sliding cards, ember sparks, floating damage numbers — that give the
// game its feel. Nothing here changes the match; it only reads state and ui.
//
// The canvas is a fixed 1280x800 logical table, scaled to the window. Suits are told
// apart by colour AND by a drawn shape (triangle, droplet, diamond, square), so a card
// stays readable even at thumbnail size.

import { FIELD, FONT, LANES, PALETTE, SUITS } from './config.js';
import { EFFECT_TEXT } from './cards.js';
import { SIDE_AI, SIDE_PLAYER, effectivePower, lanePower } from './engine.js';
import { AI_NAME, AI_TITLE } from './ai.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_TABLE = 'table';
export const SCREEN_ROUND = 'round';
export const SCREEN_OVER = 'over';

/** Hand card size, lane card size and the opponent's mini card-back size. */
const HAND_CARD = { width: 112, height: 150 };
const LANE_CARD = { width: 86, height: 114 };
const MINI_CARD = { width: 52, height: 72 };

/** Layout of the table, in logical pixels. */
export function computeLayout(state) {
  const lanes = LANES.map((lane, index) => ({
    id: lane.id,
    name: lane.name,
    rect: { x: 36 + index * 414, y: 146, width: 392, height: 404 },
  }));
  const hand = state.sides[SIDE_PLAYER].hand;
  const handWidth = hand.length * (HAND_CARD.width + 10) - 10;
  const handCards = hand.map((card, index) => ({
    uid: card.uid,
    rect: {
      x: (FIELD.width - handWidth) / 2 + index * (HAND_CARD.width + 10),
      y: 576,
      width: HAND_CARD.width,
      height: HAND_CARD.height,
    },
  }));
  const aiHand = state.sides[SIDE_AI].hand;
  const aiWidth = aiHand.length * (MINI_CARD.width + 8) - 8;
  const aiCards = aiHand.map((card, index) => ({
    uid: card.uid,
    rect: {
      x: (FIELD.width - aiWidth) / 2 + index * (MINI_CARD.width + 8),
      y: 62,
      width: MINI_CARD.width,
      height: MINI_CARD.height,
    },
  }));
  return {
    lanes,
    handCards,
    aiCards,
    passButton: { x: 1064, y: 742, width: 96, height: 42 },
    sacrificeButton: { x: 952, y: 742, width: 104, height: 42 },
    continueButton: { x: 540, y: 560, width: 200, height: 48 },
    playAgainButton: { x: 540, y: 560, width: 200, height: 48 },
    startButton: { x: 490, y: 566, width: 300, height: 56 },
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawSuitShape(ctx, shape, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (shape === 'triangle') {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.9, y + size * 0.7);
    ctx.lineTo(x - size * 0.9, y + size * 0.7);
  } else if (shape === 'droplet') {
    ctx.moveTo(x, y - size);
    ctx.bezierCurveTo(x + size * 0.9, y - size * 0.1, x + size * 0.75, y + size * 0.85, x, y + size * 0.85);
    ctx.bezierCurveTo(x - size * 0.75, y + size * 0.85, x - size * 0.9, y - size * 0.1, x, y - size);
  } else if (shape === 'diamond') {
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.75, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.75, y);
  } else {
    ctx.rect(x - size * 0.8, y - size * 0.8, size * 1.6, size * 1.6);
  }
  ctx.closePath();
  ctx.fill();
}

function drawEmberPip(ctx, x, y, radius, lit) {
  ctx.fillStyle = lit ? PALETTE.emberHot : '#5a3d28';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = lit ? PALETTE.ember : '#3a241a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawLifeBar(ctx, x, y, width, life, max, label) {
  ctx.fillStyle = '#241812';
  roundRect(ctx, x, y, width, 18, 9);
  ctx.fill();
  const fraction = Math.max(0, life / max);
  ctx.fillStyle = fraction > 0.5 ? PALETTE.good : fraction > 0.25 ? PALETTE.ember : PALETTE.life;
  if (fraction > 0) {
    roundRect(ctx, x + 2, y + 2, (width - 4) * fraction, 14, 7);
    ctx.fill();
  }
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${label} ${life}`, x + width + 10, y + 9);
}

function drawEmberPool(ctx, x, y, ember, max) {
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `bold 13px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Ember', x, y + 8);
  for (let index = 0; index < max; index += 1) {
    drawEmberPip(ctx, x + 52 + index * 20, y + 8, 7, index < ember);
  }
}

/** Shorten text with an ellipsis until it fits `maxWidth` at the current font. */
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) cut = cut.slice(0, -1);
  return cut + '…';
}

function drawCardFace(ctx, card, x, y, width, height, options = {}) {
  const suit = SUITS[card.suit];
  const selected = options.selected === true;
  const dimmed = options.dimmed === true;
  const power = options.power ?? card.power;
  ctx.save();
  if (dimmed) ctx.globalAlpha = 0.45;
  ctx.shadowColor = PALETTE.shadow;
  ctx.shadowBlur = selected ? 18 : 8;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = PALETTE.cardFace;
  roundRect(ctx, x, y, width, height, 10);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = selected ? PALETTE.focus : PALETTE.cardEdge;
  ctx.lineWidth = selected ? 4 : 2;
  roundRect(ctx, x, y, width, height, 10);
  ctx.stroke();

  // Suit band across the top, in the suit's colour, with its shape.
  ctx.fillStyle = suit.color;
  roundRect(ctx, x + 3, y + 3, width - 6, 26, 7);
  ctx.fill();
  drawSuitShape(ctx, suit.shape, x + 16, y + 16, 8, '#ffffff');
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.max(11, width * 0.11)}px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(suit.name.toUpperCase(), x + 30, y + 17);

  // Ember cost, top right, as a number in a hot circle.
  ctx.fillStyle = '#241812';
  ctx.beginPath();
  ctx.arc(x + width - 18, y + 16, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.emberHot;
  ctx.font = `bold 15px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(card.cost), x + width - 18, y + 17);

  // Big suit shape in the middle, power number over it. A washed card's power
  // shows in blue, with the wash marked beside it.
  drawSuitShape(ctx, suit.shape, x + width / 2, y + height * 0.42, Math.min(30, width * 0.26), suit.color);
  ctx.fillStyle = card.weakened > 0 ? '#1d5f86' : '#241812';
  ctx.font = `bold ${Math.max(26, width * 0.28)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(String(power), x + width / 2, y + height * 0.42 + 2);
  if (card.weakened > 0) {
    const numberWidth = ctx.measureText(String(power)).width;
    ctx.fillStyle = '#1d5f86';
    ctx.font = `bold ${Math.max(11, width * 0.11)}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`−${card.weakened}`, x + width / 2 + numberWidth / 2 + 4, y + height * 0.42 + 2);
  }

  // Name and effect, small but legible, clipped to the card's width.
  ctx.fillStyle = '#241812';
  ctx.font = `bold ${Math.max(11, width * 0.115)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(fitText(ctx, card.name, width - 8), x + width / 2, y + height - 38);
  if (card.effect) {
    ctx.fillStyle = '#5a3d28';
    ctx.font = `${Math.max(9, width * 0.085)}px ${FONT}`;
    ctx.fillText(fitText(ctx, EFFECT_TEXT[card.effect], width - 8), x + width / 2, y + height - 20);
  } else {
    ctx.fillStyle = '#8b7a66';
    ctx.font = `${Math.max(9, width * 0.085)}px ${FONT}`;
    ctx.fillText('—', x + width / 2, y + height - 20);
  }
  ctx.restore();
}

function drawCardBack(ctx, x, y, width, height) {
  ctx.fillStyle = PALETTE.cardBack;
  roundRect(ctx, x, y, width, height, 8);
  ctx.fill();
  ctx.strokeStyle = PALETTE.ember;
  ctx.lineWidth = 2;
  roundRect(ctx, x + 4, y + 4, width - 8, height - 8, 6);
  ctx.stroke();
  drawSuitShape(ctx, 'triangle', x + width / 2, y + height / 2, Math.min(14, width * 0.25), PALETTE.ember);
}

function drawButton(ctx, rect, label, enabled) {
  ctx.save();
  if (!enabled) ctx.globalAlpha = 0.45;
  ctx.fillStyle = PALETTE.button;
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.buttonEdge;
  ctx.lineWidth = 2;
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 10);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 1);
  ctx.restore();
}

function drawLane(ctx, state, laneIndex, layout, ui) {
  const lane = state.lanes[laneIndex];
  const rect = layout.lanes[laneIndex].rect;
  const isFocus = state.focusLane === laneIndex && state.phase === 'table' && state.turn === SIDE_PLAYER;
  ctx.fillStyle = lane.locked ? PALETTE.laneLocked : PALETTE.lane;
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
  ctx.fill();
  ctx.strokeStyle = isFocus ? PALETTE.focus : PALETTE.laneEdge;
  ctx.lineWidth = isFocus ? 3 : 1.5;
  roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
  ctx.stroke();

  // Lane name banner, with a lock mark or the Warden's focus eye.
  ctx.fillStyle = PALETTE.text;
  ctx.font = `bold 17px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(LANES[laneIndex].name.toUpperCase(), rect.x + rect.width / 2, rect.y + 20);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = `12px ${FONT}`;
  ctx.fillText(LANES[laneIndex].hint, rect.x + rect.width / 2, rect.y + 40);
  if (lane.locked) {
    ctx.fillStyle = '#b8a5d6';
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText('SEALED — no more cards here', rect.x + rect.width / 2, rect.y + 60);
  }
  if (isFocus) {
    ctx.fillStyle = PALETTE.focus;
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText('◉ THE WARDEN EYES THIS LANE', rect.x + rect.width / 2, rect.y + 60);
  }

  // The Warden's cards stack down from the top of the lane.
  const aiCards = lane.cards[SIDE_AI];
  aiCards.forEach((card, index) => {
    const x = rect.x + (rect.width - LANE_CARD.width) / 2;
    const y = rect.y + 72 + index * 24;
    drawCardFace(ctx, card, x, y, LANE_CARD.width, LANE_CARD.height, {
      power: effectivePower(state, laneIndex, SIDE_AI, card),
    });
  });
  // Your cards stack up from the bottom of the lane.
  const playerCards = lane.cards[SIDE_PLAYER];
  playerCards.forEach((card, index) => {
    const x = rect.x + (rect.width - LANE_CARD.width) / 2;
    const y = rect.y + rect.height - 16 - LANE_CARD.height - index * 24;
    drawCardFace(ctx, card, x, y, LANE_CARD.width, LANE_CARD.height, {
      power: effectivePower(state, laneIndex, SIDE_PLAYER, card),
    });
  });

  // Power totals, dead centre, big enough to read at a glance.
  const playerPower = lanePower(state, laneIndex, SIDE_PLAYER);
  const aiPower = lanePower(state, laneIndex, SIDE_AI);
  const centreY = rect.y + rect.height / 2 + 8;
  ctx.fillStyle = '#241812';
  roundRect(ctx, rect.x + rect.width / 2 - 78, centreY - 18, 156, 36, 18);
  ctx.fill();
  ctx.font = 'bold 20px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillStyle = playerPower > aiPower ? PALETTE.good : PALETTE.text;
  ctx.fillText(String(playerPower), rect.x + rect.width / 2 - 52, centreY + 1);
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText('—', rect.x + rect.width / 2, centreY + 1);
  ctx.fillStyle = aiPower > playerPower ? PALETTE.bad : PALETTE.text;
  ctx.fillText(String(aiPower), rect.x + rect.width / 2 + 52, centreY + 1);
  if (ui.laneFlash && ui.laneFlash.lane === laneIndex && ui.laneFlash.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = ui.laneFlash.alpha;
    ctx.fillStyle = ui.laneFlash.winner === SIDE_PLAYER ? PALETTE.good : PALETTE.bad;
    roundRect(ctx, rect.x, rect.y, rect.width, rect.height, 14);
    ctx.fill();
    ctx.restore();
  }
}

function drawTable(ctx, state, layout, ui) {
  // Felt backdrop.
  ctx.fillStyle = PALETTE.felt;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.strokeStyle = PALETTE.feltEdge;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(FIELD.width / 2, FIELD.height / 2, 620, 330, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Top bar: the Warden, its life and ember, the round.
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 18px ' + FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(AI_NAME, 36, 24);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px ' + FONT;
  ctx.fillText(AI_TITLE, 36, 44);
  drawLifeBar(ctx, 300, 16, 170, state.sides[SIDE_AI].life, 20, 'Life');
  drawEmberPool(ctx, 560, 16, state.sides[SIDE_AI].ember, 10);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 15px ' + FONT;
  ctx.textAlign = 'right';
  ctx.fillText(`Round ${state.round}`, FIELD.width - 36, 20);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px ' + FONT;
  const wins = `Rounds  ${'●'.repeat(state.sides[SIDE_PLAYER].roundWins)}${'○'.repeat(2 - state.sides[SIDE_PLAYER].roundWins)}  —  ${'●'.repeat(state.sides[SIDE_AI].roundWins)}${'○'.repeat(2 - state.sides[SIDE_AI].roundWins)}`;
  ctx.fillText(wins, FIELD.width - 36, 42);

  // The Warden's hand, face down, and its count.
  for (const slot of layout.aiCards) drawCardBack(ctx, slot.rect.x, slot.rect.y, slot.rect.width, slot.rect.height);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px ' + FONT;
  ctx.textAlign = 'left';
  const aiCount = state.sides[SIDE_AI].hand.length;
  ctx.fillText(`${aiCount} card${aiCount === 1 ? '' : 's'} in hand`, 36, 100);

  // Lanes.
  for (let index = 0; index < LANES.length; index += 1) drawLane(ctx, state, index, layout, ui);

  // Your hand, fanned along the bottom.
  for (const slot of layout.handCards) {
    const card = state.sides[SIDE_PLAYER].hand.find((held) => held.uid === slot.uid);
    if (!card) continue;
    const selected = ui.selectedUid === card.uid;
    const rect = selected
      ? { x: slot.rect.x, y: slot.rect.y - 22, width: slot.rect.width, height: slot.rect.height }
      : slot.rect;
    const affordable = state.turn !== SIDE_PLAYER || state.sides[SIDE_PLAYER].ember >= card.cost;
    drawCardFace(ctx, card, rect.x, rect.y, rect.width, rect.height, { selected, dimmed: !affordable });
  }

  // Bottom bar: your life and ember, the log line, and the action buttons.
  drawLifeBar(ctx, 36, 750, 170, state.sides[SIDE_PLAYER].life, 20, 'Life');
  drawEmberPool(ctx, 300, 750, state.sides[SIDE_PLAYER].ember, 10);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px ' + FONT;
  ctx.textAlign = 'left';
  const lastLog = state.log[0] ?? '';
  ctx.fillText(lastLog, 560, 760);
  const yourTurn = state.phase === 'table' && state.turn === SIDE_PLAYER;
  drawButton(ctx, layout.passButton, 'Pass (P)', yourTurn);
  drawButton(ctx, layout.sacrificeButton, 'Sacrifice (S)', yourTurn && ui.selectedUid !== null);

  // Whose turn it is, and what to do with a selected card.
  ctx.fillStyle = yourTurn ? PALETTE.emberHot : PALETTE.muted;
  ctx.font = 'bold 14px ' + FONT;
  ctx.textAlign = 'center';
  const hint = state.phase !== 'table'
    ? ''
    : yourTurn
      ? ui.selectedUid
        ? 'Click a lane to play the card — or Sacrifice it for ember'
        : 'Your turn: click a card, then a lane — or Pass'
      : 'The Warden is thinking…';
  ctx.fillText(hint, FIELD.width / 2, 566);

  // Flying cards, sparks and floating numbers ride above the table.
  drawFx(ctx, ui);
}

function drawFx(ctx, ui) {
  for (const spark of ui.sparks ?? []) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, spark.life);
    ctx.fillStyle = spark.color;
    ctx.beginPath();
    ctx.arc(spark.x, spark.y, 3 + spark.life * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (const fly of ui.flying ?? []) {
    const t = Math.min(1, fly.t);
    const eased = 1 - (1 - t) * (1 - t);
    const x = fly.from.x + (fly.to.x - fly.from.x) * eased;
    const y = fly.from.y + (fly.to.y - fly.from.y) * eased - Math.sin(t * Math.PI) * 40;
    drawCardFace(ctx, fly.card, x, y, fly.width, fly.height, { power: fly.power });
  }
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const float of ui.floats ?? []) {
    ctx.globalAlpha = Math.max(0, float.life);
    ctx.fillStyle = float.color;
    ctx.font = 'bold 26px ' + FONT;
    ctx.fillText(float.text, float.x, float.y);
  }
  ctx.restore();
}

function drawTitle(ctx, state, layout, ui, best) {
  ctx.fillStyle = PALETTE.backdrop;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  // A drift of still embers behind the title: fixed positions, drawn, never an image.
  const embers = [
    [120, 130, 3], [240, 90, 2], [360, 150, 2], [900, 110, 3], [1040, 180, 2],
    [1140, 320, 3], [90, 420, 2], [180, 640, 3], [1120, 640, 2], [980, 700, 3],
    [700, 80, 2], [560, 120, 2], [60, 240, 2], [1220, 480, 2], [300, 720, 2],
  ];
  for (const [x, y, radius] of embers) {
    ctx.fillStyle = 'rgba(255,154,61,0.5)';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = PALETTE.emberHot;
  ctx.font = 'bold 14px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillText('A LANE-BATTLE CARD GAME  ·  THREE LANES  ·  ONE PACT', 640, 96);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 96px ' + FONT;
  ctx.fillText('EMBER PACT', 640, 200);
  ctx.fillStyle = PALETTE.ember;
  ctx.font = 'italic 22px ' + FONT;
  ctx.fillText('Spend ember. Seal lanes. Break the Warden.', 640, 248);

  // Three showcase cards, drawn from the real catalogue.
  const showcase = [
    { id: 'pyre-drake', name: 'Pyre Drake', suit: 'flame', cost: 5, power: 8, effect: null },
    { id: 'storm-leviathan', name: 'Storm Leviathan', suit: 'tide', cost: 6, power: 10, effect: null },
    { id: 'mountain-king', name: 'Mountain King', suit: 'stone', cost: 7, power: 11, effect: null },
  ];
  showcase.forEach((card, index) => {
    drawCardFace(ctx, card, 395 + index * 170, 290, 150, 186, {});
  });

  ctx.fillStyle = PALETTE.muted;
  ctx.font = '15px ' + FONT;
  ctx.fillText('Play one card a turn into a lane. Win 2 of 3 lanes to take the round.', 640, 500);
  ctx.fillText('First to 2 rounds — or the last life standing — wins the match.', 640, 522);
  ctx.fillText('Sacrifice a card for its ember cost. Watch the Warden\'s focus — it tells you where it will strike.', 640, 544);
  drawButton(ctx, layout.startButton, 'PLAY  —  Enter to start', true);
  if (best > 0) {
    ctx.fillStyle = PALETTE.emberHot;
    ctx.font = 'bold 14px ' + FONT;
    ctx.fillText(`Matches won on this machine: ${best}`, 640, 646);
  }
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '12px ' + FONT;
  ctx.fillText('Suits are told by colour and shape: Flame ▲  Tide 💧  Thorn ◆  Stone ■', 640, 690);
  ctx.fillText('Mouse and keyboard: click a card, click a lane. P passes, S sacrifices the selected card.', 640, 712);
}

function drawRoundEnd(ctx, state, layout) {
  drawTable(ctx, state, layout, { selectedUid: null, sparks: [], flying: [], floats: [], laneFlash: null });
  const result = state.roundResult;
  ctx.fillStyle = 'rgba(10,6,4,0.72)';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, 340, 150, 600, 380, 16);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  roundRect(ctx, 340, 150, 600, 380, 16);
  ctx.stroke();

  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 34px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillText(
    result.roundWinner === SIDE_PLAYER ? `ROUND ${result.round} — YOU TAKE IT` : result.roundWinner === SIDE_AI ? `ROUND ${result.round} — THE WARDEN TAKES IT` : `ROUND ${result.round} — DRAWN`,
    640, 210,
  );
  ctx.font = '17px ' + FONT;
  ctx.fillStyle = PALETTE.muted;
  ctx.fillText(`Lanes ${result.playerLanes} – ${result.aiLanes}   ·   each lane won deals ${3} damage`, 640, 246);
  let y = 290;
  for (const laneResult of result.laneResults) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 16px ' + FONT;
    const line = laneResult.winner === SIDE_PLAYER
      ? `You take ${LANES[laneResult.lane].name}  ${laneResult.playerPower}–${laneResult.aiPower}  (−3 Warden life)`
      : laneResult.winner === SIDE_AI
        ? `The Warden takes ${LANES[laneResult.lane].name}  ${laneResult.playerPower}–${laneResult.aiPower}  (−3 your life)`
        : `${LANES[laneResult.lane].name} tied  ${laneResult.playerPower}–${laneResult.aiPower}`;
    ctx.fillText(line, 640, y);
    y += 34;
  }
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillText(`Life — You ${state.sides[SIDE_PLAYER].life}  ·  Warden ${state.sides[SIDE_AI].life}`, 640, y + 16);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '15px ' + FONT;
  ctx.fillText(`Rounds — You ${state.sides[SIDE_PLAYER].roundWins}  ·  Warden ${state.sides[SIDE_AI].roundWins}`, 640, y + 44);
  drawButton(ctx, layout.continueButton, 'NEXT ROUND', true);
}

function drawMatchEnd(ctx, state, layout) {
  const won = state.winner === SIDE_PLAYER;
  const drawn = state.winner === 'draw';
  ctx.fillStyle = won ? '#241708' : '#160d0b';
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  if (won) {
    const glow = ctx.createRadialGradient(640, 300, 40, 640, 300, 500);
    glow.addColorStop(0, 'rgba(255,210,61,0.4)');
    glow.addColorStop(1, 'rgba(255,210,61,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  ctx.fillStyle = won ? PALETTE.emberHot : PALETTE.text;
  ctx.font = 'bold 64px ' + FONT;
  ctx.textAlign = 'center';
  ctx.fillText(drawn ? 'A DRAWN PACT' : won ? 'THE PACT IS YOURS' : 'THE WARDEN PREVAILS', 640, 240);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = 'italic 22px ' + FONT;
  ctx.fillText(
    drawn
      ? 'Both embers burn out together. The pact holds — for now.'
      : won
        ? 'Two rounds taken. The ember answers to you now.'
        : 'The Warden keeps the gate. Study its focus — and come back stronger.',
    640, 292,
  );

  // The final table: life, rounds, cards played.
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, 440, 340, 400, 150, 14);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 2;
  roundRect(ctx, 440, 340, 400, 150, 14);
  ctx.stroke();
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 18px ' + FONT;
  ctx.fillText(`Final life — You ${state.sides[SIDE_PLAYER].life}  ·  Warden ${state.sides[SIDE_AI].life}`, 640, 386);
  ctx.fillText(`Rounds — You ${state.sides[SIDE_PLAYER].roundWins}  ·  Warden ${state.sides[SIDE_AI].roundWins}`, 640, 420);
  ctx.fillText(`Cards played — ${state.stats.cardsPlayed}  ·  Sacrificed — ${state.stats.sacrificed}`, 640, 454);
  drawButton(ctx, layout.playAgainButton, 'PLAY AGAIN', true);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px ' + FONT;
  ctx.fillText('Press Enter or click Play Again', 640, 640);
}

/** Create the renderer for a canvas. `draw(state, screen, ui, best)` paints one frame. */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    draw(state, screen, ui, best = 0) {
      const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
      const offsetX = (canvas.width - FIELD.width * scale) / 2;
      const offsetY = (canvas.height - FIELD.height * scale) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = PALETTE.backdrop;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      const layout = computeLayout(state);
      if (screen === SCREEN_TITLE) drawTitle(ctx, state, layout, ui, best);
      else if (screen === SCREEN_ROUND) drawRoundEnd(ctx, state, layout);
      else if (screen === SCREEN_OVER) drawMatchEnd(ctx, state, layout);
      else drawTable(ctx, state, layout, ui);
      return layout;
    },
  };
}
