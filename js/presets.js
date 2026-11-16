// The default chain for the 808 kit.

import { normalizeRow } from './chain.js';

// Transition weights between the default kit voices, tuned for grid mode at
// 1/16. Voices missing from a row get weight 0; voices not in the table get a
// uniform row.
const GROOVE = {
  kick: { ch: 0.45, kick: 0.2, snare: 0.15, oh: 0.15, clap: 0.05 },
  snare: { kick: 0.5, ch: 0.35, tom: 0.1, snare: 0.05 },
  clap: { kick: 0.55, ch: 0.35, clap: 0.1 },
  ch: { kick: 0.35, ch: 0.25, snare: 0.15, clap: 0.1, oh: 0.1, cowbell: 0.05 },
  oh: { kick: 0.6, ch: 0.4 },
  tom: { tom: 0.3, kick: 0.4, ch: 0.3 },
  cowbell: { kick: 0.5, ch: 0.3, cowbell: 0.2 },
};
const GROOVE_RATES = { kick: 7, snare: 5, clap: 5, ch: 9, oh: 4, tom: 4, cowbell: 3 };

export const groove = (names) => ({
  P: names.map((a) => normalizeRow(names.map((b) => (GROOVE[a] ? (GROOVE[a][b] ?? 0) : 1)))),
  rates: names.map((a) => GROOVE_RATES[a] ?? 5),
});
