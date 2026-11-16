import { stationary, communicatingClasses, normalizeRow, randomSeed } from './chain.js';
import { synthKit } from './kit808.js';
import { makeSample, decodeFile, baseName, playSample } from './samples.js';
import { Scheduler } from './scheduler.js';
import { Graph } from './graph.js';
import { MatrixEditor } from './matrix.js';
import { groove } from './presets.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state

const app = {
  samples: [],
  P: [],
  rates: [],
  params: {
    mode: 'grid',
    bpm: 120,
    rateScale: 1,
    walkers: 1,
    volume: 0.8,
  },
};

const names = () => app.samples.map((s) => s.name);
const SUBDIV = 4; // grid ticks per beat (1/16 notes)
const tickDur = () => 60 / app.params.bpm / SUBDIV;
const effRates = () => app.rates.map((r) => r * app.params.rateScale);

function model() {
  const p = app.params;
  return {
    P: app.P,
    rates: effRates(),
    mode: p.mode,
    tickDur: tickDur(),
    nWalkers: p.walkers,
    start: -1,
    loopTicks: 0,
  };
}

// ---------------------------------------------------------------- audio

let ctx = null;
let master = null;
let scheduler = null;
const chokes = new Map();
let visQueue = [];

function ensureAudio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.ratio.value = 8;
    master = ctx.createGain();
    master.gain.value = app.params.volume;
    master.connect(comp).connect(ctx.destination);
    scheduler = new Scheduler(ctx, model, onTrigger);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function onTrigger(walker, from, to, time) {
  const s = app.samples[to];
  if (s) playSample(ctx, master, s, time, chokes);
  visQueue.push({ time, walker, from, to });
}

function audition(i) {
  ensureAudio();
  playSample(ctx, master, app.samples[i], ctx.currentTime, chokes);
  graph.flash(i);
}

function play() {
  if (!app.samples.length) return;
  ensureAudio();
  shown = [];
  scheduler.start(randomSeed());
  updatePlayButton();
}

function stop() {
  if (!scheduler?.playing) return;
  scheduler.stop();
  shown = [];
  visQueue = [];
  graph.clearWalkers();
  graph.setOccupied(new Set());
  updatePlayButton();
}

const toggle = () => (scheduler?.playing ? stop() : play());

function updatePlayButton() {
  $('play').textContent = scheduler?.playing ? '[stop]' : '[play]';
}

// State each walker is drawn in, which lags the scheduler by the look-ahead.
let shown = [];

// ---------------------------------------------------------------- views

const graph = new Graph($('graph'), {
  onNodeClick: (i) => audition(i),
  onEdgeClick: (i, j) => matrix.focus(i, j),
});

const matrix = new MatrixEditor($('matrix'), app, {
  onChange: () => chainChanged(),
  onDrag: () => renderGraph(),
});
Object.defineProperty(app, 'names', { get: names });

function occupiedStates() {
  return new Set(scheduler?.playing ? shown.filter((s) => s != null) : []);
}

function renderGraph() {
  graph.render({ names: names(), P: app.P, occupied: occupiedStates() });
  graph.setWalkerLabels(app.params.walkers > 1);
}

function renderSamples() {
  const table = document.createElement('table');
  table.className = 'samples';
  const head = table.createTHead().insertRow();
  head.innerHTML = '<th></th><th>name</th><th>gain</th><th>pitch (st)</th><th>choke</th><th></th>';
  const body = table.createTBody();
  app.samples.forEach((s, i) => {
    const tr = body.insertRow();

    const playBtn = button('▶', 'audition', () => audition(i));
    tr.insertCell().appendChild(playBtn);

    const name = document.createElement('input');
    name.type = 'text';
    name.value = s.name;
    name.maxLength = 16;
    name.addEventListener('change', () => {
      s.name = name.value.trim() || s.name;
      renderAll();
    });
    tr.insertCell().appendChild(name);

    const gain = document.createElement('input');
    gain.type = 'range';
    gain.min = 0;
    gain.max = 1.5;
    gain.step = 0.01;
    gain.value = s.gain;
    gain.addEventListener('input', () => (s.gain = parseFloat(gain.value)));
    tr.insertCell().appendChild(gain);

    const pitch = document.createElement('input');
    pitch.type = 'number';
    pitch.min = -24;
    pitch.max = 24;
    pitch.step = 1;
    pitch.value = s.pitch;
    pitch.addEventListener('change', () => (s.pitch = Math.max(-24, Math.min(24, parseFloat(pitch.value) || 0))));
    tr.insertCell().appendChild(pitch);

    const choke = document.createElement('select');
    choke.title = 'samples in the same group cut each other off';
    for (const [v, t] of [[0, '–'], [1, '1'], [2, '2'], [3, '3']]) choke.add(new Option(t, v, false, s.choke === v));
    choke.addEventListener('change', () => (s.choke = parseInt(choke.value, 10)));
    tr.insertCell().appendChild(choke);

    const actions = tr.insertCell();
    const replace = document.createElement('label');
    replace.className = 'link';
    replace.textContent = 'replace';
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'audio/*';
    file.hidden = true;
    file.addEventListener('change', async () => {
      if (!file.files[0]) return;
      try {
        s.buffer = await decodeFile(ensureAudio(), file.files[0]);
        renderSamples();
      } catch (err) {
        alert(`Could not decode ${file.files[0].name}: ${err.message}`);
      }
    });
    replace.appendChild(file);
    actions.append(replace, ' ', button('remove', 'remove this state', () => removeState(i)));
  });
  $('sampleList').replaceChildren(table);
}

function button(label, title, fn) {
  const b = document.createElement('button');
  b.className = 'link';
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', fn);
  return b;
}

function renderTransport() {
  const p = app.params;
  document.querySelectorAll('input[name="mode"]').forEach((r) => (r.checked = r.value === p.mode));
  $('transport').classList.toggle('grid-off', p.mode !== 'grid');
  $('bpm').value = p.bpm;
  $('rateScale').value = Math.log2(p.rateScale);
  $('rateScaleOut').textContent = `${p.rateScale.toFixed(2)}`;
  $('walkers').value = p.walkers;
  $('volume').value = p.volume;
}

function renderAll() {
  renderTransport();
  renderGraph();
  matrix.render();
  renderSamples();
}

function chainChanged({ timing = false } = {}) {
  if (timing) scheduler?.resync();
  renderGraph();
  matrix.render();
}

// ---------------------------------------------------------------- structure

function addState(sample) {
  const n = app.samples.length;
  app.samples.push(sample);
  app.P = app.P.map((row) => [...row.map((x) => (x * n) / (n + 1)), 1 / (n + 1)]);
  app.P.push(new Array(n + 1).fill(1 / (n + 1)));
  app.rates.push(5);
  graph.resetLayout(n + 1);
  structureChanged();
}

function removeState(i) {
  if (app.samples.length === 1) stop();
  app.samples.splice(i, 1);
  app.P.splice(i, 1);
  app.P = app.P.map((row) => normalizeRow(row.filter((_, j) => j !== i)));
  app.rates.splice(i, 1);
  graph.removeNode(i);
  visQueue = visQueue.filter((e) => e.to !== i && e.from !== i);
  scheduler?.removeState(i);
  structureChanged();
}

function structureChanged() {
  // Take the walkers' states from the scheduler, which re-indexed them.
  shown = scheduler?.playing ? scheduler.walkers.map((w) => w.state) : [];
  graph.clearWalkers();
  renderAll();
}

async function addFiles(files) {
  ensureAudio();
  for (const f of files) {
    if (!f.type.startsWith('audio/') && !/\.(wav|mp3|ogg|flac|aiff?|m4a)$/i.test(f.name)) continue;
    try {
      addState(makeSample(baseName(f), await decodeFile(ctx, f)));
    } catch (err) {
      alert(`Could not decode ${f.name}: ${err.message}`);
    }
  }
}

let kit = [];

async function loadKit() {
  stop();
  app.samples = kit.map((k) => makeSample(k.name, k.buffer, { choke: k.choke }));
  const { P, rates } = groove(names());
  app.P = P;
  app.rates = rates;
  graph.resetLayout(app.samples.length);
  structureChanged();
  scheduler?.resync();
}

// ---------------------------------------------------------------- controls

function bindControls() {
  $('play').addEventListener('click', toggle);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.target.closest('input, select, textarea, button, label')) return;
    e.preventDefault();
    toggle();
  });

  document.querySelectorAll('input[name="mode"]').forEach((r) =>
    r.addEventListener('change', () => {
      app.params.mode = r.value;
      renderTransport();
      chainChanged({ timing: true });
    }),
  );
  $('bpm').addEventListener('change', () => {
    app.params.bpm = Math.min(300, Math.max(40, parseFloat($('bpm').value) || 120));
    renderTransport();
    chainChanged();
  });
  $('rateScale').addEventListener('input', () => {
    app.params.rateScale = Math.pow(2, parseFloat($('rateScale').value));
    $('rateScaleOut').textContent = app.params.rateScale.toFixed(2);
  });
  $('rateScale').addEventListener('change', () => chainChanged({ timing: true }));
  $('walkers').addEventListener('change', () => {
    app.params.walkers = Math.min(8, Math.max(1, parseInt($('walkers').value, 10) || 1));
    $('walkers').value = app.params.walkers;
    graph.setWalkerLabels(app.params.walkers > 1);
  });
  $('volume').addEventListener('input', () => {
    app.params.volume = parseFloat($('volume').value);
    if (master) master.gain.setTargetAtTime(app.params.volume, ctx.currentTime, 0.02);
  });
  $('relayout').addEventListener('click', () => {
    graph.resetLayout(app.samples.length);
    renderGraph();
  });

  $('upload').addEventListener('change', (e) => {
    addFiles([...e.target.files]);
    e.target.value = '';
  });
  $('resetKit').addEventListener('click', loadKit);
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    document.body.classList.add('dropping');
  });
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) document.body.classList.remove('dropping');
  });
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    document.body.classList.remove('dropping');
    addFiles([...e.dataTransfer.files]);
  });

}

// ---------------------------------------------------------------- animation loop

function frame(now) {
  if (ctx && scheduler?.playing) {
    const t = ctx.currentTime;
    const due = [];
    visQueue = visQueue.filter((e) => (e.time <= t ? (due.push(e), false) : true));
    due.sort((a, b) => a.time - b.time);
    for (const e of due) {
      if (e.walker >= app.params.walkers) continue;
      shown[e.walker] = e.to;
      graph.move(e.walker, e.from, e.to);
    }
    // Drop walkers that were removed from the transport.
    for (let k = app.params.walkers; k < shown.length; k++) graph.removeWalker(k);
    shown.length = Math.min(shown.length, app.params.walkers);
    if (due.length) graph.setOccupied(occupiedStates());
  }
  graph.tick(now);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot

async function boot() {
  bindControls();
  kit = await synthKit();
  await loadKit();
  $('play').disabled = false;
  updatePlayButton();
  requestAnimationFrame(frame);
}

boot();

// Exposed for poking at the maths from the console.
window.markov = { app, stationary, communicatingClasses };
