// Pure Markov chain maths. No DOM, no audio.
//
// A chain is a jump matrix P (row-stochastic, self-loops allowed) together
// with holding rates λ. The generator is Q = diag(λ)(P − I).

// Seeded PRNG (mulberry32). Returns a function producing uniforms in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 1e6);
}

export function rowSum(row) {
  return row.reduce((s, x) => s + x, 0);
}

// Scale a non-negative row to sum to one. An all-zero row becomes uniform.
export function normalizeRow(row) {
  const s = rowSum(row);
  if (s <= 0) return row.map(() => 1 / row.length);
  return row.map((x) => x / s);
}

// Draw j ~ P[i, ·]. The row need not be normalized.
export function sampleNext(P, i, rng) {
  const row = P[i];
  const s = rowSum(row);
  if (s <= 0) return Math.floor(rng() * row.length);
  let u = rng() * s;
  for (let j = 0; j < row.length; j++) {
    u -= row[j];
    if (u < 0) return j;
  }
  return row.length - 1;
}

// Draw τ ~ Exp(rate) by inversion.
export function expSample(rate, rng) {
  return -Math.log(1 - rng()) / rate;
}

// Probability that a walker jumps during one grid tick of length dt.
// ceil(Exp(λ)/dt) ~ Geometric(1 − e^{−λ dt}), so the grid chain is exactly the
// CTMC with every jump time rounded up to the next tick.
export function tickJumpProb(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

// Stationary distribution π of the CTMC with generator Q = diag(rates)(P − I):
// solve πQ = 0, Σπ = 1. Returns null if π is not unique (several closed classes).
//
// With rates replaced by per-tick jump probabilities this also gives the
// stationary distribution of the grid chain K = (1 − p)I + diag(p)P.
export function stationary(P, rates) {
  const n = P.length;
  if (n === 0) return [];
  const Prow = P.map(normalizeRow);
  // A = Qᵀ, with the last equation replaced by Σπ = 1.
  const A = [];
  for (let r = 0; r < n; r++) {
    A.push(new Array(n + 1).fill(0));
    for (let c = 0; c < n; c++) {
      A[r][c] = rates[c] * (Prow[c][r] - (r === c ? 1 : 0));
    }
  }
  A[n - 1].fill(1);
  A[n - 1][n] = 1;

  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  const pi = A.map((row, i) => Math.max(0, row[n] / row[i]));
  const s = rowSum(pi);
  return pi.map((x) => x / s);
}

// Jump-chain view of π: ν_i ∝ π_i λ_i is the long-run fraction of hits
// (sample triggers) landing on state i.
export function hitDistribution(pi, rates) {
  const w = pi.map((p, i) => p * rates[i]);
  const s = rowSum(w);
  return s > 0 ? w.map((x) => x / s) : w;
}

// Strongly connected components of the graph {i → j : P_ij > 0} (Tarjan),
// each tagged with whether it is closed (no edges leaving it).
export function communicatingClasses(P) {
  const n = P.length;
  const index = new Array(n).fill(-1);
  const low = new Array(n).fill(0);
  const onStack = new Array(n).fill(false);
  const stack = [];
  const comps = [];
  let counter = 0;

  function strong(v) {
    index[v] = low[v] = counter++;
    stack.push(v);
    onStack[v] = true;
    for (let w = 0; w < n; w++) {
      if (!(P[v][w] > 0)) continue;
      if (index[w] === -1) {
        strong(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack[w]) {
        low[v] = Math.min(low[v], index[w]);
      }
    }
    if (low[v] === index[v]) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        comp.push(w);
      } while (w !== v);
      comps.push(comp.sort((a, b) => a - b));
    }
  }
  for (let v = 0; v < n; v++) if (index[v] === -1) strong(v);

  return comps.map((states) => {
    const set = new Set(states);
    const closed = states.every((i) => P[i].every((p, j) => !(p > 0) || set.has(j)));
    return { states, closed };
  });
}

// Dirichlet(α, …, α) sample via normalized Gamma draws (Marsaglia–Tsang for α ≥ 1,
// boosted for α < 1).
export function dirichlet(n, alpha, rng = Math.random) {
  const g = Array.from({ length: n }, () => gamma(alpha, rng));
  return normalizeRow(g);
}

function gamma(a, rng) {
  if (a < 1) return gamma(a + 1, rng) * Math.pow(rng(), 1 / a);
  const d = a - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      const u1 = rng() || 1e-12;
      const u2 = rng();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }
}
