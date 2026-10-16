// 形式情報(訂正レベル2ビット+マスク3ビット、BCH(15,5)、XOR 0x5412)とマスク。

const ECL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

function bch(data) {
  let d = data << 10;
  const g = 0x537;
  for (let i = 14; i >= 10; i--) if (d & (1 << i)) d ^= g << (i - 10);
  return (data << 10) | d;
}

export function formatCode(ecl, mask) {
  return bch((ECL_BITS[ecl] << 3) | mask) ^ 0x5412;
}

// 左上側の形式情報のモジュール位置(ビット i ごと)。
export function formatPositions(size) {
  const pos = [];
  for (let i = 0; i < 15; i++) {
    if (i < 6) pos.push([i, 8]);
    else if (i < 8) pos.push([i + 1, 8]);
    else pos.push([size - 15 + i, 8]);
  }
  return pos;
}

export function readFormat(bits, size) {
  let v = 0;
  formatPositions(size).forEach(([r, c], i) => { if (bits[r * size + c]) v |= 1 << i; });
  let best = null;
  for (const ecl of Object.keys(ECL_BITS)) for (let mask = 0; mask < 8; mask++) {
    let x = formatCode(ecl, mask) ^ v, d = 0;
    while (x) { d += x & 1; x >>= 1; }
    if (!best || d < best.distance) best = { ecl, mask, distance: d };
  }
  return best;
}

export const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0,
];
