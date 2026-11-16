// SVG view of the chain: gray nodes and edges, black walkers.

const NS = 'http://www.w3.org/2000/svg';
const W = 800;
const H = 480;
const BASE_R = 24;
const EDGE_W = 1.5;
const MOVE_MS = 110;

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => (len(a) > 1e-9 ? mul(a, 1 / len(a)) : { x: 0, y: -1 });
const rot = (a, t) => ({ x: a.x * Math.cos(t) - a.y * Math.sin(t), y: a.x * Math.sin(t) + a.y * Math.cos(t) });
const pt = (p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export class Graph {
  constructor(container, { onNodeClick, onEdgeClick, onNodeMoved }) {
    this.onNodeClick = onNodeClick;
    this.onEdgeClick = onEdgeClick;
    this.onNodeMoved = onNodeMoved;
    this.svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'graph' }, container);
    const defs = el('defs', {}, this.svg);
    const marker = el(
      'marker',
      {
        id: 'arrow',
        viewBox: '0 0 10 10',
        refX: 9,
        refY: 5,
        markerWidth: 9,
        markerHeight: 9,
        markerUnits: 'userSpaceOnUse',
        orient: 'auto-start-reverse',
      },
      defs,
    );
    el('path', { d: 'M 0 1 L 10 5 L 0 9 z', class: 'arrowhead' }, marker);
    this.edgeLayer = el('g', {}, this.svg);
    this.nodeLayer = el('g', {}, this.svg);
    this.walkerLayer = el('g', {}, this.svg);
    this.empty = el('text', { x: W / 2, y: H / 2, class: 'graph-empty', 'text-anchor': 'middle' }, this.svg);

    this.pos = [];
    this.radii = [];
    this.edges = new Map(); // "i-j" -> path element
    this.nodes = []; // <g> per node
    this.walkers = new Map(); // id -> { g, state, from, to, t0, path }
    this.last = null;
  }

  resetLayout(n) {
    const c = { x: W / 2, y: H / 2 };
    const R = Math.min(W, H) / 2 - 70;
    this.pos = Array.from({ length: n }, (_, i) =>
      add(c, mul({ x: Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n), y: Math.sin(-Math.PI / 2 + (2 * Math.PI * i) / n) }, n === 1 ? 0 : R)),
    );
  }

  // Remove node `index` from a custom layout so the rest keep their places.
  removeNode(index) {
    this.pos.splice(index, 1);
  }

  render({ names, P, occupied }) {
    this.last = { names, P, occupied };
    const n = names.length;
    if (this.pos.length !== n) this.resetLayout(n);
    this.radii = names.map(() => BASE_R);
    this.empty.textContent = n ? '' : 'no samples — add some below';
    this._renderEdges();
    this._renderNodes();
    this._placeWalkers();
  }

  _renderEdges() {
    const { names, P } = this.last;
    const n = names.length;
    this.edgeLayer.replaceChildren();
    this.edges.clear();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const p = P[i][j];
        if (!(p > 0)) continue;
        const d = this._edgePath(i, j);
        const hit = el('path', { d, class: 'edge-hit' }, this.edgeLayer);
        const path = el(
          'path',
          {
            d,
            class: 'edge',
            'stroke-width': EDGE_W,
            'stroke-opacity': (0.35 + 0.65 * p).toFixed(2),
            'marker-end': 'url(#arrow)',
          },
          this.edgeLayer,
        );
        const title = el('title', {}, hit);
        title.textContent = `${names[i]} → ${names[j]}: ${p.toFixed(3)}`;
        hit.addEventListener('click', () => this.onEdgeClick(i, j));
        this.edges.set(`${i}-${j}`, path);
      }
    }
  }

  _renderNodes() {
    const { names, occupied } = this.last;
    this.nodeLayer.replaceChildren();
    this.nodes = names.map((name, i) => {
      const g = el('g', { class: 'node' + (occupied.has(i) ? ' active' : ''), transform: `translate(${pt(this.pos[i])})` }, this.nodeLayer);
      el('circle', { r: this.radii[i].toFixed(1) }, g);
      const label = el('text', { 'text-anchor': 'middle', dy: '0.35em' }, g);
      label.textContent = name.length > 7 ? name.slice(0, 6) + '…' : name;
      const title = el('title', {}, g);
      title.textContent = name;
      this._makeDraggable(g, i);
      return g;
    });
  }

  _placeWalkers() {
    const n = this.pos.length;
    for (const w of this.walkers.values()) {
      if (w.state >= n) this.removeWalker(w.id);
      else this._place(w, this._rest(w.id, w.state));
    }
  }

  _edgePath(i, j) {
    const a = this.pos[i];
    const ra = this.radii[i];
    if (i === j) {
      const center = { x: W / 2, y: H / 2 };
      const d = unit(sub(a, center));
      const p0 = add(a, mul(rot(d, -0.45), ra));
      const p3 = add(a, mul(rot(d, 0.45), ra + 3));
      const c1 = add(a, mul(rot(d, -0.6), ra * 2.9));
      const c2 = add(a, mul(rot(d, 0.6), ra * 2.9));
      return `M ${pt(p0)} C ${pt(c1)} ${pt(c2)} ${pt(p3)}`;
    }
    const b = this.pos[j];
    const ab = sub(b, a);
    const normal = unit({ x: ab.y, y: -ab.x });
    const ctrl = add(mul(add(a, b), 0.5), mul(normal, 0.14 * len(ab)));
    const s = add(a, mul(unit(sub(ctrl, a)), ra));
    const e = add(b, mul(unit(sub(ctrl, b)), this.radii[j] + 2));
    return `M ${pt(s)} Q ${pt(ctrl)} ${pt(e)}`;
  }

  _makeDraggable(g, i) {
    let start = null;
    g.addEventListener('pointerdown', (ev) => {
      start = { x: ev.clientX, y: ev.clientY, moved: false };
      g.setPointerCapture(ev.pointerId);
    });
    g.addEventListener('pointermove', (ev) => {
      if (!start) return;
      if (!start.moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      start.moved = true;
      const m = this.svg.getScreenCTM().inverse();
      const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m);
      this.pos[i] = { x: Math.min(W - 20, Math.max(20, p.x)), y: Math.min(H - 20, Math.max(20, p.y)) };
      g.setAttribute('transform', `translate(${pt(this.pos[i])})`);
      this._renderEdges();
      this._placeWalkers();
    });
    g.addEventListener('pointerup', () => {
      if (start && !start.moved) this.onNodeClick(i);
      else if (start) this.onNodeMoved?.();
      start = null;
    });
  }

  // Where walker `id` sits while resting on node `i`: on the rim, spread by id.
  _rest(id, i) {
    const angle = -Math.PI / 2 - Math.PI / 4 + (2 * Math.PI * id) / 8;
    return add(this.pos[i], mul({ x: Math.cos(angle), y: Math.sin(angle) }, this.radii[i]));
  }

  _place(w, p) {
    w.g.setAttribute('transform', `translate(${pt(p)})`);
  }

  setWalkerLabels(show) {
    this.walkerLayer.classList.toggle('labelled', show);
  }

  // Walker `id` enters node `to` (from `from`, or null when it appears).
  move(id, from, to) {
    let w = this.walkers.get(id);
    if (!w) {
      const g = el('g', { class: 'walker' }, this.walkerLayer);
      el('circle', { r: 7 }, g);
      const t = el('text', { 'text-anchor': 'middle', dy: '0.35em' }, g);
      t.textContent = id + 1;
      w = { id, g };
      this.walkers.set(id, w);
    }
    w.state = to;
    w.path = from === null ? null : this.edges.get(`${from}-${to}`) || null;
    w.t0 = performance.now();
    if (!w.path) this._place(w, this._rest(id, to));
    else this._flashEdge(w.path);
    this._flashNode(to);
  }

  removeWalker(id) {
    const w = this.walkers.get(id);
    if (w) w.g.remove();
    this.walkers.delete(id);
  }

  clearWalkers() {
    for (const id of [...this.walkers.keys()]) this.removeWalker(id);
  }

  // Called every animation frame: glide walkers along the edge they took.
  tick(now) {
    for (const w of this.walkers.values()) {
      if (!w.path) continue;
      const u = Math.min(1, (now - w.t0) / MOVE_MS);
      if (u >= 1 || !w.path.isConnected) {
        w.path = null;
        this._place(w, this._rest(w.id, w.state));
      } else {
        const p = w.path.getPointAtLength(u * w.path.getTotalLength());
        this._place(w, p);
      }
    }
  }

  setOccupied(occupied) {
    this.nodes.forEach((g, i) => g.classList.toggle('active', occupied.has(i)));
  }

  flash(i) {
    this._flashNode(i);
  }

  _flashNode(i) {
    const c = this.nodes[i]?.firstChild;
    c?.animate({ fill: [cssVar('--walker'), cssVar('--bg')] }, { duration: 260, easing: 'ease-out' });
  }

  _flashEdge(path) {
    path.animate({ stroke: [cssVar('--walker'), cssVar('--graph')] }, { duration: 320, easing: 'ease-out' });
  }
}
