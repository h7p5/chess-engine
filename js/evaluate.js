// evaluate.js — how good is a position?
//
// The AI can't see to the end of the game, so after looking a few moves
// ahead it has to GUESS who is better in the position it reached. This file
// is that guess: one function, evaluate(game), that turns a position into a
// single number.
//
// =====================  THE SIGN RULE  =====================
//   A POSITIVE score means WHITE is better.
//   A NEGATIVE score means BLACK is better.
//   0 means equal.
// It does NOT matter whose turn it is: the score is always from White's
// point of view. In Stage 5, White will try to make the score as HIGH as
// possible (the "maximising" player) and Black as LOW as possible (the
// "minimising" player).
// ===========================================================
//
// Units: "centipawns" — 100 = one pawn. So +250 means "White is ahead by
// about two and a half pawns". Whole numbers keep the maths simple.
//
// The score has two parts:
//   1. Material:  which pieces each side has left.
//   2. Position:  how good the squares they stand on are.

// ---------------------------------------------------------------------------
// 1. Material
// ---------------------------------------------------------------------------
// The classic values, slightly tuned so that a bishop is worth a little more
// than a knight, and three minor pieces are not quite worth a queen.
// The king gets 0: both sides always have exactly one, so it would cancel
// out anyway. (Losing the king — checkmate — is handled by the search in
// Stage 5, not here.)
const PIECE_VALUES = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 0,
};

// ---------------------------------------------------------------------------
// 2. Piece-square tables
// ---------------------------------------------------------------------------
// A piece-square table gives a small bonus or penalty for each square a
// piece could stand on. For example, knights get +20 in the centre (where
// they attack 8 squares) and -50 in a corner (where they attack only 2).
//
// Each table is written FROM WHITE'S SIDE, laid out exactly like our board:
// the first line is rank 8 (row 0), the last line is rank 1 (row 7). So a
// white piece on board[row][col] simply reads TABLE[row][col].
//
// Black uses the SAME tables, flipped upside down: a black piece on row r
// reads row (7 - r). E.g. a black pawn about to promote (row 7) reads row 0
// — the same as a white pawn about to promote. This keeps both sides fair.
//
// The numbers come from the well-known "Simplified Evaluation Function" by
// Tomasz Michniewski (Chess Programming Wiki), a common starting point.

const PAWN_TABLE = [
  [  0,   0,   0,   0,   0,   0,   0,   0],
  [ 50,  50,  50,  50,  50,  50,  50,  50], // about to promote: very valuable
  [ 10,  10,  20,  30,  30,  20,  10,  10],
  [  5,   5,  10,  25,  25,  10,   5,   5],
  [  0,   0,   0,  20,  20,   0,   0,   0], // pawns on d4/e4 control the centre
  [  5,  -5, -10,   0,   0, -10,  -5,   5],
  [  5,  10,  10, -20, -20,  10,  10,   5], // d2/e2 pawns should advance
  [  0,   0,   0,   0,   0,   0,   0,   0],
];

const KNIGHT_TABLE = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20,   0,   0,   0,   0, -20, -40],
  [-30,   0,  10,  15,  15,  10,   0, -30],
  [-30,   5,  15,  20,  20,  15,   5, -30],
  [-30,   0,  15,  20,  20,  15,   0, -30],
  [-30,   5,  10,  15,  15,  10,   5, -30],
  [-40, -20,   0,   5,   5,   0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50], // "a knight on the rim is dim"
];

const BISHOP_TABLE = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10,   0,   0,   0,   0,   0,   0, -10],
  [-10,   0,   5,  10,  10,   5,   0, -10],
  [-10,   5,   5,  10,  10,   5,   5, -10],
  [-10,   0,  10,  10,  10,  10,   0, -10],
  [-10,  10,  10,  10,  10,  10,  10, -10],
  [-10,   5,   0,   0,   0,   0,   5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20],
];

const ROOK_TABLE = [
  [  0,   0,   0,   0,   0,   0,   0,   0],
  [  5,  10,  10,  10,  10,  10,  10,   5], // a rook on the 7th rank is strong
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [ -5,   0,   0,   0,   0,   0,   0,  -5],
  [  0,   0,   0,   5,   5,   0,   0,   0],
];

const QUEEN_TABLE = [
  [-20, -10, -10,  -5,  -5, -10, -10, -20],
  [-10,   0,   0,   0,   0,   0,   0, -10],
  [-10,   0,   5,   5,   5,   5,   0, -10],
  [ -5,   0,   5,   5,   5,   5,   0,  -5],
  [  0,   0,   5,   5,   5,   5,   0,  -5],
  [-10,   5,   5,   5,   5,   5,   0, -10],
  [-10,   0,   5,   0,   0,   0,   0, -10],
  [-20, -10, -10,  -5,  -5, -10, -10, -20],
];

// The king needs TWO tables, because its job changes during the game:
//  - Middlegame: with queens and rooks around, the king should hide behind
//    its pawns, ideally after castling (g1/b1 get +30).
//  - Endgame: with few pieces left, the king is safe enough to walk to the
//    centre and help, so the centre gets the bonus instead.
const KING_MIDDLEGAME_TABLE = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [ 20,  20,   0,   0,   0,   0,  20,  20],
  [ 20,  30,  10,   0,   0,  10,  30,  20], // castled king is safe
];

const KING_ENDGAME_TABLE = [
  [-50, -40, -30, -20, -20, -30, -40, -50],
  [-30, -20, -10,   0,   0, -10, -20, -30],
  [-30, -10,  20,  30,  30,  20, -10, -30],
  [-30, -10,  30,  40,  40,  30, -10, -30], // active king in the centre
  [-30, -10,  30,  40,  40,  30, -10, -30],
  [-30, -10,  20,  30,  30,  20, -10, -30],
  [-30, -30,   0,   0,   0,   0, -30, -30],
  [-50, -30, -30, -30, -30, -30, -30, -50],
];

// Which table each piece type uses. (The king is chosen separately.)
const PIECE_TABLES = {
  P: PAWN_TABLE,
  N: KNIGHT_TABLE,
  B: BISHOP_TABLE,
  R: ROOK_TABLE,
  Q: QUEEN_TABLE,
};

// ---------------------------------------------------------------------------
// Endgame detection
// ---------------------------------------------------------------------------
// A simple rule: it's the endgame once EACH side has at most 1300 points of
// pieces left, not counting pawns and the king. 1300 is about a queen plus
// a minor piece, or two rooks. At the start, each side has 3200.
const ENDGAME_LIMIT = 1300;

function isEndgame(board) {
  const pieceMaterial = { w: 0, b: 0 };
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece !== null && piece[1] !== 'P' && piece[1] !== 'K') {
        pieceMaterial[piece[0]] += PIECE_VALUES[piece[1]];
      }
    }
  }
  return pieceMaterial.w <= ENDGAME_LIMIT && pieceMaterial.b <= ENDGAME_LIMIT;
}

// ---------------------------------------------------------------------------
// The evaluation function
// ---------------------------------------------------------------------------
// Visit all 64 squares. For each piece, add up (material + square bonus).
// White's pieces are ADDED, Black's are SUBTRACTED. That is all it takes to
// make "positive = good for White".

function evaluate(game) {
  const board = game.board;
  const kingTable = isEndgame(board) ? KING_ENDGAME_TABLE : KING_MIDDLEGAME_TABLE;
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece === null) continue;

      const color = piece[0];
      const type = piece[1];
      const table = type === 'K' ? kingTable : PIECE_TABLES[type];

      // White reads the table as written; Black reads it upside down.
      const tableRow = color === 'w' ? row : 7 - row;
      const value = PIECE_VALUES[type] + table[tableRow][col];

      if (color === 'w') {
        score += value;
      } else {
        score -= value;
      }
    }
  }

  return score;
}
