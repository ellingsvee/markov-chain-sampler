// A TR-808-style kit synthesized offline into AudioBuffers.

const SR = 44100;

async function render(seconds, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
  build(ctx, ctx.destination);
  return ctx.startRendering();
}

function noiseBuffer(ctx, seconds) {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noise(ctx, seconds) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds);
  return src;
}

function envGain(ctx, peak, decay, attack = 0.001) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, 0);
  g.gain.linearRampToValueAtTime(peak, attack);
  g.gain.exponentialRampToValueAtTime(0.0001, attack + decay);
  return g;
}

function filter(ctx, type, frequency, Q = 1) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = Q;
  return f;
}

const kick = () =>
  render(1.0, (ctx, out) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, 0);
    o.frequency.exponentialRampToValueAtTime(50, 0.12);
    o.connect(envGain(ctx, 1, 0.9)).connect(out);
    o.start(0);
  });

const snare = () =>
  render(0.4, (ctx, out) => {
    for (const f of [180, 330]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(envGain(ctx, 0.5, 0.12)).connect(out);
      o.start(0);
    }
    const n = noise(ctx, 0.4);
    n.connect(filter(ctx, 'highpass', 1200)).connect(envGain(ctx, 0.8, 0.22)).connect(out);
    n.start(0);
  });

const clap = () =>
  render(0.5, (ctx, out) => {
    const n = noise(ctx, 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    // Three fast bursts, then a reverberant tail.
    for (const t of [0, 0.011, 0.022]) {
      g.gain.setValueAtTime(1, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.01);
    }
    g.gain.setValueAtTime(0.9, 0.033);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.033 + 0.3);
    n.connect(filter(ctx, 'bandpass', 1100, 1.2)).connect(g).connect(out);
    n.start(0);
  });

// The 808 hats are six detuned square waves through band- and high-pass filters.
function metal(ctx, out, decay, peak) {
  const bp = filter(ctx, 'bandpass', 10000, 0.8);
  const hp = filter(ctx, 'highpass', 7000);
  bp.connect(hp).connect(envGain(ctx, peak, decay)).connect(out);
  for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 40 * r;
    o.connect(bp);
    o.start(0);
  }
}

const closedHat = () => render(0.15, (ctx, out) => metal(ctx, out, 0.06, 0.6));
const openHat = () => render(0.6, (ctx, out) => metal(ctx, out, 0.45, 0.5));

const tom = () =>
  render(0.6, (ctx, out) => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(160, 0);
    o.frequency.exponentialRampToValueAtTime(100, 0.3);
    o.connect(envGain(ctx, 0.9, 0.45)).connect(out);
    o.start(0);
  });

const cowbell = () =>
  render(0.5, (ctx, out) => {
    const bp = filter(ctx, 'bandpass', 800, 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0);
    g.gain.linearRampToValueAtTime(0.6, 0.001);
    g.gain.exponentialRampToValueAtTime(0.25, 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, 0.4);
    bp.connect(g).connect(out);
    for (const f of [540, 800]) {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = f;
      o.connect(bp);
      o.start(0);
    }
  });

// name, synth, choke group (open hat is cut by closed hat, as on the 808)
const KIT = [
  ['kick', kick, 0],
  ['snare', snare, 0],
  ['clap', clap, 0],
  ['ch', closedHat, 1],
  ['oh', openHat, 1],
  ['tom', tom, 0],
  ['cowbell', cowbell, 0],
];

export const KIT_NAMES = KIT.map(([name]) => name);

export async function synthKit() {
  const buffers = await Promise.all(KIT.map(([, synth]) => synth()));
  return KIT.map(([name, , choke], i) => ({ name, buffer: buffers[i], choke }));
}

export async function synthOne(name) {
  const entry = KIT.find(([n]) => n === name);
  return entry ? entry[1]() : null;
}
