// notation.js — writing moves the way chess players do.
//
// "Standard Algebraic Notation" (SAN) is the short form used in books and
// on every chess website:
//   Nf3      knight moves to f3            (pawns have no letter: e4)
//   Bxe5     bishop captures on e5         (a pawn capture names its file: exd5)
//   O-O      castles kingside              (O-O-O = queenside)
//   e8=Q     pawn promotes to a queen
//   +  / #   the move gives check / checkmate
//
// This file only READS the rules (it asks rules.js which moves are legal);
// it never changes how the game is played.

// Write `move` in SAN. `game` is the position BEFORE the move is played.
function moveToSAN(game, move) {
  let san;

  if (move.castle) {
    san = move.castle === 'K' ? 'O-O' : 'O-O-O';
  } else {
    const type = move.piece[1];
    const destination = squareName(move.to.row, move.to.col);

    if (type === 'P') {
      // Pawn captures start with the file the pawn came from: "exd5".
      const capture = move.captured ? FILES[move.from.col] + 'x' : '';
      const promotion = move.promotion ? '=' + move.promotion : '';
      san = capture + destination + promotion;
    } else {
      san = type + disambiguation(game, move) + (move.captured ? 'x' : '') + destination;
    }
  }

  // Add + or # by looking at the position after the move.
  const result = getGameStatus(applyMove(game, move)).result;
  if (result === 'checkmate') san += '#';
  else if (result === 'check') san += '+';

  return san;
}

// When two pieces of the same kind could move to the same square, SAN adds
// just enough to tell them apart:
//   the start FILE if that is enough   (Nbd2: the knight from the b-file)
//   otherwise the start RANK           (R1e2: the rook from rank 1)
//   otherwise both                     (Qh4e1, rare, needs three queens)
function disambiguation(game, move) {
  const rivals = generateLegalMoves(game).filter(other =>
    other.piece === move.piece &&
    other.to.row === move.to.row && other.to.col === move.to.col &&
    !(other.from.row === move.from.row && other.from.col === move.from.col));

  if (rivals.length === 0) return '';

  const sameFile = rivals.some(other => other.from.col === move.from.col);
  const sameRank = rivals.some(other => other.from.row === move.from.row);

  if (!sameFile) return FILES[move.from.col];
  if (!sameRank) return String(8 - move.from.row);
  return squareName(move.from.row, move.from.col);
}
