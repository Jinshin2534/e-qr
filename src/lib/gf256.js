// GF(2^8)(原始多項式 x^8+x^4+x^3+x^2+1 = 0x11d)。QR の Reed–Solomon が乗る体。

export const EXP = new Uint8Array(512);
export const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

// 符号語列を多項式(先頭が最高次)とみて x=α^i で評価する。
function evalAt(cws, i) {
  const a = EXP[i % 255];
  let y = 0;
  for (const c of cws) y = mul(y, a) ^ c;
  return y;
}

// QR の生成多項式の根は α^0 … α^(ec-1)。誤りがなければシンドロームは全部 0。
export function syndromes(cws, ecCount) {
  const s = [];
  for (let i = 0; i < ecCount; i++) s.push(evalAt(cws, i));
  return s;
}

export function isCodeword(cws, ecCount) {
  return syndromes(cws, ecCount).every((v) => v === 0);
}
