// Editable table for the jump matrix P. Rows are always kept stochastic.
// Drag a cell up or down to change it (shift for fine steps), or click it to type.

import { rowSum, dirichlet } from './chain.js';

const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (x) => (Math.round(x * 1000) / 1000).toString();
const shade = (p) => `rgba(0, 0, 0, ${(0.12 * p).toFixed(3)})`;

const DRAG_PX = 150; // pixels of vertical drag for a change of 1
const DRAG_START = 3; // pixels before a press counts as a drag

// Set P[i][j] = v and rescale the rest of row i so it still sums to one.
export function setEntryRenormalized(row, j, v) {
  v = Math.min(1, Math.max(0, v));
  const out = row.slice();
  const others = rowSum(row) - row[j];
  const n = row.length;
  for (let k = 0; k < n; k++) {
    if (k === j) continue;
    out[k] = others > 0 ? (row[k] * (1 - v)) / others : n > 1 ? (1 - v) / (n - 1) : 0;
  }
  out[j] = n > 1 ? v : 1;
  return out;
}

export class MatrixEditor {
  // state: { names, P } (mutated in place)
  // onDrag() while a drag is in progress, onChange() after an edit is done
  constructor(container, state, { onChange, onDrag }) {
    this.container = container;
    this.state = state;
    this.onChange = onChange;
    this.onDrag = onDrag;
  }

  focus(i, j) {
    const input = this.container.querySelector(`input[data-i="${i}"][data-j="${j}"]`);
    if (!input) return;
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    input.focus();
    input.select();
  }

  render() {
    const { names, P } = this.state;
    const n = names.length;
    const table = document.createElement('table');
    table.className = 'matrix';

    const head = table.createTHead().insertRow();
    head.insertCell().outerHTML = '<th class="corner">from \\ to</th>';
    for (const name of names) head.insertCell().outerHTML = `<th title="${esc(name)}">${esc(short(name))}</th>`;
    head.insertCell().outerHTML = '<th></th>';

    const body = table.createTBody();
    for (let i = 0; i < n; i++) {
      const tr = body.insertRow();
      tr.insertCell().outerHTML = `<th title="${esc(names[i])}">${esc(short(names[i]))}</th>`;
      for (let j = 0; j < n; j++) {
        const td = tr.insertCell();
        td.style.background = shade(P[i][j]);
        const input = numberInput(P[i][j]);
        input.dataset.i = i;
        input.dataset.j = j;
        input.title = `${names[i]} → ${names[j]}`;
        input.addEventListener('change', () => {
          const v = parseFloat(input.value);
          if (!Number.isNaN(v)) P[i] = setEntryRenormalized(P[i], j, v);
          this.onChange();
        });
        this._bindDrag(input, tr, i, j);
        td.appendChild(input);
      }

      const actions = tr.insertCell();
      actions.className = 'row-actions';
      actions.append(
        rowButton('unif', 'uniform row', () => (P[i] = P[i].map(() => 1 / n))),
        rowButton('rand', 'random row (Dirichlet)', () => (P[i] = dirichlet(n, 0.6))),
      );
      for (const b of actions.children) b.addEventListener('click', () => this.onChange());
    }
    this.container.replaceChildren(table);
  }

  // Vertical drag edits the entry; a press without movement focuses the input for typing.
  _bindDrag(input, tr, i, j) {
    const { P } = this.state;
    let start = null;

    input.addEventListener('pointerdown', (e) => {
      if (document.activeElement === input || e.button !== 0) return;
      e.preventDefault();
      input.setPointerCapture(e.pointerId);
      start = { y: e.clientY, row: P[i].slice(), dragging: false };
    });

    input.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dy = start.y - e.clientY;
      if (!start.dragging && Math.abs(dy) < DRAG_START) return;
      start.dragging = true;
      document.body.classList.add('dragging-cell');
      const v = start.row[j] + (dy / DRAG_PX) * (e.shiftKey ? 0.1 : 1);
      P[i] = setEntryRenormalized(start.row, j, v);
      this._paintRow(tr, i);
      this.onDrag?.();
    });

    const end = () => {
      if (!start) return;
      const dragged = start.dragging;
      start = null;
      document.body.classList.remove('dragging-cell');
      if (dragged) this.onChange();
      else {
        input.focus();
        input.select();
      }
    };
    input.addEventListener('pointerup', end);
    input.addEventListener('pointercancel', end);
  }

  // Update the values and shading of one row in place, without rebuilding the table.
  _paintRow(tr, i) {
    tr.querySelectorAll('input[data-j]').forEach((input) => {
      const p = this.state.P[i][+input.dataset.j];
      input.value = fmt(p);
      input.parentElement.style.background = shade(p);
    });
  }
}

function short(name) {
  return name.length > 6 ? name.slice(0, 5) + '…' : name;
}

function numberInput(value) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = 0;
  input.max = 1;
  input.step = 0.01;
  input.value = fmt(value);
  return input;
}

function rowButton(label, title, fn) {
  const b = document.createElement('button');
  b.className = 'link';
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', fn);
  return b;
}
