import { hexToRgb } from './color.js';
import { cellColor } from './editor.js';

// 色の格子を RGBA 画像にする(静穏域 quiet モジュールぶんの白い余白つき)。
export function renderRGBA(ed, scale = 8, quiet = 4) {
  const { size } = ed.qr;
  const w = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const [R, G, B] = hexToRgb(cellColor(ed, r * size + c));
    for (let y = 0; y < scale; y++) {
      let p = (((r + quiet) * scale + y) * w + (c + quiet) * scale) * 4;
      for (let x = 0; x < scale; x++, p += 4) { data[p] = R; data[p + 1] = G; data[p + 2] = B; }
    }
  }
  return { data, width: w, height: w };
}

// 決定的な擬似乱数(mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 印刷・撮影の劣化を真似る: センサーノイズ → ぼかし(ノイズも一緒に均される) → コントラスト低下 → 照明の傾き。
export function degrade(img, { blur = 1, contrast = 0.6, gradient = 50, noise = 40, seed = 1 } = {}) {
  const { width: w, height: h } = img;
  const rand = rng(seed);
  const noisy = new Float32Array(w * h * 3);
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const n = (rand() * 2 - 1) * noise;
    noisy[i * 3] = img.data[p] + n;
    noisy[i * 3 + 1] = img.data[p + 1] + n;
    noisy[i * 3 + 2] = img.data[p + 2] + n;
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, k = 0;
    for (let dy = -blur; dy <= blur; dy++) for (let dx = -blur; dx <= blur; dx++) {
      const yy = Math.min(h - 1, Math.max(0, y + dy)), xx = Math.min(w - 1, Math.max(0, x + dx));
      const q = (yy * w + xx) * 3;
      r += noisy[q]; g += noisy[q + 1]; b += noisy[q + 2]; k++;
    }
    const shade = gradient * (x / w - 0.5);
    const p = (y * w + x) * 4;
    out[p] = 128 + (r / k - 128) * contrast + shade;
    out[p + 1] = 128 + (g / k - 128) * contrast + shade;
    out[p + 2] = 128 + (b / k - 128) * contrast + shade;
    out[p + 3] = 255;
  }
  return { data: out, width: w, height: h };
}
