// ai-worker.js — runs the AI in a background thread (a "Web Worker").
//
// Normally all JavaScript on a page runs on ONE thread, the same one that
// draws the page and reacts to clicks. A search that takes 1 second would
// freeze the page for that whole second. A Web Worker is a second thread
// with no access to the page; it can only exchange messages with it.
//
// The conversation is simple:
//   page -> worker:  { game, depth }               "find a move for this"
//   worker -> page:  { move, score, nodes, ms }    "here is my answer"
//
// The worker needs the same rules, evaluation and search code as the page,
// so it loads the same files. (Paths are relative to this file, in js/.)
importScripts('board.js', 'rules.js', 'evaluate.js', 'ai.js');

self.onmessage = (event) => {
  const { game, depth } = event.data;
  const result = findBestMove(game, depth);
  self.postMessage(result);
};
