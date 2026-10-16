import { RS_BLOCK_TABLE } from './rsTable.js';

export const EC_LEVELS = ['L', 'M', 'Q', 'H'];

// 版・訂正レベルから RS ブロックの並びを返す。[{ total, data, ec }]
export function getBlocks(version, ecl) {
  const row = RS_BLOCK_TABLE[(version - 1) * 4 + EC_LEVELS.indexOf(ecl)];
  if (!row) throw new Error(`unknown version/ecl: ${version}-${ecl}`);
  const blocks = [];
  for (let i = 0; i < row.length; i += 3) {
    for (let k = 0; k < row[i]; k++) {
      blocks.push({ total: row[i + 1], data: row[i + 2], ec: row[i + 1] - row[i + 2] });
    }
  }
  return blocks;
}

// 誤り検出の予備として訂正に使わない符号語数 p(ISO/IEC 18004 表9 の注)。
// 小さい版では EC 符号語の一部を「誤訂正しないための保険」に回している。
export function misdecodeProtection(version, ecl) {
  if (version === 1) return { L: 3, M: 2, Q: 1, H: 1 }[ecl];
  if (version === 2 && ecl === 'L') return 2;
  if (version === 3 && ecl === 'L') return 1;
  return 0;
}

// ブロックごとに訂正できる符号語数 t = floor((ec - p) / 2)。
// 位置の分からない誤り(消失ではなく誤り)を前提にした値。
export function correctable(version, ecl) {
  const p = misdecodeProtection(version, ecl);
  return getBlocks(version, ecl).map((b) => Math.floor((b.ec - p) / 2));
}
