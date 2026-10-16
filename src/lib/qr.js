import qrcode from 'qrcode-generator';
import { codewordMap } from './layout.js';
import { readFormat, MASKS } from './format.js';

export const utf8 = (s) => Array.from(new TextEncoder().encode(s));

// 文字列を UTF-8 のバイトモードで符号化する。bits[r*size+c] = 1 が暗。
export function makeQR(text, ecl = 'H') {
  const prev = qrcode.stringToBytes;
  qrcode.stringToBytes = utf8;
  try {
    const q = qrcode(0, ecl);
    q.addData(text, 'Byte');
    q.make();
    const size = q.getModuleCount();
    const bits = new Uint8Array(size * size);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) bits[r * size + c] = q.isDark(r, c) ? 1 : 0;
    const version = (size - 17) / 4;
    const { mask } = readFormat(bits, size);
    return { text, ecl, version, size, mask, bits, bytes: utf8(text) };
  } finally {
    qrcode.stringToBytes = prev;
  }
}

// マトリクスから符号語をブロックごとに読み出す(マスクを外した値)。
export function readCodewords(bits, version, ecl, mask, map = codewordMap(version, ecl)) {
  const { size, blocks, offsets, order, cellCw, cellBit } = map;
  const flat = new Uint8Array(offsets.at(-1) + blocks.at(-1).total);
  for (const cell of order) {
    const cw = cellCw[cell];
    if (cw < 0) continue;
    const r = Math.floor(cell / size), c = cell % size;
    const bit = bits[cell] ^ (MASKS[mask](r, c) ? 1 : 0);
    if (bit) flat[cw] |= 1 << cellBit[cell];
  }
  return blocks.map((b, i) => Array.from(flat.subarray(offsets[i], offsets[i] + b.total)));
}
