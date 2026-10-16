import jsQR from 'jsqr';
import { renderRGBA, degrade } from './render.js';

const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function read(img, expected) {
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  if (!res) return { ok: false, reason: '見つからない' };
  if (!sameBytes(res.binaryData, expected)) return { ok: false, reason: '別の内容に読めた', data: res.data };
  return { ok: true, data: res.data };
}

// 書き出す PNG の大きさ。検査の clean はこれと同じ画像を読ませる。
export const EXPORT_SCALE = 16;
export const EXPORT_QUIET = 4;

export const HARSH_SEEDS = [1, 2, 3];

// 2つの条件で jsQR に実際に読ませる。
//   clean: 書き出す画像そのもの
//   harsh: 1モジュール4pxに縮め、ノイズ・ぼかし・コントラスト低下・照明ムラを足したもの(実カメラの代役)。
//          乱数の種を変えて3回読ませ、全部通ったときだけ合格にする。
export const exportImage = (ed) => renderRGBA(ed, EXPORT_SCALE, EXPORT_QUIET);

export function verify(ed) {
  const clean = read(exportImage(ed), ed.qr.bytes);
  const small = renderRGBA(ed, 4, 4);
  const runs = HARSH_SEEDS.map((seed) => read(degrade(small, { seed }), ed.qr.bytes));
  const passed = runs.filter((r) => r.ok).length;
  const harsh = { ok: passed === runs.length, passed, total: runs.length, reason: runs.find((r) => !r.ok)?.reason };
  return { clean, harsh, ok: clean.ok && harsh.ok };
}
