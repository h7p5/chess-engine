// ui.js — drawing the game on the page, and animating it.
//
// This file reads the game data (from board.js) and turns it into HTML
// elements the user can see. It never changes the game data itself.

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------
// Draw the whole board from scratch.
// Simple approach: delete all 64 squares and build them again every time.
// That is fast enough for a chessboard and much easier to get right than
// updating single squares.
//
// `view` holds things that affect how the board LOOKS but are not part of
// the chess position itself:
//   view.flipped     — true when the human plays Black (Black at the bottom)
//   view.selected    — {row, col} of the selected piece, or null
//   view.targets     — the moves the selected piece can make
//   view.checkSquare — {row, col} of a king in check, or null
//   view.lastMove    — the last move played (its two squares are tinted), or null
function renderBoard(game, boardElement, view) {
  boardElement.innerHTML = ''; // remove the old squares

  // The squares are added to the page in reading order: top-left first,
  // bottom-right last. (displayRow, displayCol) is the position ON SCREEN.
  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      // Flipping the board: when Black is at the bottom, the screen's
      // top-left square is h1 (row 7, col 7) instead of a8 (row 0, col 0).
      // So we just count from the other end. The board DATA never changes;
      // only the order we draw it in does.
      const row = view.flipped ? 7 - displayRow : displayRow;
      const col = view.flipped ? 7 - displayCol : displayCol;

      const square = document.createElement('div');

      // Colour pattern: a1 (row 7, col 0) is dark. When (row + col) is even
      // the square is light, when it's odd the square is dark.
      const isLight = (row + col) % 2 === 0;
      square.className = 'square ' + (isLight ? 'light' : 'dark');

      // Store the REAL board coordinates on the element, so the input code
      // can find out which square was used — even when the board is flipped.
      square.dataset.row = row;
      square.dataset.col = col;

      // Highlights. Each one is a CSS class; the stylesheet decides the look.
      const last = view.lastMove;
      if (last && (isSame(last.from, row, col) || isSame(last.to, row, col))) {
        square.classList.add('last-move');
      }
      if (isSame(view.selected, row, col)) {
        square.classList.add('selected');
      }
      if (isSame(view.checkSquare, row, col)) {
        square.classList.add('in-check');
      }

      // Mark squares the selected piece can move to. A capture gets a ring
      // around the enemy piece; an empty square gets a small dot.
      const target = view.targets.find(m => isSame(m.to, row, col));
      if (target) {
        square.classList.add(target.captured ? 'capture-target' : 'move-target');
      }

      // Labels go on the LEFT and BOTTOM edges of the screen,
      // so we decide using the display position, not the board position.
      addCoordinateLabels(square, row, col, displayRow, displayCol);

      const piece = game.board[row][col];
      if (piece !== null) {
        square.appendChild(createPieceElement(piece));
      }

      boardElement.appendChild(square);
    }
  }
}

// Is `square` (a {row, col} object, or null) the square at (row, col)?
function isSame(square, row, col) {
  return square !== null && square !== undefined && square.row === row && square.col === col;
}

// Make the element for one piece, e.g. 'wQ' -> a white queen symbol.
function createPieceElement(piece) {
  const color = piece[0]; // 'w' or 'b'
  const type = piece[1];  // 'K', 'Q', 'R', 'B', 'N' or 'P'

  const span = document.createElement('span');
  span.className = 'piece ' + (color === 'w' ? 'white' : 'black');
  span.textContent = PIECE_SYMBOLS[type];
  return span;
}

// Put rank numbers (1–8) on the left column and file letters (a–h)
// on the bottom row, like a real board.
function addCoordinateLabels(square, row, col, displayRow, displayCol) {
  if (displayCol === 0) {
    const label = document.createElement('span');
    label.className = 'coord rank';
    label.textContent = 8 - row;
    square.appendChild(label);
  }
  if (displayRow === 7) {
    const label = document.createElement('span');
    label.className = 'coord file';
    label.textContent = FILES[col];
    square.appendChild(label);
  }
}

// Find the element of the square at (row, col).
function getSquareElement(boardElement, row, col) {
  return boardElement.querySelector('.square[data-row="' + row + '"][data-col="' + col + '"]');
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------
// renderBoard always draws the FINAL position, with the piece already on its
// new square. To make it look like the piece travelled there, we use a trick
// called FLIP (First, Last, Invert, Play):
//   1. measure where the piece should START (the from-square) and where it
//      IS now (the to-square)
//   2. instantly shift it back to the start with a CSS transform
//   3. let the browser animate that transform back to zero
// The piece appears to slide, but the page layout never changes.

const SLIDE_MS = 220;

// People can ask their device to reduce motion (an accessibility setting).
// We respect that by skipping the animations.
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Animate a move that renderBoard has just drawn.
// options.slide is false for drag-and-drop, where the piece is already
// where the user dropped it.
function animateMove(boardElement, move, options) {
  if (prefersReducedMotion()) return;

  if (move.captured) showCaptureEffect(boardElement, move);

  if (options.slide) {
    slidePiece(boardElement, move.from, move.to);
  }
  // When castling, the rook moves too, so slide it as well.
  if (move.castle) {
    const row = move.from.row;
    const rookFrom = move.castle === 'K' ? 7 : 0;
    const rookTo = move.castle === 'K' ? 5 : 3;
    slidePiece(boardElement, { row, col: rookFrom }, { row, col: rookTo });
  }
}

function slidePiece(boardElement, from, to) {
  const fromSquare = getSquareElement(boardElement, from.row, from.col);
  const toSquare = getSquareElement(boardElement, to.row, to.col);
  const piece = toSquare.querySelector('.piece');
  if (!piece) return;

  // Steps 1 and 3 of FLIP: how far is the start square from the end square?
  const start = fromSquare.getBoundingClientRect();
  const end = toSquare.getBoundingClientRect();
  const dx = start.left - end.left;
  const dy = start.top - end.top;

  // Steps 2 and 4: start shifted back by (dx, dy), animate to no shift.
  piece.classList.add('moving'); // draws it above the other pieces
  const animation = piece.animate(
    [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
    { duration: SLIDE_MS, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' } // fast start, soft landing
  );
  animation.onfinish = () => piece.classList.remove('moving');
}

// The captured piece no longer exists in the new position, so we draw a
// temporary copy of it ("ghost") that shrinks and fades away as the
// attacker arrives, then remove it.
function showCaptureEffect(boardElement, move) {
  // En passant: the captured pawn is beside the start square, not on the target.
  const row = move.enPassant ? move.from.row : move.to.row;
  const square = getSquareElement(boardElement, row, move.to.col);

  const ghost = createPieceElement(move.captured);
  ghost.classList.add('captured-ghost');
  square.appendChild(ghost);

  const animation = ghost.animate(
    [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.55)' }],
    { duration: 260, delay: SLIDE_MS * 0.4, easing: 'ease-out', fill: 'forwards' }
  );
  animation.onfinish = () => ghost.remove();
}

// ---------------------------------------------------------------------------
// Player bars (above and below the board)
// ---------------------------------------------------------------------------
// Each bar shows who plays that colour, the pieces they have captured, and
// how far ahead in material they are ("+3" = three pawns' worth).

// Material in simple "pawn points": pawn 1, knight 3, bishop 3, rook 5, queen 9.
function pawnPoints(type) {
  return Math.round(PIECE_VALUES[type] / 100);
}

function materialOnBoard(board, color) {
  let total = 0;
  for (const row of board) {
    for (const piece of row) {
      if (piece !== null && piece[0] === color) total += pawnPoints(piece[1]);
    }
  }
  return total;
}

// info = { name, detail, thinking }
function renderPlayerBar(barElement, game, color, info) {
  barElement.innerHTML = '';

  // A round badge showing the colour this player has.
  const avatar = document.createElement('span');
  avatar.className = 'avatar ' + (color === 'w' ? 'white' : 'black');
  avatar.textContent = PIECE_SYMBOLS.K;
  barElement.appendChild(avatar);

  const names = document.createElement('div');
  names.className = 'player-names';
  const name = document.createElement('span');
  name.className = 'player-name';
  name.textContent = info.name;
  const detail = document.createElement('span');
  detail.className = 'player-detail';
  detail.textContent = info.detail;
  names.append(name, detail);
  barElement.appendChild(names);

  // The enemy pieces this player has taken, most valuable first.
  const captured = game.history
    .filter(move => move.captured && move.piece[0] === color)
    .map(move => move.captured)
    .sort((a, b) => PIECE_VALUES[b[1]] - PIECE_VALUES[a[1]]);

  const capturedBox = document.createElement('div');
  capturedBox.className = 'captured';
  for (const piece of captured) {
    const span = document.createElement('span');
    span.className = 'captured-piece ' + (piece[0] === 'w' ? 'white' : 'black');
    span.textContent = PIECE_SYMBOLS[piece[1]];
    capturedBox.appendChild(span);
  }
  const lead = materialOnBoard(game.board, color) - materialOnBoard(game.board, opponent(color));
  if (lead > 0) {
    const leadLabel = document.createElement('span');
    leadLabel.className = 'material-lead';
    leadLabel.textContent = '+' + lead;
    capturedBox.appendChild(leadLabel);
  }
  barElement.appendChild(capturedBox);

  // Three pulsing dots while the computer is searching.
  if (info.thinking) {
    const thinking = document.createElement('span');
    thinking.className = 'thinking';
    thinking.innerHTML = 'Thinking <i></i><i></i><i></i>';
    barElement.appendChild(thinking);
  }
}

// ---------------------------------------------------------------------------
// Side panel
// ---------------------------------------------------------------------------

// Show whose turn it is, or how the game ended, from the human's point of view.
// `status` comes from getGameStatus() in rules.js.
function renderStatus(game, status, statusElement, view) {
  let text;
  if (status.result === 'checkmate') {
    text = status.winner === view.playerColor ? 'Checkmate, you win' : 'Checkmate, computer wins';
  } else if (status.result === 'stalemate') {
    text = 'Stalemate, it’s a draw';
  } else if (view.thinking) {
    text = 'Computer is thinking…';
  } else if (game.turn === view.playerColor) {
    text = status.result === 'check' ? 'Check! Your move' : 'Your move';
  } else {
    text = 'Computer to move';
  }

  statusElement.textContent = text;
  statusElement.classList.toggle('is-check', status.result === 'check' && !view.thinking);
  statusElement.classList.toggle('game-over', isGameOver(status));
}

// The evaluation bar: the light part is White's share, the dark part Black's.
// Math.tanh squashes any score into the range -1..1, so a small advantage
// moves the bar a little and a huge one fills it almost completely.
function renderEvaluation(game, fillElement, textElement) {
  const score = evaluate(game); // centipawns, positive = White is better
  const whiteShare = 50 + 50 * Math.tanh(score / 800);
  fillElement.style.width = whiteShare.toFixed(1) + '%';

  const pawns = score / 100;
  textElement.textContent = (pawns > 0 ? '+' : '') + pawns.toFixed(2);
}

// The move list, as numbered rows: "1.  e4  e5". `sanMoves` is a list of
// moves already written in chess notation (see notation.js).
function renderHistory(sanMoves, historyElement) {
  historyElement.innerHTML = '';

  if (sanMoves.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'moves-empty';
    empty.textContent = 'No moves yet';
    historyElement.appendChild(empty);
    return;
  }

  for (let i = 0; i < sanMoves.length; i += 2) {
    const row = document.createElement('li');
    row.className = 'move-row';

    const number = document.createElement('span');
    number.className = 'move-number';
    number.textContent = (i / 2 + 1) + '.';
    row.appendChild(number);

    // White's move (i) and Black's reply (i + 1), if there is one.
    for (const index of [i, i + 1]) {
      const cell = document.createElement('span');
      cell.className = 'move';
      if (index < sanMoves.length) cell.textContent = sanMoves[index];
      if (index === sanMoves.length - 1) cell.classList.add('current');
      row.appendChild(cell);
    }
    historyElement.appendChild(row);
  }

  // Keep the newest move visible when the list gets long.
  historyElement.scrollTop = historyElement.scrollHeight;
}

// The card shown over the board when the game ends.
// elements = { box, title, text }. `dismissed` is true after "View board".
function renderResult(status, playerColor, dismissed, elements) {
  const show = isGameOver(status) && !dismissed;
  elements.box.hidden = !show;
  if (!show) return;

  if (status.result === 'checkmate') {
    elements.title.textContent = 'Checkmate';
    elements.text.textContent = status.winner === playerColor ? 'You win. Well played!' : 'The computer wins this one.';
  } else {
    elements.title.textContent = 'Stalemate';
    elements.text.textContent = 'No legal moves, but no check: it’s a draw.';
  }
}

// ---------------------------------------------------------------------------
// Promotion popup
// ---------------------------------------------------------------------------
// Shows the four pieces a pawn can become. When the user picks one,
// `onChoose` is called with its letter ('Q', 'R', 'B' or 'N').
// Clicking outside the box cancels: `onChoose(null)`.
//
// The popup covers the whole page with a dark see-through layer (the
// "overlay"), which also stops clicks from reaching the board meanwhile.
function showPromotionPicker(color, onChoose) {
  const overlay = document.createElement('div');
  overlay.className = 'promotion-overlay';

  const box = document.createElement('div');
  box.className = 'promotion-box';

  const title = document.createElement('p');
  title.textContent = 'Promote to';
  box.appendChild(title);

  const choices = document.createElement('div');
  choices.className = 'promotion-choices';
  for (const type of PROMOTION_PIECES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'promotion-choice';
    button.appendChild(createPieceElement(color + type));
    button.addEventListener('click', () => {
      overlay.remove();
      onChoose(type);
    });
    choices.appendChild(button);
  }
  box.appendChild(choices);

  // A click on the dark layer itself (not on the box) cancels the move.
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      overlay.remove();
      onChoose(null);
    }
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}
