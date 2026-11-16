// Look-ahead scheduler: a coarse JS timer schedules Web Audio events a short
// while ahead, so playback is sample-accurate regardless of timer jitter.
//
// model() is read on every pass, so parameter edits take effect live:
//   { P, rates, mode: 'free' | 'grid', tickDur, nWalkers, start, loopTicks }
// `rates` already include the global rate scale. `start` is a state index or -1
// for uniform random.
//
// trigger(walkerId, from, to, time) is called once per walker entering a state
// (from = null when a walker appears).

import { mulberry32, sampleNext, expSample, tickJumpProb } from './chain.js';

const LOOKAHEAD = 0.1; // seconds of audio scheduled ahead
const INTERVAL = 25; // ms between scheduling passes
const START_DELAY = 0.05;

export class Scheduler {
  constructor(ctx, model, trigger) {
    this.ctx = ctx;
    this.model = model;
    this.trigger = trigger;
    this.walkers = [];
    this.timer = null;
    this.seed = 0;
  }

  get playing() {
    return this.timer !== null;
  }

  start(seed) {
    if (this.playing) return;
    this.seed = seed;
    const m = this.model();
    const t0 = this.ctx.currentTime + START_DELAY;
    this.walkers = [];
    this.tickCount = 0;
    this.nextTick = t0 + m.tickDur;
    for (let k = 0; k < m.nWalkers; k++) this._addWalker(t0, m);
    this.timer = setInterval(() => this._pass(), INTERVAL);
    this._pass();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.walkers = [];
  }

  // The earliest time at which new events may be placed without colliding
  // with what is already scheduled.
  _horizon() {
    return this.ctx.currentTime + LOOKAHEAD;
  }

  _rng(k) {
    return mulberry32(this.seed * 7919 + k * 104729 + 1);
  }

  _initialState(rng, m) {
    const n = m.P.length;
    return m.start >= 0 && m.start < n ? m.start : Math.floor(rng() * n);
  }

  _addWalker(time, m) {
    const id = this.walkers.length;
    const rng = this._rng(id);
    const w = { id, rng, state: this._initialState(rng, m), lastTime: time, nextTime: 0 };
    w.nextTime = time + expSample(m.rates[w.state], rng);
    this.walkers.push(w);
    this.trigger(id, null, w.state, time);
  }

  _jump(w, time, m) {
    const to = sampleNext(m.P, w.state, w.rng);
    this.trigger(w.id, w.state, to, time);
    w.state = to;
    w.lastTime = time;
  }

  _pass() {
    const m = this.model();
    if (m.P.length === 0) return;
    this._syncWalkerCount(m);
    const horizon = this._horizon();

    if (m.mode === 'free') {
      for (const w of this.walkers) {
        while (w.nextTime < horizon) {
          this._jump(w, w.nextTime, m);
          w.nextTime += expSample(m.rates[w.state], w.rng);
        }
      }
      return;
    }

    while (this.nextTick < horizon) {
      const t = this.nextTick;
      this.tickCount++;
      if (m.loopTicks > 0 && this.tickCount % m.loopTicks === 0) {
        // Re-seed: the chain replays the same realization every loop.
        for (const w of this.walkers) {
          w.rng = this._rng(w.id);
          const to = this._initialState(w.rng, m);
          this.trigger(w.id, w.state, to, t);
          w.state = to;
          w.lastTime = t;
        }
      } else {
        for (const w of this.walkers) {
          if (w.lastTime >= t) continue; // just appeared on this tick
          if (w.rng() < tickJumpProb(m.rates[w.state], m.tickDur)) this._jump(w, t, m);
        }
      }
      this.nextTick += m.tickDur;
    }
  }

  _syncWalkerCount(m) {
    if (m.nWalkers === this.walkers.length) return;
    while (this.walkers.length > m.nWalkers) this.walkers.pop();
    const t = m.mode === 'grid' ? this.nextTick : this._horizon();
    while (this.walkers.length < m.nWalkers) this._addWalker(t, m);
  }

  // Call after the rates or the mode change. By memorylessness a pending
  // Exp holding time may simply be redrawn from the current moment.
  resync() {
    if (!this.playing) return;
    const m = this.model();
    const s = this._horizon();
    if (m.mode === 'free') {
      for (const w of this.walkers) {
        w.nextTime = Math.max(w.lastTime, s) + expSample(m.rates[w.state], w.rng);
      }
    } else if (this.nextTick < s - m.tickDur) {
      // Coming back from free mode: restart the grid just past the horizon.
      this.nextTick = Math.max(s, ...this.walkers.map((w) => w.lastTime + 1e-3));
      this.tickCount = 0;
    }
  }

  // Call after a state is removed: walkers re-index, and those that were in
  // the removed state move to a uniformly random state.
  removeState(index) {
    const n = this.model().P.length;
    for (const w of this.walkers) {
      if (w.state === index) w.state = Math.floor(w.rng() * n);
      else if (w.state > index) w.state--;
    }
  }
}
