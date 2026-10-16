// 筆の形と線の補間(純粋関数)。

// (r, c) を中心にした k×k の正方形のセル番号。
export function brushCells(r, c, k, size) {
  const out = [];
  const off = Math.floor((k - 1) / 2);
  for (let dr = 0; dr < k; dr++) for (let dc = 0; dc < k; dc++) {
    const rr = r - off + dr, cc = c - off + dc;
    if (rr >= 0 && cc >= 0 && rr < size && cc < size) out.push(rr * size + cc);
  }
  return out;
}

// 2点間をすき間なく結ぶセル列(ブレゼンハム)。始点は含めない。
export function lineCells([r0, c0], [r1, c1]) {
  const out = [];
  const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dc - dr, r = r0, c = c0;
  while (r !== r1 || c !== c1) {
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c += sc; }
    if (e2 < dc) { err += dc; r += sr; }
    out.push([r, c]);
  }
  return out;
}

// 中央に置いたハートの内側と輪郭(1セル幅)。
export function heartCells(size) {
  const R = size * 0.28;
  const cy = size / 2 - R * 0.15, cx = size / 2;
  const inHeart = (r, c) => {
    const x = (c + 0.5 - cx) / R, y = -(r + 0.5 - cy) / R;
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y <= 0;
  };
  const inside = [], outline = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!inHeart(r, c)) continue;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => !inHeart(r + dr, c + dc));
    (edge ? outline : inside).push(r * size + c);
  }
  return { inside, outline };
}
