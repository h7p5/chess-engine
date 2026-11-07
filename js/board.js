// board.js — how the chess game is stored in memory.
//
// This file has NO drawing code. It only describes the game as data.
// Keeping data separate from drawing is important: later, the AI will
// "imagine" thousands of positions using this data without ever drawing them.

// ---------------------------------------------------------------------------
// How a piece is written
// ---------------------------------------------------------------------------
// Every piece is a 2-letter string: first its colour, then its type.
//   colour: 'w' = white, 'b' = black
//   type:   'K' king, 'Q' queen, 'R' rook, 'B' bishop, 'N' knight, 'P' pawn
// Examples: 'wK' = white king, 'bN' = black knight.
// An empty square is null.
//
// So piece[0] gives the colour and piece[1] gives the type.

// The symbol we draw for each piece type. We use the "filled" chess symbols
// for both colours and paint them white or black with CSS.
// '︎' is an invisible character that tells phones "show this as text,
// not as an emoji" (some phones otherwise turn ♟ into a coloured emoji).
const PIECE_SYMBOLS = {
  K: '♚︎',
  Q: '♛︎',
  R: '♜︎',
  B: '♝︎',
  N: '♞︎',
  P: '♟︎',
};

// Column letters, used to turn a position like (row 7, col 4) into "e1".
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

// ---------------------------------------------------------------------------
// The board: an 8x8 grid
// ---------------------------------------------------------------------------
// The board is an array of 8 rows; each row is an array of 8 squares.
// We read it like the board on screen, from White's side:
//   board[0] is the TOP row    = rank 8 (Black's back row)
//   board[7] is the BOTTOM row = rank 1 (White's back row)
//   board[row][0] is the a-file, board[row][7] is the h-file
//
// Example: the white king starts on e1, which is board[7][4].

function createInitialBoard() {
  // The order of the back-row pieces, from the a-file to the h-file.
  const backRow = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

  const board = [];
  for (let row = 0; row < 8; row++) {
    const rowSquares = [];
    for (let col = 0; col < 8; col++) {
      let piece = null; // empty unless one of the rules below applies

      if (row === 0) piece = 'b' + backRow[col]; // rank 8: black pieces
      if (row === 1) piece = 'bP';               // rank 7: black pawns
      if (row === 6) piece = 'wP';               // rank 2: white pawns
      if (row === 7) piece = 'w' + backRow[col]; // rank 1: white pieces

      rowSquares.push(piece);
    }
    board.push(rowSquares);
  }
  return board;
}

// ---------------------------------------------------------------------------
// The full game state
// ---------------------------------------------------------------------------
// The board alone is not enough to know everything about a chess position.
// For example, you can't tell from the board whether a king has moved
// before (which matters for castling). So we keep a few extra facts too.
// Some fields are only used in later stages; they are created now so the
// shape of the game state does not have to change later.

function createGame() {
  return {
    board: createInitialBoard(),
    turn: 'w', // whose move it is: 'w' or 'b'

    // Castling is allowed only while the king and that rook have never moved.
    // (Used in Stage 3.)
    castling: { wK: true, wQ: true, bK: true, bQ: true },

    // If a pawn just moved two squares, this holds the square it jumped
    // over, e.g. { row: 5, col: 4 }. Otherwise null. (Used in Stage 3.)
    enPassant: null,

    // A list of every move played so far. (Used in Stages 2 and 6.)
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Loading any position from text (FEN)
// ---------------------------------------------------------------------------
// FEN ("Forsyth–Edwards Notation") is the standard way to write a whole chess
// position as one line of text. The starting position is:
//   rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
// It has space-separated parts:
//   1. The board, rank 8 first, ranks separated by '/'. A letter is a piece
//      (UPPERCASE = White, lowercase = Black); a digit means that many
//      empty squares.
//   2. Whose turn it is: 'w' or 'b'.
//   3. Castling rights: any of 'KQkq' (K = White kingside, q = Black
//      queenside...), or '-' for none.
//   4. The en passant square, e.g. 'e3', or '-'.
//   (Parts 5 and 6 are move counters; we don't need them.)
// We use this in the tests to set up tricky positions directly.

function createGameFromFEN(fen) {
  const [placement, turn, castling, enPassant] = fen.split(' ');

  // Part 1: the ranks are already in our row order (rank 8 = row 0).
  const board = placement.split('/').map(rankText => {
    const row = [];
    for (const ch of rankText) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        row.push(color + ch.toUpperCase());
      }
    }
    return row;
  });

  return {
    board: board,
    turn: turn,
    castling: {
      wK: castling.includes('K'),
      wQ: castling.includes('Q'),
      bK: castling.includes('k'),
      bQ: castling.includes('q'),
    },
    // 'e3' -> column of 'e', row of rank 3.
    enPassant: enPassant === '-'
      ? null
      : { row: 8 - Number(enPassant[1]), col: FILES.indexOf(enPassant[0]) },
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Turn grid coordinates into a chess square name: (7, 4) -> "e1".
// Row 0 is rank 8, so the rank number is 8 - row.
function squareName(row, col) {
  return FILES[col] + (8 - row);
}
