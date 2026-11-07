// rules.js — the rules of chess.
//
// Like board.js, this file only works with DATA. It never draws anything.
//
// Moves are found in two steps:
//  1. "Pseudo-legal" moves: moves that follow each piece's movement pattern.
//  2. "Legal" moves: the pseudo-legal moves that do NOT leave your own king
//     in check. (See generateLegalMoves near the bottom.)

// ---------------------------------------------------------------------------
// Directions
// ---------------------------------------------------------------------------
// A direction is a pair [rowChange, colChange].
// Remember: row 0 is the TOP of the board (rank 8), so
//   [-1, 0] = one square up (towards Black's side)
//   [ 1, 0] = one square down (towards White's side)
//   [ 0, 1] = one square right, [0, -1] = one square left

const ROOK_DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];       // straight lines
const BISHOP_DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];   // diagonals
const QUEEN_DIRECTIONS = ROOK_DIRECTIONS.concat(BISHOP_DIRECTIONS); // both

// The king moves one step in any of the queen's 8 directions.
const KING_STEPS = QUEEN_DIRECTIONS;

// The 8 "L-shaped" jumps of a knight: 2 squares one way, 1 square the other.
const KNIGHT_JUMPS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];

// The pieces a pawn can turn into when it reaches the last row.
const PROMOTION_PIECES = ['Q', 'R', 'B', 'N'];

// ---------------------------------------------------------------------------
// The shape of a move
// ---------------------------------------------------------------------------
// A move is a small object:
//   from, to   — {row, col} of the start and end squares
//   piece      — the piece that moves, e.g. 'wN'
//   captured   — the piece it takes, or null
//   promotion  — for a pawn reaching the last row: 'Q', 'R', 'B' or 'N'
//   castle     — 'K' (kingside) or 'Q' (queenside) when castling
//   enPassant  — true for an en passant capture
// Every move has all the fields (most are null/false), so the rest of the
// code never has to wonder whether a field exists.

function createMove(board, fromRow, fromCol, toRow, toCol) {
  return {
    from: { row: fromRow, col: fromCol },
    to: { row: toRow, col: toCol },
    piece: board[fromRow][fromCol],
    captured: board[toRow][toCol], // null if the target square is empty
    promotion: null,
    castle: null,
    enPassant: false,
  };
}

// Is (row, col) inside the 8x8 board?
function isOnBoard(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function opponent(color) {
  return color === 'w' ? 'b' : 'w';
}

// ---------------------------------------------------------------------------
// Is a square attacked?
// ---------------------------------------------------------------------------
// This answers: "could a piece of colour `byColor` capture on (row, col)?"
// It is the heart of check detection: a king is in check when its square
// is attacked.
//
// Trick: instead of generating every enemy move and seeing if one lands on
// the square, we look OUTWARD from the square, pretending to be each kind of
// piece. If a knight standing here could jump to an enemy knight, then that
// enemy knight can jump here too. The same works for every piece, because
// all moves are symmetric — except pawns, which only attack forwards.

function isSquareAttacked(board, row, col, byColor) {
  // Pawns. A white pawn attacks diagonally UP the board, so a white pawn
  // attacking (row, col) must stand one row BELOW it (row + 1).
  // A black pawn attacks downwards, so it stands one row above (row - 1).
  const pawnRow = byColor === 'w' ? row + 1 : row - 1;
  for (const dCol of [-1, 1]) {
    const c = col + dCol;
    if (isOnBoard(pawnRow, c) && board[pawnRow][c] === byColor + 'P') return true;
  }

  // Knights: look one knight-jump away in every direction.
  for (const [dRow, dCol] of KNIGHT_JUMPS) {
    const r = row + dRow;
    const c = col + dCol;
    if (isOnBoard(r, c) && board[r][c] === byColor + 'N') return true;
  }

  // King: look one step away in every direction. (Needed so that the two
  // kings can never stand next to each other.)
  for (const [dRow, dCol] of KING_STEPS) {
    const r = row + dRow;
    const c = col + dCol;
    if (isOnBoard(r, c) && board[r][c] === byColor + 'K') return true;
  }

  // Sliding pieces: walk along each line until we hit a piece. Along a
  // straight line, the first piece we hit attacks us if it's an enemy rook
  // or queen. Along a diagonal, if it's an enemy bishop or queen.
  if (slidingAttack(board, row, col, ROOK_DIRECTIONS, byColor + 'R', byColor + 'Q')) return true;
  if (slidingAttack(board, row, col, BISHOP_DIRECTIONS, byColor + 'B', byColor + 'Q')) return true;

  return false;
}

// Helper for isSquareAttacked: is the first piece along any of `directions`
// one of the two given attackers?
function slidingAttack(board, row, col, directions, attackerA, attackerB) {
  for (const [dRow, dCol] of directions) {
    let r = row + dRow;
    let c = col + dCol;
    while (isOnBoard(r, c)) {
      const piece = board[r][c];
      if (piece !== null) {
        if (piece === attackerA || piece === attackerB) return true;
        break; // any other piece blocks the line
      }
      r += dRow;
      c += dCol;
    }
  }
  return false;
}

// Find where the king of `color` is standing.
function findKing(board, color) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (board[row][col] === color + 'K') return { row, col };
    }
  }
  return null;
}

// Is the king of `color` in check right now?
function isInCheck(game, color) {
  const king = findKing(game.board, color);
  return isSquareAttacked(game.board, king.row, king.col, opponent(color));
}

// ---------------------------------------------------------------------------
// Moves for each kind of piece (pseudo-legal)
// ---------------------------------------------------------------------------
// Each function below ADDS moves to the `moves` array it is given, instead of
// returning a new array. That way one array can collect the moves of all pieces.

// "Sliding" pieces (rook, bishop, queen) travel in a direction until they
// hit the edge of the board or another piece.
function addSlidingMoves(board, row, col, directions, moves) {
  const color = board[row][col][0];

  for (const [dRow, dCol] of directions) {
    let r = row + dRow;
    let c = col + dCol;

    while (isOnBoard(r, c)) {
      const target = board[r][c];

      if (target === null) {
        // Empty square: we can move here, and keep sliding further.
        moves.push(createMove(board, row, col, r, c));
      } else {
        // A piece is in the way. If it's an enemy we can capture it,
        // but either way we can't slide past it.
        if (target[0] !== color) {
          moves.push(createMove(board, row, col, r, c));
        }
        break;
      }

      r += dRow;
      c += dCol;
    }
  }
}

// "Stepping" pieces (knight, king) jump to fixed squares around them.
// They can't be blocked; the only question is what's on the target square.
function addStepMoves(board, row, col, offsets, moves) {
  const color = board[row][col][0];

  for (const [dRow, dCol] of offsets) {
    const r = row + dRow;
    const c = col + dCol;
    if (!isOnBoard(r, c)) continue;

    const target = board[r][c];
    // We can go there if it's empty or holds an enemy piece.
    if (target === null || target[0] !== color) {
      moves.push(createMove(board, row, col, r, c));
    }
  }
}

// Pawns are the most unusual piece:
//  - they only move forward, and "forward" depends on their colour
//  - they move straight but capture diagonally
//  - they may move two squares on their very first move
//  - they can capture "en passant"
//  - they promote when they reach the last row
function addPawnMoves(game, row, col, moves) {
  const board = game.board;
  const color = board[row][col][0];

  // White pawns go UP the board (row gets smaller), black pawns go DOWN.
  const forward = color === 'w' ? -1 : 1;
  // The row where this colour's pawns start (rank 2 for White, rank 7 for Black).
  const startRow = color === 'w' ? 6 : 1;

  // 1) One square forward, only if that square is empty.
  const oneStep = row + forward;
  if (isOnBoard(oneStep, col) && board[oneStep][col] === null) {
    addPawnMove(board, row, col, oneStep, col, moves);

    // 2) Two squares forward: only from the start row, and both squares
    //    must be empty. (Checked inside the first `if`, because if the first
    //    square is blocked the pawn can't jump over it.)
    const twoStep = row + 2 * forward;
    if (row === startRow && board[twoStep][col] === null) {
      moves.push(createMove(board, row, col, twoStep, col));
    }
  }

  // 3) Diagonal captures: one square forward-left and forward-right.
  for (const dCol of [-1, 1]) {
    const r = row + forward;
    const c = col + dCol;
    if (!isOnBoard(r, c)) continue;

    const target = board[r][c];
    if (target !== null && target[0] !== color) {
      // A normal capture of an enemy piece.
      addPawnMove(board, row, col, r, c, moves);
    } else if (game.enPassant && game.enPassant.row === r && game.enPassant.col === c) {
      // 4) En passant. If the enemy pawn beside us just jumped two squares,
      //    we may capture it as if it had moved only one: we move diagonally
      //    onto the square it jumped over, and the enemy pawn (which is on
      //    OUR row, next to us) is removed.
      const move = createMove(board, row, col, r, c);
      move.enPassant = true;
      move.captured = board[row][c]; // the pawn beside us, not the empty target square
      moves.push(move);
    }
  }
}

// Add one pawn move — or FOUR moves if the pawn reaches the last row, one for
// each piece it could promote to. Treating each promotion choice as its own
// move means the AI can consider all of them, and perft counts them correctly.
function addPawnMove(board, fromRow, fromCol, toRow, toCol, moves) {
  const lastRow = board[fromRow][fromCol][0] === 'w' ? 0 : 7;

  if (toRow === lastRow) {
    for (const type of PROMOTION_PIECES) {
      const move = createMove(board, fromRow, fromCol, toRow, toCol);
      move.promotion = type;
      moves.push(move);
    }
  } else {
    moves.push(createMove(board, fromRow, fromCol, toRow, toCol));
  }
}

// Castling: the king moves two squares towards a rook, and the rook jumps
// over to the square the king passed. It is allowed only if:
//  - neither the king nor that rook has moved yet (tracked in game.castling)
//  - every square between them is empty
//  - the king is not in check, and does not pass through or land on an
//    attacked square
function addCastlingMoves(game, row, col, moves) {
  const board = game.board;
  const color = board[row][col][0];
  const enemy = opponent(color);
  const homeRow = color === 'w' ? 7 : 0;

  // The king must be on its starting square (e1 / e8) and not in check.
  if (row !== homeRow || col !== 4) return;
  if (isSquareAttacked(board, row, 4, enemy)) return;

  // Kingside (O-O): king e -> g, rook h -> f. Squares f and g must be empty
  // and safe.
  if (game.castling[color + 'K'] &&
      board[row][7] === color + 'R' &&
      board[row][5] === null && board[row][6] === null &&
      !isSquareAttacked(board, row, 5, enemy) &&
      !isSquareAttacked(board, row, 6, enemy)) {
    const move = createMove(board, row, 4, row, 6);
    move.castle = 'K';
    moves.push(move);
  }

  // Queenside (O-O-O): king e -> c, rook a -> d. Squares b, c and d must be
  // empty, but only c and d must be safe: the king never touches b, only the
  // rook passes over it.
  if (game.castling[color + 'Q'] &&
      board[row][0] === color + 'R' &&
      board[row][1] === null && board[row][2] === null && board[row][3] === null &&
      !isSquareAttacked(board, row, 3, enemy) &&
      !isSquareAttacked(board, row, 2, enemy)) {
    const move = createMove(board, row, 4, row, 2);
    move.castle = 'Q';
    moves.push(move);
  }
}

// ---------------------------------------------------------------------------
// Collecting pseudo-legal moves
// ---------------------------------------------------------------------------

// All pseudo-legal moves for the piece standing on (row, col).
function generatePieceMoves(game, row, col) {
  const board = game.board;
  const piece = board[row][col];
  const moves = [];
  if (piece === null) return moves;

  // piece[1] is the type letter. A `switch` picks the right rule for it.
  switch (piece[1]) {
    case 'P': addPawnMoves(game, row, col, moves); break;
    case 'N': addStepMoves(board, row, col, KNIGHT_JUMPS, moves); break;
    case 'B': addSlidingMoves(board, row, col, BISHOP_DIRECTIONS, moves); break;
    case 'R': addSlidingMoves(board, row, col, ROOK_DIRECTIONS, moves); break;
    case 'Q': addSlidingMoves(board, row, col, QUEEN_DIRECTIONS, moves); break;
    case 'K':
      addStepMoves(board, row, col, KING_STEPS, moves);
      addCastlingMoves(game, row, col, moves);
      break;
  }
  return moves;
}

// All pseudo-legal moves for the side whose turn it is.
function generatePseudoLegalMoves(game) {
  const moves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board[row][col];
      // Only look at pieces belonging to the player whose turn it is.
      if (piece !== null && piece[0] === game.turn) {
        moves.push(...generatePieceMoves(game, row, col));
      }
    }
  }
  return moves;
}

// ---------------------------------------------------------------------------
// Legal moves
// ---------------------------------------------------------------------------
// A move is legal if, AFTER playing it, the mover's own king is not attacked.
//
// The simplest correct way to check this: actually play the move (on a copy,
// thanks to copy-make) and look. This one test covers every case at once:
//  - moving a piece that was shielding the king ("pinned" pieces)
//  - moving the king onto an attacked square
//  - ignoring a check that is already on the board
//  - the rare en passant capture that uncovers an attack along a row

function isLegalMove(game, move) {
  const next = applyMove(game, move);
  const moverColor = move.piece[0];
  return !isInCheck(next, moverColor);
}

// All legal moves for the side to move. The AI will use this.
function generateLegalMoves(game) {
  return generatePseudoLegalMoves(game).filter(move => isLegalMove(game, move));
}

// Legal moves for one piece. The board uses this to show the dots.
function generateLegalPieceMoves(game, row, col) {
  return generatePieceMoves(game, row, col).filter(move => isLegalMove(game, move));
}

// Does the side to move have AT LEAST ONE legal move?
// Same answer as generateLegalMoves(game).length > 0, but it stops as soon
// as it finds one, which is usually almost immediately. The AI asks this
// question thousands of times, so the shortcut matters.
function hasLegalMove(game) {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = game.board[row][col];
      if (piece === null || piece[0] !== game.turn) continue;
      for (const move of generatePieceMoves(game, row, col)) {
        if (isLegalMove(game, move)) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Game status: check, checkmate, stalemate
// ---------------------------------------------------------------------------
// Two questions decide everything:
//   Is the side to move in check?   Does it have any legal move?
//
//                 has a legal move     no legal moves
//   in check      "check"              "checkmate" (the other side wins)
//   not in check  "playing"            "stalemate" (a draw)

function getGameStatus(game) {
  const inCheck = isInCheck(game, game.turn);
  const hasMoves = hasLegalMove(game);

  if (!hasMoves) {
    if (inCheck) return { result: 'checkmate', winner: opponent(game.turn) };
    return { result: 'stalemate', winner: null };
  }
  return { result: inCheck ? 'check' : 'playing', winner: null };
}

function isGameOver(status) {
  return status.result === 'checkmate' || status.result === 'stalemate';
}

// ---------------------------------------------------------------------------
// Making a move
// ---------------------------------------------------------------------------
// applyMove does NOT change the game it is given. It returns a brand-new game
// with the move played. This is called "copy-make".
//
// Why copy instead of changing the board in place? The AI will try a move,
// look at the result, and then try a different move from the SAME starting
// position. If we had changed the original, we would have to carefully undo
// every move. Copying is a little slower but much harder to get wrong.

// The four corner squares where rooks start, and the castling right each
// one belongs to.
const ROOK_CORNERS = [
  { row: 7, col: 7, right: 'wK' }, // h1
  { row: 7, col: 0, right: 'wQ' }, // a1
  { row: 0, col: 7, right: 'bK' }, // h8
  { row: 0, col: 0, right: 'bQ' }, // a8
];

function applyMove(game, move) {
  // Copy each row. (Copying only the outer array would leave both games
  // sharing the same row arrays, so changing one would change the other.)
  const board = game.board.map(row => row.slice());
  const color = move.piece[0];

  // Move the piece. A promoting pawn arrives as the new piece instead.
  board[move.to.row][move.to.col] = move.promotion ? color + move.promotion : move.piece;
  board[move.from.row][move.from.col] = null;

  // En passant: the captured pawn is not on the target square but beside
  // the start square (same row we started on, column we moved to).
  if (move.enPassant) {
    board[move.from.row][move.to.col] = null;
  }

  // Castling: the king has already moved two squares; now move the rook too.
  if (move.castle === 'K') {
    board[move.from.row][5] = board[move.from.row][7]; // rook h -> f
    board[move.from.row][7] = null;
  } else if (move.castle === 'Q') {
    board[move.from.row][3] = board[move.from.row][0]; // rook a -> d
    board[move.from.row][0] = null;
  }

  // Update castling rights. Once lost, a right never comes back.
  const castling = { ...game.castling };
  if (move.piece[1] === 'K') {
    // The king moved: no more castling on either side.
    castling[color + 'K'] = false;
    castling[color + 'Q'] = false;
  }
  for (const corner of ROOK_CORNERS) {
    // If anything moves FROM a corner, that rook has moved.
    // If anything moves TO a corner, that rook has been captured.
    const touched =
      (move.from.row === corner.row && move.from.col === corner.col) ||
      (move.to.row === corner.row && move.to.col === corner.col);
    if (touched) castling[corner.right] = false;
  }

  // En passant square: only set right after a pawn jumps two squares.
  // It's the square the pawn jumped over (halfway between start and end).
  let enPassant = null;
  if (move.piece[1] === 'P' && Math.abs(move.to.row - move.from.row) === 2) {
    enPassant = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
  }

  return {
    board: board,
    turn: opponent(game.turn), // the other player moves next
    castling: castling,
    enPassant: enPassant,
    history: game.history.concat([move]),
  };
}

// Write a move as text for the move list, e.g. "Ng1-f3", "e4xd5",
// "e7-e8=Q", or "O-O" for castling.
// This is "long algebraic notation": the piece letter (none for pawns),
// the start square, '-' for a move or 'x' for a capture, then the end square.
function moveToText(move) {
  if (move.castle === 'K') return 'O-O';
  if (move.castle === 'Q') return 'O-O-O';

  const type = move.piece[1];
  const pieceLetter = type === 'P' ? '' : type;
  const separator = move.captured ? 'x' : '-';
  const promotion = move.promotion ? '=' + move.promotion : '';
  return pieceLetter +
    squareName(move.from.row, move.from.col) +
    separator +
    squareName(move.to.row, move.to.col) +
    promotion;
}
