import { getBlocks } from './blocks.js';

export const KIND = { DATA: 0, FINDER: 1, TIMING: 2, ALIGN: 3, FORMAT: 4, VERSION: 5, REMAINDER: 6 };

export const sizeOf = (version) => 17 + 4 * version;

// 位置合わせパターンの中心座標(行・列で共通)。
export function alignmentCenters(version) {
  if (version === 1) return [];
  const size = sizeOf(version);
  const n = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((size - 13) / (n - 1) / 2) * 2;
  const pos = [6];
  for (let i = n - 2; i >= 0; i--) pos.push(size - 7 - i * step);
  return pos;
}

// 各モジュールが何の領域かを返す(データ以外は塗り替えると読み取りの前提が崩れる)。
export function kindGrid(version) {
  const size = sizeOf(version);
  const g = new Uint8Array(size * size); // 0 = DATA
  const set = (r, c, k) => { if (r >= 0 && c >= 0 && r < size && c < size) g[r * size + c] = k; };

  // ファインダ+分離帯
  for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) set(r0 + r, c0 + c, KIND.FINDER);
  }
  // タイミング
  for (let i = 8; i < size - 8; i++) { set(6, i, KIND.TIMING); set(i, 6, KIND.TIMING); }
  // 位置合わせ(ファインダと重なるものは置かない)
  const ac = alignmentCenters(version);
  for (const r of ac) for (const c of ac) {
    if (g[r * size + c] === KIND.FINDER) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, KIND.ALIGN);
  }
  // 形式情報(2か所)と暗モジュール
  for (let i = 0; i <= 8; i++) {
    if (g[8 * size + i] !== KIND.TIMING) set(8, i, KIND.FORMAT);
    if (g[i * size + 8] !== KIND.TIMING) set(i, 8, KIND.FORMAT);
  }
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, KIND.FORMAT);
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, KIND.FORMAT);
  // 型番情報(7版以上)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      set(i, size - 11 + j, KIND.VERSION);
      set(size - 11 + j, i, KIND.VERSION);
    }
  }
  return g;
}

// データ領域のモジュールを、符号語のビットが置かれる順(右下から2列ずつジグザグ)に並べる。
export function placementOrder(version, kinds = kindGrid(version)) {
  const size = sizeOf(version);
  const order = [];
  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // 縦のタイミング列は飛ばす
    for (let k = 0; k < size; k++) {
      const r = upward ? size - 1 - k : k;
      for (const c of [right, right - 1]) {
        if (kinds[r * size + c] === KIND.DATA) order.push(r * size + c);
      }
    }
    upward = !upward;
  }
  return order;
}

// モジュール → (ブロック, ブロック内の符号語番号, ビット) の対応表。
// 符号語はブロック間でインタリーブされて置かれる(データ部 → EC部の順)。
export function codewordMap(version, ecl) {
  const size = sizeOf(version);
  const kinds = kindGrid(version);
  const order = placementOrder(version, kinds);
  const blocks = getBlocks(version, ecl);

  const seq = []; // 置かれる順の [block, index]
  const maxData = Math.max(...blocks.map((b) => b.data));
  const maxEc = Math.max(...blocks.map((b) => b.ec));
  for (let i = 0; i < maxData; i++) blocks.forEach((b, bi) => { if (i < b.data) seq.push([bi, i]); });
  for (let i = 0; i < maxEc; i++) blocks.forEach((b, bi) => { if (i < b.ec) seq.push([bi, b.data + i]); });

  // 全符号語に通し番号を振る(ブロック順・ブロック内順)
  const offsets = [];
  let acc = 0;
  for (const b of blocks) { offsets.push(acc); acc += b.total; }
  const cwBlock = new Int32Array(acc);
  blocks.forEach((b, bi) => { for (let i = 0; i < b.total; i++) cwBlock[offsets[bi] + i] = bi; });

  const cellCw = new Int32Array(size * size).fill(-1);
  const cellBit = new Int8Array(size * size).fill(-1);
  order.forEach((cell, k) => {
    const s = k >> 3;
    if (s < seq.length) {
      const [bi, i] = seq[s];
      cellCw[cell] = offsets[bi] + i;
      cellBit[cell] = 7 - (k & 7); // MSB から置く
    } else {
      kinds[cell] = KIND.REMAINDER; // 余りビット: 復号器は読まない
    }
  });

  return { size, kinds, blocks, offsets, cwBlock, cellCw, cellBit, order };
}
