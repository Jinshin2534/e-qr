import { makeQR } from './qr.js';
import { codewordMap, KIND } from './layout.js';
import { correctable } from './blocks.js';
import { classify } from './color.js';

// 実カメラはボケ・傾き・照明ムラで自前の誤りを足してくる。理論上の訂正量 t のうち
// この割合だけを絵に使い、残りは読み取り環境のために空けておく。
export const DEFAULT_MARGIN = 0.5;

export const BLACK = '#000000';
export const WHITE = '#ffffff';

// 描画できるかどうかの判定結果
export const PAINT = {
  OK: 'ok',           // 新しく符号語を1つ壊した(予算を使った)
  FREE: 'free',       // ビットが変わらない、または既に壊れた符号語の中
  SAME: 'same',       // 何も変わらない
  LOCKED: 'locked',   // ファインダ・タイミング・形式情報などは明暗を変えられない
  FULL: 'full',       // このブロックの予算を使い切っている
};

// これより大きい版はモジュールが細かすぎて絵を描く道具にならないので断る。
export const MAX_VERSION = 15;

export function createEditor(text, ecl = 'H', margin = DEFAULT_MARGIN) {
  if (!text) throw new Error('文字が空です');
  let qr;
  try { qr = makeQR(text, ecl); } catch { throw new Error(`長すぎます(${MAX_VERSION}版に収まりません)`); }
  if (qr.version > MAX_VERSION) throw new Error(`長すぎます(${qr.version}版になる。${MAX_VERSION}版まで)`);
  const map = codewordMap(qr.version, ecl);
  const t = correctable(qr.version, ecl);
  const safe = t.map((x) => Math.floor(x * margin));
  const n = qr.size * qr.size;
  const nCw = map.cwBlock.length;
  return {
    qr, map, t, safe, margin,
    colors: new Array(n).fill(null), // null = 元の白黒のまま
    cwErr: new Int32Array(nCw),      // 符号語ごとの誤りモジュール数
    blockDamage: new Int32Array(t.length), // ブロックごとの壊れた符号語数
    history: [],
  };
}

// そのセルにその色が置かれたとき、元のビットと食い違うか。
function isError(ed, cell, color) {
  if (color === null) return false;
  const cls = classify(color);
  return cls === -1 || cls !== ed.qr.bits[cell];
}

export const cellColor = (ed, cell) => ed.colors[cell] ?? (ed.qr.bits[cell] ? BLACK : WHITE);

// 置いたら何が起きるかだけを答える(状態は変えない)。
export function judge(ed, cell, color) {
  const cur = ed.colors[cell];
  if (cur === color) return PAINT.SAME;
  const kind = ed.map.kinds[cell];
  const before = isError(ed, cell, cur);
  const after = isError(ed, cell, color);
  if (kind === KIND.REMAINDER) return PAINT.FREE;
  if (kind !== KIND.DATA) return after ? PAINT.LOCKED : PAINT.FREE;
  if (!after || before) return PAINT.FREE;
  const cw = ed.map.cellCw[cell];
  if (ed.cwErr[cw] > 0) return PAINT.FREE;
  const b = ed.map.cwBlock[cw];
  return ed.blockDamage[b] < ed.safe[b] ? PAINT.OK : PAINT.FULL;
}

function setCell(ed, cell, color) {
  const cw = ed.map.cellCw[cell];
  if (cw >= 0) {
    const d = (isError(ed, cell, color) ? 1 : 0) - (isError(ed, cell, ed.colors[cell]) ? 1 : 0);
    const was = ed.cwErr[cw];
    ed.cwErr[cw] += d;
    const b = ed.map.cwBlock[cw];
    if (was === 0 && ed.cwErr[cw] > 0) ed.blockDamage[b]++;
    if (was > 0 && ed.cwErr[cw] === 0) ed.blockDamage[b]--;
  }
  ed.colors[cell] = color;
}

// 1セル塗る。予算を超えるなら塗らずに理由を返す。color=null は元に戻す(消しゴム)。
export function paint(ed, cell, color, stroke = null) {
  const verdict = color === null ? (ed.colors[cell] === null ? PAINT.SAME : PAINT.FREE) : judge(ed, cell, color);
  if (verdict === PAINT.OK || verdict === PAINT.FREE) {
    if (stroke) stroke.push([cell, ed.colors[cell]]);
    setCell(ed, cell, color);
  }
  return verdict;
}

export function beginStroke(ed) {
  const s = [];
  ed.history.push(s);
  return s;
}

export function endStroke(ed) {
  if (ed.history.length && ed.history.at(-1).length === 0) ed.history.pop();
}

export function undo(ed) {
  const s = ed.history.pop();
  if (!s) return false;
  for (let i = s.length - 1; i >= 0; i--) setCell(ed, s[i][0], s[i][1]);
  return true;
}

// 塗った結果としての明暗ビット(どっちつかずは元と逆とみなす = 最悪側)。
export function effectiveBits(ed) {
  const { bits } = ed.qr;
  return bits.map((b, cell) => (isError(ed, cell, ed.colors[cell]) ? 1 - b : b));
}

export function summary(ed) {
  const blocks = ed.t.map((t, i) => ({ damaged: ed.blockDamage[i], safe: ed.safe[i], t }));
  const left = blocks.reduce((s, b) => s + Math.max(0, b.safe - b.damaged), 0);
  const painted = ed.colors.filter((c) => c !== null).length;
  const flipped = ed.colors.reduce((s, c, cell) => s + (isError(ed, cell, c) ? 1 : 0), 0);
  const worst = Math.max(...blocks.map((b) => (b.t ? b.damaged / b.t : 0)));
  return { blocks, left, painted, flipped, worst };
}
