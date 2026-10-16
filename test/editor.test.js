import { describe, it, expect } from 'vitest';
import jsQR from 'jsqr';
import { createEditor, paint, judge, undo, beginStroke, endStroke, summary, effectiveBits, PAINT, BLACK, WHITE } from '../src/lib/editor.js';
import { KIND } from '../src/lib/layout.js';
import { readCodewords } from '../src/lib/qr.js';
import { classify } from '../src/lib/color.js';
import { verify } from '../src/lib/verify.js';
import { renderRGBA, degrade } from '../src/lib/render.js';
import { MAX_VERSION, createEditor as ce } from '../src/lib/editor.js';

const URL = 'https://example.com/e-qr';
const opposite = (ed, cell) => (ed.qr.bits[cell] ? WHITE : BLACK);
const dataCells = (ed) => [...ed.map.kinds.keys()].filter((c) => ed.map.kinds[c] === KIND.DATA);

// 全データセルを左上から順に反転させようとする(予算に止められるまで描き続ける)。
function floodFlip(ed) {
  for (const cell of dataCells(ed)) paint(ed, cell, opposite(ed, cell));
}

// 実際に符号語を読み戻して、元と違う符号語をブロックごとに数える。
function measuredDamage(ed) {
  const { version, ecl, mask, bits } = ed.qr;
  const a = readCodewords(bits, version, ecl, mask, ed.map);
  const b = readCodewords(effectiveBits(ed), version, ecl, mask, ed.map);
  return a.map((blk, i) => blk.filter((x, k) => x !== b[i][k]).length);
}

describe('色と明暗', () => {
  it('jsQR と同じ輝度で暗・明・どっちつかずに分ける', () => {
    expect(classify('#000000')).toBe(1);
    expect(classify('#1d2b6b')).toBe(1); // 紺
    expect(classify('#ffffff')).toBe(0);
    expect(classify('#ffd6e0')).toBe(0); // 桃
    expect(classify('#808080')).toBe(-1);
    expect(classify('#ff0000')).toBe(1); // 真っ赤は輝度54で「暗」側
    expect(classify('#00ff00')).toBe(0); // 緑は輝度182で「明」側
  });
});

describe('塗れる量の会計', () => {
  it('元と同じ明暗の色なら、どれだけ塗っても予算を使わない', () => {
    const ed = createEditor(URL, 'H');
    for (const cell of dataCells(ed)) paint(ed, cell, ed.qr.bits[cell] ? '#1d2b6b' : '#ffd6e0');
    const s = summary(ed);
    expect(s.flipped).toBe(0);
    expect(s.painted).toBe(dataCells(ed).length);
    expect(s.blocks.every((b) => b.damaged === 0)).toBe(true);
  });

  it('予算いっぱいで止まり、どのブロックも安全上限ちょうどになる', () => {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const ed = createEditor(URL + '/' + 'y'.repeat(60), ecl);
      floodFlip(ed);
      const s = summary(ed);
      s.blocks.forEach((b) => expect(b.damaged).toBe(b.safe));
      expect(s.left).toBe(0);
    }
  });

  it('帳簿上の「壊れた符号語数」は、実際に読み戻した符号語の差と一致する', () => {
    const ed = createEditor(URL + '/' + 'z'.repeat(120), 'Q');
    floodFlip(ed);
    expect(measuredDamage(ed)).toEqual(Array.from(ed.blockDamage));
  });

  it('既に壊した符号語の中なら、さらに反転しても予算は増えない', () => {
    const ed = createEditor(URL, 'H');
    const cell = dataCells(ed)[0];
    expect(paint(ed, cell, opposite(ed, cell))).toBe(PAINT.OK);
    const cw = ed.map.cellCw[cell];
    const sibling = dataCells(ed).find((c) => c !== cell && ed.map.cellCw[c] === cw);
    expect(judge(ed, sibling, opposite(ed, sibling))).toBe(PAINT.FREE);
    paint(ed, sibling, opposite(ed, sibling));
    expect(summary(ed).blocks[ed.map.cwBlock[cw]].damaged).toBe(1);
  });

  it('ファインダ・タイミング・形式情報の明暗は変えられない(同じ明暗の色はよい)', () => {
    const ed = createEditor(URL, 'H');
    const size = ed.qr.size;
    expect(paint(ed, 0, WHITE)).toBe(PAINT.LOCKED);          // ファインダの角(暗)
    expect(paint(ed, 0, '#5a1020')).toBe(PAINT.FREE);        // えんじなら暗のまま
    expect(paint(ed, 6 * size + 9, opposite(ed, 6 * size + 9))).toBe(PAINT.LOCKED); // タイミング
    expect(paint(ed, 8 * size + 0, opposite(ed, 8 * size))).toBe(PAINT.LOCKED);    // 形式情報
  });

  it('どっちつかずの灰色は、暗にも明にも「壊した」と数える', () => {
    const ed = createEditor(URL, 'H');
    const dark = dataCells(ed).find((c) => ed.qr.bits[c] === 1);
    const light = dataCells(ed).find((c) => ed.qr.bits[c] === 0 && ed.map.cellCw[c] !== ed.map.cellCw[dark]);
    paint(ed, dark, '#808080');
    paint(ed, light, '#808080');
    expect(summary(ed).flipped).toBe(2);
  });

  it('消しゴムと取り消しで予算が戻る', () => {
    const ed = createEditor(URL, 'H');
    const s = beginStroke(ed);
    for (const cell of dataCells(ed).slice(0, 200)) paint(ed, cell, opposite(ed, cell), s);
    endStroke(ed);
    expect(summary(ed).flipped).toBeGreaterThan(0);
    undo(ed);
    expect(summary(ed)).toMatchObject({ flipped: 0, painted: 0, left: summary(createEditor(URL, 'H')).left });

    const cell = dataCells(ed)[3];
    paint(ed, cell, opposite(ed, cell));
    paint(ed, cell, null);
    expect(Array.from(ed.blockDamage).every((d) => d === 0)).toBe(true);
  });
});

describe('実際の復号器(jsQR)で確かめる', () => {
  const texts = [URL, 'こんにちは、絵QR', 'https://example.com/' + 'a'.repeat(150)];

  it.each(texts)('安全上限いっぱいまで壊しても、きれいな画像も劣化画像も読める: %s', (text) => {
    for (const ecl of ['M', 'Q', 'H']) {
      const ed = createEditor(text, ecl);
      floodFlip(ed);
      const v = verify(ed);
      expect(v.clean.ok).toBe(true);
      expect(v.harsh.ok).toBe(true);
    }
  });

  it('理論限界 t ちょうどまで壊しても、きれいな画像なら jsQR は読める', () => {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const ed = createEditor(texts[2], ecl, 1.0);
      floodFlip(ed);
      expect(Array.from(ed.blockDamage)).toEqual(ed.t);
      expect(verify(ed).clean.ok).toBe(true);
    }
  });

  it('t を1つでも超えたブロックがあれば、jsQR は正しく読めない(限界は本物)', () => {
    for (const ecl of ['L', 'M', 'Q', 'H']) {
      const ed = createEditor(texts[2], ecl, 1.0);
      floodFlip(ed);
      // 会計を通さずに、ブロック0の無傷な符号語をもう1つ壊す
      const cell = dataCells(ed).find((c) => ed.map.cwBlock[ed.map.cellCw[c]] === 0 && ed.cwErr[ed.map.cellCw[c]] === 0);
      ed.colors[cell] = opposite(ed, cell);
      const img = renderRGBA(ed, 6, 4);
      const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      const bytes = ed.qr.bytes;
      const same = res && res.binaryData.length === bytes.length && res.binaryData.every((x, i) => x === bytes[i]);
      expect(same).toBeFalsy();
    }
  });

  it('何も描いていなければ当然読める', () => {
    expect(verify(createEditor(URL, 'L')).ok).toBe(true);
  });
});

describe('劣化画像の検査と安全マージン', () => {
  const readCount = (ed, opts, seeds = 20) => {
    let ok = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const img = degrade(renderRGBA(ed, 4, 4), { seed, ...opts });
      const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
      if (res) ok++;
    }
    return ok;
  };

  it('何も描かなければ、どの版でも劣化画像の検査に通る(検査そのものが不公平でない)', () => {
    for (let n = 1; n <= 190; n += 11) {
      const ed = createEditor('https://example.com/' + 'a'.repeat(n), 'H');
      expect(verify(ed).harsh.ok).toBe(true);
    }
  });

  it('理論限界まで描いた絵は強いボケで全滅し、半分で止めた絵は生き残る', () => {
    for (const ecl of ['M', 'H']) {
      const edge = createEditor('https://example.com/abcde', ecl, 1.0);
      const half = createEditor('https://example.com/abcde', ecl, 0.5);
      floodFlip(edge);
      floodFlip(half);
      expect(readCount(edge, { blur: 2 })).toBeLessThanOrEqual(2);
      expect(readCount(half, { blur: 2 })).toBeGreaterThanOrEqual(19);
    }
  });

  it(`${MAX_VERSION}版を超える長さは断る`, () => {
    expect(() => ce('x'.repeat(400), 'H')).toThrow(/長すぎ/);
    expect(() => ce('x'.repeat(5000), 'L')).toThrow(/長すぎ/);
    expect(() => ce('', 'L')).toThrow();
  });
});
