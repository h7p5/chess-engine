// ai.js — the computer opponent: minimax search with alpha-beta pruning.
//
// The idea in one sentence: try every move, then every reply, then every
// reply to that... down to a fixed depth; score the positions at the
// bottom with evaluate(); and pass the scores back up, assuming each side
// always picks the move that is best FOR ITSELF.
//
// Remember the sign rule from evaluate.js:
//   positive = good for White, negative = good for Black.
// So White picks the HIGHEST score (White "maximises") and Black picks the
// LOWEST score (Black "minimises").

// ---------------------------------------------------------------------------
// Scores for the end of the game
// ---------------------------------------------------------------------------
// Checkmate is worth far more than any material (a queen is only 900).
// We subtract the "ply" (how many half-moves from now the mate happens), so
// a mate in 1 scores 99,999 and a mate in 3 scores 99,997. That makes the
// AI prefer the QUICKEST mate when winning, and the SLOWEST mate when losing
// (it keeps fighting, hoping you make a mistake).
const MATE_SCORE = 100000;

// The score of a position where the side to move has no legal moves.
function noMovesScore(game, ply) {
  if (!isInCheck(game, game.turn)) {
    return 0; // stalemate: a draw
  }
  // Checkmate: the side to move has LOST.
  // White lost -> very negative. Black lost -> very positive.
  return game.turn === 'w' ? -(MATE_SCORE - ply) : (MATE_SCORE - ply);
}

// Counts how many positions the search visited (for the stats display).
let nodeCount = 0;

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning
// ---------------------------------------------------------------------------
// minimax(game, depth, alpha, beta, ply) returns the score of `game`,
// looking `depth` more half-moves ahead.
//
//   alpha = the best score WHITE is already guaranteed somewhere else in the
//           search. White will never accept less than this.
//   beta  = the best score BLACK is already guaranteed somewhere else.
//           Black will never allow more than this.
//   ply   = how many half-moves we are below the real position (for mate
//           distance).
//
// If alpha ever reaches beta, this position can't affect the final choice:
// one of the players would simply avoid coming here. So we stop searching
// it. That early stop is the "pruning" (cutting off a branch of the tree).

function minimax(game, depth, alpha, beta, ply) {
  nodeCount++;

  // Bottom of the search: score the position as it stands. First make sure
  // the game isn't already over here (otherwise a checkmate at the very
  // bottom would just be scored by material).
  if (depth === 0) {
    if (!hasLegalMove(game)) return noMovesScore(game, ply);
    return evaluate(game);
  }

  const moves = generateLegalMoves(game);
  if (moves.length === 0) return noMovesScore(game, ply);

  orderMoves(moves);

  if (game.turn === 'w') {
    // White to move: pick the move with the HIGHEST score.
    let best = -Infinity;
    for (const move of moves) {
      const score = minimax(applyMove(game, move), depth - 1, alpha, beta, ply + 1);
      best = Math.max(best, score);
      alpha = Math.max(alpha, best); // White's guarantee may have improved
      if (alpha >= beta) break;      // Black would never allow this: prune
    }
    return best;
  } else {
    // Black to move: pick the move with the LOWEST score.
    let best = Infinity;
    for (const move of moves) {
      const score = minimax(applyMove(game, move), depth - 1, alpha, beta, ply + 1);
      best = Math.min(best, score);
      beta = Math.min(beta, best);   // Black's guarantee may have improved
      if (alpha >= beta) break;      // White would never allow this: prune
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Move ordering
// ---------------------------------------------------------------------------
// Alpha-beta prunes most when it looks at the BEST moves first: a strong
// move found early sets a high bar (alpha or beta), and then weaker moves
// get cut off quickly. We can't know the best move in advance, but captures
// are a very good guess.
//
// "MVV-LVA" = Most Valuable Victim, Least Valuable Attacker:
// taking a queen with a pawn (10*900 - 100) is tried before taking a pawn
// with a queen (10*100 - 900). Promotions are also tried early.
// Quiet (non-capturing) moves score 0 and come last.

function moveOrderScore(move) {
  let score = 0;
  if (move.captured) {
    score += 10 * PIECE_VALUES[move.captured[1]] - PIECE_VALUES[move.piece[1]];
  }
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion];
  }
  return score;
}

// Sort the moves in place, highest order score first.
function orderMoves(moves) {
  moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
}

// Shuffle an array in place (Fisher–Yates shuffle).
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ---------------------------------------------------------------------------
// Choosing a move (the "root" of the search)
// ---------------------------------------------------------------------------
// This is the top level: it tries every move in the real position and keeps
// the best one. (minimax only returns SCORES; this function remembers which
// MOVE gave the best score.)

function findBestMove(game, depth) {
  const start = Date.now();
  nodeCount = 0;

  // The search never needs the move history, and copying it in every
  // applyMove would waste time, so we search on a copy without it.
  const searchGame = { ...game, history: [] };

  const moves = generateLegalMoves(searchGame);

  // Shuffle first, then sort by order score. Captures still come first,
  // but moves with equal scores end up in random order, so when several
  // moves are equally good the AI picks a different one each game instead
  // of always playing the same opening. (JavaScript's sort keeps the order
  // of items that compare equal, so the shuffle survives the sort.)
  shuffle(moves);
  orderMoves(moves);

  const maximising = searchGame.turn === 'w';
  let bestMove = moves[0];
  let bestScore = maximising ? -Infinity : Infinity;
  let alpha = -Infinity;
  let beta = Infinity;

  for (const move of moves) {
    const score = minimax(applyMove(searchGame, move), depth - 1, alpha, beta, 1);

    // Only a STRICTLY better score replaces the best move found so far.
    if (maximising ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
    if (maximising) alpha = Math.max(alpha, bestScore);
    else beta = Math.min(beta, bestScore);
  }

  return {
    move: bestMove,
    score: bestScore,
    depth: depth,
    nodes: nodeCount,
    ms: Date.now() - start,
  };
}
