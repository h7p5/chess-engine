// perft.js — a correctness test for move generation.
//
// "Perft" (PERFormance Test) counts every possible sequence of legal moves
// up to a certain depth. For example, from the starting position:
//   depth 1: White has 20 moves                              ->       20
//   depth 2: each of those, followed by each Black reply     ->      400
//   depth 3:                                                 ->    8,902
//   depth 4:                                                 ->  197,281
// These numbers are known exactly (other engines have checked them for
// decades). If our counts match, our move generator is almost certainly
// right. If a single rule is wrong anywhere — a missing en passant, a
// castling through check — the count comes out different.

function perft(game, depth) {
  if (depth === 0) return 1;

  const moves = generateLegalMoves(game);

  // Shortcut: at the last level we only need to COUNT the moves,
  // not play each of them.
  if (depth === 1) return moves.length;

  let total = 0;
  for (const move of moves) {
    total += perft(applyMove(game, move), depth - 1);
  }
  return total;
}

// "Divide": the perft count split up by first move, e.g. { "e2-e4": 9771, ... }.
// When a total is wrong, compare this with another engine's divide output
// to see WHICH first move has the wrong count, then dig deeper from there.
function perftDivide(game, depth) {
  const result = {};
  for (const move of generateLegalMoves(game)) {
    result[moveToText(move)] = perft(applyMove(game, move), depth - 1);
  }
  return result;
}

// The test positions and their known correct counts.
// The starting position never reaches castling, en passant or promotion
// within 4 moves, so it can't catch bugs in those. The other positions are
// famous test positions built to exercise exactly those special moves.
// (Source: the Chess Programming Wiki "Perft Results" page.)
const PERFT_TESTS = [
  {
    name: 'Starting position',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    expected: [20, 400, 8902, 197281],
  },
  {
    name: '"Kiwipete" (castling, en passant, pins)',
    fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    expected: [48, 2039, 97862],
  },
  {
    name: 'Position 3 (en passant edge cases)',
    fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
    expected: [14, 191, 2812, 43238],
  },
  {
    name: 'Position 4 (promotions, checks)',
    fen: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    expected: [6, 264, 9467],
  },
  {
    name: 'Position 5',
    fen: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
    expected: [44, 1486, 62379],
  },
];

// Run one test at one depth and report the result.
function runPerftCase(test, depth) {
  const game = createGameFromFEN(test.fen);
  const start = performance.now();
  const actual = perft(game, depth);
  const ms = Math.round(performance.now() - start);
  const expected = test.expected[depth - 1];
  return { name: test.name, depth, expected, actual, ms, pass: actual === expected };
}
