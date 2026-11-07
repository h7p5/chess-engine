// main.js — the starting point. It connects the data (board.js, rules.js)
// to the drawing code (ui.js), to the user's input, and to the AI.

// Find the HTML elements we need once, at the start.
const boardElement = document.getElementById('board');
const statusElement = document.getElementById('status');
const evalFillElement = document.getElementById('eval-fill');
const evalTextElement = document.getElementById('eval-text');
const aiInfoElement = document.getElementById('ai-info');
const historyElement = document.getElementById('move-history');
const opponentBarElement = document.getElementById('opponent-bar');
const playerBarElement = document.getElementById('player-bar');
const difficultyHintElement = document.getElementById('difficulty-hint');
const newGameButton = document.getElementById('new-game');
const resultElements = {
  box: document.getElementById('result'),
  title: document.getElementById('result-title'),
  text: document.getElementById('result-text'),
};

// The difficulty levels: search depth -> name and description.
const DIFFICULTIES = {
  1: { name: 'Easy', hint: 'Searches 1 half-move ahead. Grabs pieces without looking back.' },
  2: { name: 'Medium', hint: 'Searches 2 half-moves ahead. Sees your direct replies.' },
  4: { name: 'Hard', hint: 'Searches 4 half-moves ahead. Spots forks and simple tactics.' },
};

// The computer never answers faster than this, so your own move finishes
// its animation first and the reply doesn't feel robotic.
const MIN_REPLY_MS = 450;

// ---------------------------------------------------------------------------
// Everything the page needs to remember
// ---------------------------------------------------------------------------
let game = createGame();
let status = getGameStatus(game); // playing / check / checkmate / stalemate
let playerColor = 'w';            // the human's colour; the computer plays the other
let selected = null;              // {row, col} of the selected piece, or null
let targets = [];                 // legal moves of the selected piece
let aiThinking = false;           // true while the computer is searching
let aiInfo = '';                  // text about the computer's last move
let sanMoves = [];                // the moves played, in chess notation
let resultDismissed = false;      // true after "View board" on the result card
let pendingAnimation = null;      // the move to animate at the next render

function chosenSide() {
  return document.querySelector('input[name="side"]:checked').value;
}

function chosenDepth() {
  return Number(document.querySelector('input[name="difficulty"]:checked').value);
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// Redraw everything the user can see from the current state.
function render() {
  const kingInCheck = status.result === 'check' || status.result === 'checkmate';
  const view = {
    flipped: playerColor === 'b', // your pieces are always at the bottom
    selected: selected,
    targets: targets,
    checkSquare: kingInCheck ? findKing(game.board, game.turn) : null,
    lastMove: game.history.length > 0 ? game.history[game.history.length - 1] : null,
  };
  renderBoard(game, boardElement, view);

  // If a move was just played, animate it on the freshly drawn board.
  if (pendingAnimation) {
    animateMove(boardElement, pendingAnimation.move, pendingAnimation);
    pendingAnimation = null;
  }

  const depth = chosenDepth();
  renderPlayerBar(opponentBarElement, game, opponent(playerColor), {
    name: 'Computer',
    detail: DIFFICULTIES[depth].name + ' · depth ' + depth,
    thinking: aiThinking,
  });
  renderPlayerBar(playerBarElement, game, playerColor, {
    name: 'You',
    detail: playerColor === 'w' ? 'White' : 'Black',
    thinking: false,
  });

  renderStatus(game, status, statusElement, { playerColor, thinking: aiThinking });
  renderEvaluation(game, evalFillElement, evalTextElement);
  aiInfoElement.textContent = aiInfo;
  renderHistory(sanMoves, historyElement);
  renderResult(status, playerColor, resultDismissed, resultElements);
  difficultyHintElement.textContent = DIFFICULTIES[depth].hint;
}

function clearSelection() {
  selected = null;
  targets = [];
}

// ---------------------------------------------------------------------------
// Playing moves
// ---------------------------------------------------------------------------
// Play a move (the human's or the computer's), redraw with an animation,
// and start the computer's search if it's now its turn.
// options.slide: false when the piece was dragged (it's already in place).
function playMove(move, options) {
  sanMoves.push(moveToSAN(game, move)); // needs the position BEFORE the move
  game = applyMove(game, move);
  status = getGameStatus(game);
  clearSelection();

  // Decide BEFORE drawing whether the computer moves next, so we draw only
  // once (drawing twice would interrupt the slide animation).
  aiThinking = isComputerTurn();
  pendingAnimation = { move: move, slide: options.slide };
  render();

  if (aiThinking) requestComputerMove();
}

function isComputerTurn() {
  return !isGameOver(status) && game.turn !== playerColor;
}

function canHumanMove() {
  return !isGameOver(status) && !aiThinking && game.turn === playerColor;
}

// Try to move the selected piece to (row, col). Returns true if that was
// a legal target (the move is played, or the promotion popup opens).
function tryMoveSelectedTo(row, col, options) {
  const matching = targets.filter(m => m.to.row === row && m.to.col === col);
  if (matching.length === 0) return false;

  if (matching.length === 1) {
    playMove(matching[0], options);
  } else {
    // Several moves go to the same square only when a pawn promotes:
    // one move per piece it can become. Ask the user which one they want.
    showPromotionPicker(game.turn, (type) => {
      if (type === null) {
        // Cancelled: put the piece back.
        clearSelection();
        render();
        return;
      }
      playMove(matching.find(m => m.promotion === type), options);
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// The computer opponent
// ---------------------------------------------------------------------------
// The search runs in a Web Worker (js/ai-worker.js) so the page stays
// responsive. Browsers refuse to start workers when index.html is opened
// directly as a file (file://...), so in that case we fall back to running
// the search on the page itself. It still works; the page just freezes
// while the computer thinks.

let worker = createAiWorker();
let fallbackTimer = null; // used only by the no-worker fallback
let replyTimer = null;    // waits out MIN_REPLY_MS before playing the reply
let requestTime = 0;

function createAiWorker() {
  try {
    const newWorker = new Worker('js/ai-worker.js');
    // When the worker sends back its answer, play the move.
    newWorker.onmessage = (event) => onComputerMoveFound(event.data);
    // If the worker file fails to load, switch to the fallback.
    newWorker.onerror = (event) => {
      event.preventDefault();
      worker = null;
      if (aiThinking) searchWithoutWorker(currentSearchRequest());
    };
    return newWorker;
  } catch (error) {
    return null;
  }
}

// What we ask the computer: the position (without the move history, which
// the search doesn't need) and how deep to look.
function currentSearchRequest() {
  return {
    game: { ...game, history: [] },
    depth: chosenDepth(),
  };
}

function requestComputerMove() {
  requestTime = Date.now();
  const request = currentSearchRequest();
  if (worker) {
    worker.postMessage(request);
  } else {
    searchWithoutWorker(request);
  }
}

function searchWithoutWorker(request) {
  // The delay lets the browser draw "Computer is thinking…" and finish the
  // player's animation before the page freezes for the search.
  fallbackTimer = setTimeout(() => {
    onComputerMoveFound(findBestMove(request.game, request.depth));
  }, SLIDE_MS + 50);
}

function onComputerMoveFound(result) {
  const wait = Math.max(0, MIN_REPLY_MS - (Date.now() - requestTime));
  replyTimer = setTimeout(() => {
    const san = moveToSAN(game, result.move);
    aiInfo = 'Computer played ' + san + ' · ' + result.nodes.toLocaleString('en') +
      ' positions in ' + (result.ms / 1000).toFixed(2) + ' s';
    aiThinking = false;
    playMove(result.move, { slide: true });
  }, wait);
}

// Stop a search that is still running (used by New game). Otherwise the
// old game's answer could arrive and be played in the new game.
function cancelComputerSearch() {
  clearTimeout(fallbackTimer);
  clearTimeout(replyTimer);
  if (aiThinking && worker) {
    worker.terminate();        // kills the worker mid-search
    worker = createAiWorker(); // and starts a fresh one for next time
  }
  aiThinking = false;
}

// ---------------------------------------------------------------------------
// Mouse and touch input: click-to-move AND drag-and-drop
// ---------------------------------------------------------------------------
// We use "pointer events", which work the same for a mouse, a finger and a
// pen. There is ONE listener on the board (event delegation, as before).
//
//   pointerdown  on a target square        -> play the move (click-to-move)
//                on one of your pieces      -> select it, and get ready to drag
//                anywhere else              -> clear the selection
//   pointermove  if the pointer moved more than a few pixels, it's a drag:
//                the piece follows the pointer
//   pointerup    after a drag  -> drop: play the move if the square under
//                                 the pointer is a legal target, else snap back
//                after a click -> if the piece was already selected,
//                                 un-select it (click it twice to cancel)

const DRAG_THRESHOLD = 5; // pixels; smaller movements count as a click
let drag = null;          // information about the current press, or null

function squareFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  return element ? element.closest('#board .square') : null;
}

boardElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !canHumanMove()) return; // left button / touch only

  const square = event.target.closest('.square');
  if (!square) return;
  event.preventDefault(); // no text selection or phone gestures

  // dataset values are text, so turn them back into numbers.
  const row = Number(square.dataset.row);
  const col = Number(square.dataset.col);

  // A target of the selected piece: click-to-move.
  if (tryMoveSelectedTo(row, col, { slide: true })) return;

  const piece = game.board[row][col];
  if (piece !== null && piece[0] === game.turn) {
    const wasSelected = isSame(selected, row, col);
    if (!wasSelected) {
      selected = { row, col };
      targets = generateLegalPieceMoves(game, row, col);
      render();
    }
    // render() rebuilt the squares, so look the piece up again.
    const pieceElement = getSquareElement(boardElement, row, col).querySelector('.piece');
    drag = { row, col, wasSelected, pieceElement, startX: event.clientX, startY: event.clientY, moved: false, overSquare: null };
    // Keep receiving pointer events even if the pointer leaves the board.
    boardElement.setPointerCapture(event.pointerId);
    return;
  }

  // Anything else (empty square, enemy piece): cancel the selection.
  clearSelection();
  render();
});

boardElement.addEventListener('pointermove', (event) => {
  if (!drag) return;

  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return; // still just a click
    drag.moved = true;
    drag.pieceElement.classList.add('dragging');
  }

  // The piece follows the pointer, a little bigger, as if lifted.
  drag.pieceElement.style.transform = `translate(${dx}px, ${dy}px) scale(1.12)`;

  // Outline the square under the pointer.
  const over = squareFromPoint(event.clientX, event.clientY);
  if (over !== drag.overSquare) {
    if (drag.overSquare) drag.overSquare.classList.remove('drag-over');
    if (over) over.classList.add('drag-over');
    drag.overSquare = over;
  }
});

boardElement.addEventListener('pointerup', (event) => {
  if (!drag) return;
  const finished = drag;
  drag = null;

  if (finished.moved) {
    // A drop: is the square under the pointer a legal target?
    const square = squareFromPoint(event.clientX, event.clientY);
    const dropped = square !== null &&
      tryMoveSelectedTo(Number(square.dataset.row), Number(square.dataset.col), { slide: false });
    if (!dropped) render(); // not legal: redraw, which puts the piece back
  } else if (finished.wasSelected) {
    // A plain click on the piece that was already selected: un-select it.
    clearSelection();
    render();
  }
});

// The browser can cancel a pointer (for example, a phone call arrives).
boardElement.addEventListener('pointercancel', () => {
  if (!drag) return;
  drag = null;
  render();
});

// ---------------------------------------------------------------------------
// Buttons and settings
// ---------------------------------------------------------------------------
// Throw away the old game, read the chosen side, and start fresh.
// If the human chose Black, the computer (White) moves first.
function startNewGame() {
  cancelComputerSearch();
  playerColor = chosenSide();
  game = createGame();
  status = getGameStatus(game);
  sanMoves = [];
  aiInfo = '';
  resultDismissed = false;
  clearSelection();

  aiThinking = isComputerTurn();
  render();
  if (aiThinking) requestComputerMove();
}

newGameButton.addEventListener('click', startNewGame);
document.getElementById('result-new-game').addEventListener('click', startNewGame);

// "View board" hides the result card so you can look at the final position.
document.getElementById('result-close').addEventListener('click', () => {
  resultDismissed = true;
  render();
});

// Changing the difficulty updates the labels; it applies to the next search.
for (const input of document.querySelectorAll('input[name="difficulty"]')) {
  input.addEventListener('change', render);
}

// Draw the board for the first time when the page loads.
render();
