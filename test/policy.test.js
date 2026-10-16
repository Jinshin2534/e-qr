import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brushCells, lineCells, heartCells } from '../src/lib/shapes.js';

const LIB = join(import.meta.dirname, '../src/lib');
const files = readdirSync(LIB).filter((f) => f.endsWith('.js'));

describe('src/lib は純粋', () => {
  it.each(files)('%s は DOM を触らず、Math.random を使わない', (f) => {
    const src = readFileSync(join(LIB, f), 'utf8');
    expect(src).not.toMatch(/\b(document|window|navigator)\./);
    expect(src).not.toMatch(/Math\.random/);
  });
});

describe('筆と線', () => {
  it('筆は端で切れる', () => {
    expect(brushCells(0, 0, 3, 21).sort((a, b) => a - b)).toEqual([0, 1, 21, 22]);
    expect(brushCells(5, 5, 1, 21)).toEqual([110]);
  });
  it('速く動かしても線にすき間ができない', () => {
    const cells = lineCells([0, 0], [3, 7]);
    expect(cells.at(-1)).toEqual([3, 7]);
    let prev = [0, 0];
    for (const p of cells) {
      expect(Math.max(Math.abs(p[0] - prev[0]), Math.abs(p[1] - prev[1]))).toBe(1);
      prev = p;
    }
  });
  it('ハートは輪郭と内側に分かれ、重ならない', () => {
    const { inside, outline } = heartCells(29);
    expect(inside.length).toBeGreaterThan(50);
    expect(outline.length).toBeGreaterThan(20);
    expect(inside.some((c) => outline.includes(c))).toBe(false);
  });
});
