import {
  createEditor, paint, judge, undo, beginStroke, endStroke, summary, cellColor, PAINT, BLACK, WHITE,
} from './lib/editor.js';
import { KIND } from './lib/layout.js';
import { classify } from './lib/color.js';
import { verify, exportImage } from './lib/verify.js';
import { brushCells, lineCells, heartCells } from './lib/shapes.js';

const SWATCHES = [
  ['#241c15', '墨'], ['#1d2b6b', '紺'], ['#c8203c', '紅'], ['#1f5a3a', '深緑'], ['#5b3a8c', '紫'],
  ['#ffffff', '白'], ['#fbe7a1', 'クリーム'], ['#ffc2d1', '桃'], ['#b8e2f2', '水色'], ['#c9f0b0', '若葉'],
];

const $ = (id) => document.getElementById(id);
const board = $('board');
const ctx = board.getContext('2d');

const state = {
  ed: null,
  color: '#c8203c',
  size: 1,
  eraser: false,
  showCost: true,
  check: null,
  refused: new Map(), // cell -> 時刻(赤く光らせる)
  stroke: null,
  last: null,
};

// ---------- 中身 ----------

function rebuild(text, ecl) {
  let ed;
  try {
    ed = createEditor(text, ecl);
  } catch (e) {
    $('formError').textContent = e.message;
    $('formError').hidden = false;
    return false;
  }
  $('formError').hidden = true;
  state.ed = ed;
  state.refused.clear();
  const { version, size } = ed.qr;
  $('qrInfo').textContent = `${version}版 ・ ${size}×${size} ・ 訂正 ${ecl} ・ ${ed.t.length}ブロック(各 t=${[...new Set(ed.t)].join('/')})`;
  layoutBoard();
  afterStroke();
  return true;
}

$('contentForm').addEventListener('submit', (e) => {
  e.preventDefault();
  rebuild($('text').value.trim(), document.querySelector('input[name=ecl]:checked').value);
});

// ---------- 筆 ----------

const CLASS_LABEL = { 1: ['暗として読まれる', 'dark'], 0: ['明として読まれる', 'light'], '-1': ['どっちつかず(常に壊す扱い)', 'mid'] };

function setColor(hex) {
  state.color = hex;
  state.eraser = false;
  $('eraser').checked = false;
  $('color').value = hex;
  const [label, cls] = CLASS_LABEL[classify(hex)];
  const badge = $('colorClass');
  badge.textContent = label;
  badge.className = `badge ${cls}`;
  document.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === hex)));
  draw();
}

for (const [hex, name] of SWATCHES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'swatch';
  b.dataset.color = hex;
  b.style.background = hex;
  b.title = name;
  b.setAttribute('aria-label', name);
  b.addEventListener('click', () => setColor(hex));
  $('swatches').append(b);
}
$('color').addEventListener('input', (e) => setColor(e.target.value));
document.querySelectorAll('input[name=size]').forEach((r) => r.addEventListener('change', () => { state.size = +r.value; }));
$('eraser').addEventListener('change', (e) => { state.eraser = e.target.checked; draw(); });
$('showCost').addEventListener('change', (e) => { state.showCost = e.target.checked; draw(); });
$('undo').addEventListener('click', () => { if (undo(state.ed)) afterStroke(); });
$('clear').addEventListener('click', () => {
  const s = beginStroke(state.ed);
  state.ed.colors.forEach((c, cell) => { if (c !== null) paint(state.ed, cell, null, s); });
  endStroke(state.ed);
  afterStroke();
});
$('sample').addEventListener('click', () => drawSample());

// ---------- 描画面 ----------

let cellPx = 10;
const QUIET = 2; // 画面上の余白(モジュール数)

function layoutBoard() {
  const wrap = board.parentElement;
  const css = Math.min(wrap.clientWidth, 640);
  const n = state.ed.qr.size + QUIET * 2;
  cellPx = Math.max(4, Math.floor(css / n));
  const px = cellPx * n;
  const dpr = window.devicePixelRatio || 1;
  board.style.width = board.style.height = `${px}px`;
  board.width = board.height = Math.round(px * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
window.addEventListener('resize', () => state.ed && layoutBoard());

function draw() {
  const ed = state.ed;
  if (!ed) return;
  const { size } = ed.qr;
  const n = size + QUIET * 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, n * cellPx, n * cellPx);
  const brush = state.eraser ? null : state.color;
  const now = performance.now();

  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const cell = r * size + c;
    const x = (c + QUIET) * cellPx, y = (r + QUIET) * cellPx;
    ctx.fillStyle = cellColor(ed, cell);
    ctx.fillRect(x, y, cellPx, cellPx);

    if (state.showCost && brush) {
      const v = judge(ed, cell, brush);
      if (v === PAINT.OK) {
        ctx.fillStyle = 'rgba(232, 150, 20, 0.95)';
        const d = Math.max(2, cellPx * 0.28);
        ctx.fillRect(x + (cellPx - d) / 2, y + (cellPx - d) / 2, d, d);
      } else if (v === PAINT.FULL || v === PAINT.LOCKED) {
        ctx.strokeStyle = v === PAINT.FULL ? 'rgba(220, 40, 60, 0.75)' : 'rgba(120, 120, 140, 0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + cellPx - 2);
        ctx.lineTo(x + cellPx - 2, y + 2);
        ctx.stroke();
      }
    }
    const t = state.refused.get(cell);
    if (t && now - t < 600) {
      ctx.strokeStyle = 'rgba(230, 30, 50, 0.95)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellPx - 2, cellPx - 2);
    }
  }
}

function flashLoop() {
  const now = performance.now();
  for (const [cell, t] of state.refused) if (now - t >= 600) state.refused.delete(cell);
  draw();
  if (state.refused.size) setTimeout(flashLoop, 120);
}

function eventCell(e) {
  const rect = board.getBoundingClientRect();
  const c = Math.floor((e.clientX - rect.left) / cellPx) - QUIET;
  const r = Math.floor((e.clientY - rect.top) / cellPx) - QUIET;
  return [r, c];
}

function applyAt(r, c) {
  const ed = state.ed;
  const color = state.eraser ? null : state.color;
  let refusedAny = false;
  for (const cell of brushCells(r, c, state.size, ed.qr.size)) {
    const v = paint(ed, cell, color, state.stroke);
    if (v === PAINT.FULL || v === PAINT.LOCKED) {
      state.refused.set(cell, performance.now());
      refusedAny = true;
      lastRefusal = v;
    }
  }
  return refusedAny;
}

let lastRefusal = null;

board.addEventListener('pointerdown', (e) => {
  if (!state.ed) return;
  board.setPointerCapture(e.pointerId);
  state.stroke = beginStroke(state.ed);
  lastRefusal = null;
  const [r, c] = eventCell(e);
  state.last = [r, c];
  applyAt(r, c);
  liveUpdate();
});

board.addEventListener('pointermove', (e) => {
  if (!state.stroke) return;
  const [r, c] = eventCell(e);
  if (state.last && state.last[0] === r && state.last[1] === c) return;
  for (const [rr, cc] of lineCells(state.last, [r, c])) applyAt(rr, cc);
  state.last = [r, c];
  liveUpdate();
});

const finish = () => {
  if (!state.stroke) return;
  state.stroke = null;
  endStroke(state.ed);
  afterStroke();
  if (lastRefusal === PAINT.FULL) toast('ここで止めました。このブロックはもう壊せません(取り置きを残しています)。');
  else if (lastRefusal === PAINT.LOCKED) toast('角の四角・タイミング・形式情報は明暗を変えられません。同じ明暗の色なら塗れます。');
  if (state.refused.size) flashLoop();
};
board.addEventListener('pointerup', finish);
board.addEventListener('pointercancel', finish);

let toastTimer = 0;
function toast(msg) {
  $('toast').textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').textContent = ''; }, 3500);
}

// ---------- 余裕と検査 ----------

function renderBudget() {
  const s = summary(state.ed);
  $('left').textContent = s.left;
  const bars = $('bars');
  bars.replaceChildren();
  s.blocks.forEach((b, i) => {
    const row = document.createElement('div');
    row.className = 'bar';
    const pct = (x) => `${(x / Math.max(1, b.t)) * 100}%`;
    row.innerHTML = `
      <span class="bl">#${i + 1}</span>
      <span class="track">
        <span class="fill ${b.damaged >= b.safe ? 'full' : ''}" style="width:${pct(b.damaged)}"></span>
        <span class="stop" style="left:${pct(b.safe)}"></span>
      </span>
      <span class="bn">${b.damaged}/${b.safe}<small> (t=${b.t})</small></span>`;
    bars.append(row);
  });
  return s;
}

function liveUpdate() {
  renderBudget();
  draw();
}

function setMark(id, ok, extra = '') {
  const li = $(id);
  li.className = ok ? 'ok' : 'ng';
  li.querySelector('.mark').textContent = ok ? '読めた' : '読めない';
  if (extra !== null && id === 'chkHarsh') $('harshCount').textContent = extra;
}

function afterStroke() {
  renderBudget();
  const v = verify(state.ed);
  state.check = v;
  setMark('chkClean', v.clean.ok);
  setMark('chkHarsh', v.harsh.ok, `(${v.harsh.passed}/${v.harsh.total})`);
  $('export').disabled = !v.ok;
  $('exportWhy').textContent = v.ok
    ? '書き出したら、使う前に手元のスマホで読めるか確かめてください。'
    : `jsQR が読めないので書き出せません(${!v.clean.ok ? v.clean.reason : v.harsh.reason})。取り消すか消しゴムで戻してください。`;
  draw();
}

$('export').addEventListener('click', () => {
  if (!state.check?.ok) return;
  const img = exportImage(state.ed);
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  cv.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  cv.toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'e-qr.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

// ---------- お手本 ----------

// 中央にハート。中は「元が暗なら紅・明なら桃」で塗る(明暗が変わらないのでタダ)。
// 輪郭だけは紅で塗り通そうとする(明のモジュールは予算を使い、尽きたら止まる)。
function drawSample() {
  const ed = state.ed;
  const { size } = ed.qr;
  const { inside, outline } = heartCells(size);
  const s = beginStroke(ed);
  for (const cell of inside) paint(ed, cell, ed.qr.bits[cell] ? '#c8203c' : '#ffc2d1', s);
  for (const cell of outline) paint(ed, cell, '#8e0f28', s);
  endStroke(ed);
  afterStroke();
}

// ---------- 検証用の窓口 ----------

window.__app = {
  get editor() { return state.ed; },
  get check() { return state.check; },
  summary: () => summary(state.ed),
  rebuild,
  setColor,
  paintCells(cells, color) {
    const s = beginStroke(state.ed);
    const res = cells.map(([r, c]) => paint(state.ed, r * state.ed.qr.size + c, color, s));
    endStroke(state.ed);
    afterStroke();
    return res;
  },
  flipAll() {
    const ed = state.ed;
    const s = beginStroke(ed);
    ed.map.kinds.forEach((k, cell) => { if (k === KIND.DATA) paint(ed, cell, ed.qr.bits[cell] ? WHITE : BLACK, s); });
    endStroke(ed);
    afterStroke();
  },
  undo: () => { undo(state.ed); afterStroke(); },
  sample: drawSample,
  exportEnabled: () => !$('export').disabled,
};

setColor(state.color);
rebuild($('text').value, 'H');
