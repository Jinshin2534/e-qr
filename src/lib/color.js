// 読み取り機は色を見ない。グレースケールにして明暗の2値にするだけ。
// なので「元のモジュールと同じ側の明るさ」の色なら何色で塗ってもビットは変わらない。

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (x) => x + x) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// jsQR と同じ重み(ガンマ補正前の値にそのまま掛ける)の輝度 0–255。
export function luma(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 2値化のしきい値は周りの明るさで動くので、真ん中付近は「どっちつかず」として扱う。
export const DARK_MAX = 90;
export const LIGHT_MIN = 165;

// 1 = 暗, 0 = 明, -1 = どっちつかず(どちらのモジュールに塗っても壊したとみなす)
export function classify(hex) {
  const y = luma(hex);
  if (y <= DARK_MAX) return 1;
  if (y >= LIGHT_MIN) return 0;
  return -1;
}
