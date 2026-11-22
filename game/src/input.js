// Mouse and keyboard, turned into game actions. The canvas is a fixed logical table
// scaled to the window, so every pointer position is mapped back into logical pixels
// before it is tested against the layout's rectangles.
//
// Clicks: a hand card selects it; a lane plays the selected card there; the Pass and
// Sacrifice buttons do what they say; the big buttons start, continue and replay.
// Keys: ←/→ move through the hand, ↑/↓ move through the lanes, Enter plays the
// selected card into the highlighted lane, P passes, S sacrifices the selected card,
// Esc clears the selection.

import { FIELD } from './config.js';

function pointIn(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** Wire a canvas to the game's handlers. Returns { detach } and a live hover point. */
export function createInput(canvas, handlers) {
  const hover = { x: -1, y: -1, lane: -1, cardUid: null };

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const offsetX = (rect.width - FIELD.width * scale) / 2;
    const offsetY = (rect.height - FIELD.height * scale) / 2;
    return {
      x: (event.clientX - rect.left - offsetX) / scale,
      y: (event.clientY - rect.top - offsetY) / scale,
    };
  }

  function onMove(event) {
    const point = toLogical(event);
    hover.x = point.x;
    hover.y = point.y;
    const layout = handlers.layout();
    hover.lane = -1;
    hover.cardUid = null;
    if (layout) {
      for (let index = 0; index < layout.lanes.length; index += 1) {
        if (pointIn(layout.lanes[index].rect, point.x, point.y)) hover.lane = index;
      }
      for (const slot of layout.handCards) {
        if (pointIn(slot.rect, point.x, point.y)) hover.cardUid = slot.uid;
      }
    }
    canvas.style.cursor = hover.lane >= 0 || hover.cardUid ? 'pointer' : 'default';
  }

  function onClick(event) {
    const point = toLogical(event);
    const layout = handlers.layout();
    if (!layout) return;
    if (pointIn(layout.startButton, point.x, point.y) && handlers.onConfirm) {
      handlers.onConfirm();
      return;
    }
    if (pointIn(layout.continueButton, point.x, point.y) && handlers.onConfirm) {
      handlers.onConfirm();
      return;
    }
    if (pointIn(layout.playAgainButton, point.x, point.y) && handlers.onConfirm) {
      handlers.onConfirm();
      return;
    }
    if (pointIn(layout.passButton, point.x, point.y) && handlers.onPass) {
      handlers.onPass();
      return;
    }
    if (pointIn(layout.sacrificeButton, point.x, point.y) && handlers.onSacrifice) {
      handlers.onSacrifice();
      return;
    }
    for (const slot of layout.handCards) {
      if (pointIn(slot.rect, point.x, point.y)) {
        handlers.onHandCard(slot.uid);
        return;
      }
    }
    for (let index = 0; index < layout.lanes.length; index += 1) {
      if (pointIn(layout.lanes[index].rect, point.x, point.y)) {
        handlers.onLane(index);
        return;
      }
    }
  }

  function onKey(event) {
    if (event.key === 'ArrowLeft') handlers.onCycleHand(-1);
    else if (event.key === 'ArrowRight') handlers.onCycleHand(1);
    else if (event.key === 'ArrowUp') handlers.onCycleLane(-1);
    else if (event.key === 'ArrowDown') handlers.onCycleLane(1);
    else if (event.key === 'Enter' || event.key === ' ') handlers.onConfirm();
    else if (event.key === 'p' || event.key === 'P') handlers.onPass();
    else if (event.key === 's' || event.key === 'S') handlers.onSacrifice();
    else if (event.key === 'Escape') handlers.onEscape();
    else return;
    event.preventDefault();
  }

  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('click', onClick);
  window.addEventListener('keydown', onKey);
  return {
    hover,
    detach() {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    },
  };
}
