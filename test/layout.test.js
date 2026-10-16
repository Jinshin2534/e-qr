import { describe, it, expect } from 'vitest';
import { makeQR, readCodewords } from '../src/lib/qr.js';
import { codewordMap, KIND, sizeOf, alignmentCenters } from '../src/lib/layout.js';
import { getBlocks, correctable } from '../src/lib/blocks.js';
import { isCodeword } from '../src/lib/gf256.js';
import { readFormat } from '../src/lib/format.js';

const textOfLength = (n) => 'https://example.com/' + 'x'.repeat(Math.max(0, n - 20));

describe('符号語の配置表は実物の QR と一致する', () => {
  // 生成器が作った QR を自前の配置表で読み戻し、全ブロックが RS 符号語になっていることを確かめる。
  // 配置表やブロック表が1ビットでもずれていればシンドロームが 0 にならない。
  const cases = [];
  for (const ecl of ['L', 'M', 'Q', 'H']) for (const n of [5, 30, 80, 150, 300, 600]) cases.push([ecl, n]);
  it.each(cases)('%s / %i文字', (ecl, n) => {
    const qr = makeQR(textOfLength(n), ecl);
    const cws = readCodewords(qr.bits, qr.version, ecl, qr.mask);
    const blocks = getBlocks(qr.version, ecl);
    cws.forEach((cw, i) => expect(isCodeword(cw, blocks[i].ec)).toBe(true));
  });

  it('全ての版で、データ領域のビット数 = 符号語×8 + 余りビット', () => {
    const remainder = (v) => (v === 1 ? 0 : v <= 6 ? 7 : v <= 13 ? 0 : v <= 20 ? 3 : v <= 27 ? 4 : v <= 34 ? 3 : 0);
    for (let v = 1; v <= 40; v++) {
      const m = codewordMap(v, 'M');
      const total = getBlocks(v, 'M').reduce((s, b) => s + b.total, 0);
      const data = m.order.length;
      expect(data).toBe(total * 8 + remainder(v));
      expect(m.kinds.filter((k) => k === KIND.REMAINDER).length).toBe(remainder(v));
    }
  });

  it('位置合わせパターンの座標が規格表と一致する(抜き取り)', () => {
    expect(alignmentCenters(2)).toEqual([6, 18]);
    expect(alignmentCenters(7)).toEqual([6, 22, 38]);
    expect(alignmentCenters(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(alignmentCenters(36)).toEqual([6, 24, 50, 76, 102, 128, 154]);
    expect(alignmentCenters(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
    expect(sizeOf(40)).toBe(177);
  });

  it('形式情報からマスクと訂正レベルを読み戻せる', () => {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const qr = makeQR('hello', ecl);
      expect(readFormat(qr.bits, qr.size)).toMatchObject({ ecl, distance: 0 });
    }
  });
});

describe('訂正できる量', () => {
  it('小さい版は誤訂正よけの予備符号語ぶん減る', () => {
    expect(correctable(1, 'L')).toEqual([2]); // ec=7, p=3
    expect(correctable(1, 'H')).toEqual([8]); // ec=17, p=1
    expect(correctable(2, 'L')).toEqual([4]); // ec=10, p=2
    expect(correctable(5, 'H')).toEqual([11, 11, 11, 11]);
  });
});
