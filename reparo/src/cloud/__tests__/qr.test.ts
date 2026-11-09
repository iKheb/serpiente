import { describe, expect, it } from 'vitest';
import { encodeQr, __qrInternals as I, type QrCode, type QrEcc } from '../qr';

const FORMAT_ECC: Record<number, QrEcc> = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

function bchValid(bits15: number): boolean {
  const data = bits15 >>> 10;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) === bits15;
}

/** Lector mínimo: formato → desenmascarar → zigzag → desintercalar → síndromes RS → modo byte. */
function readQr(qr: QrCode): { text: string; ecc: QrEcc; mask: number } {
  const { size, modules: m } = qr;
  const bit = (x: number, y: number) => (m[y][x] ? 1 : 0);
  // Copia 1 del formato (alrededor del buscador superior izquierdo).
  let f1 = 0;
  const pos1: [number, number][] = [];
  for (let i = 0; i <= 5; i++) pos1.push([8, i]);
  pos1.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) pos1.push([14 - i, 8]);
  pos1.forEach(([x, y], i) => (f1 |= bit(x, y) << i));
  // Copia 2.
  let f2 = 0;
  for (let i = 0; i < 8; i++) f2 |= bit(size - 1 - i, 8) << i;
  for (let i = 8; i < 15; i++) f2 |= bit(8, size - 15 + i) << i;
  expect(f1).toBe(f2);
  expect(bit(8, size - 8)).toBe(1); // módulo oscuro fijo
  const fmt = f1 ^ 0x5412;
  expect(bchValid(fmt)).toBe(true);
  const ecc = FORMAT_ECC[fmt >>> 13];
  const mask = (fmt >>> 10) & 7;

  const ver = (size - 17) / 4;
  const isFn = I.functionMask(ver);
  const raw = Math.floor(I.numRawDataModules(ver) / 8);
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!isFn[y][x]) bits.push((m[y][x] !== I.maskBit(mask, x, y)) ? 1 : 0);
      }
    }
  }
  const codewords: number[] = [];
  for (let i = 0; i < raw; i++) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i * 8 + k];
    codewords.push(b);
  }
  const nb = I.numBlocks(ver, ecc);
  const eccLen = I.eccCodewordsPerBlock(ver, ecc);
  const numShort = nb - (raw % nb);
  const shortLen = Math.floor(raw / nb);
  const blocks: number[][] = Array.from({ length: nb }, () => []);
  let k = 0;
  for (let i = 0; i < shortLen + 1; i++) {
    for (let j = 0; j < nb; j++) {
      if (i === shortLen - eccLen && j < numShort) continue;
      blocks[j].push(codewords[k++]);
    }
  }
  expect(k).toBe(raw);
  const data: number[] = [];
  for (const [j, b] of blocks.entries()) {
    const dataLen = shortLen - eccLen + (j < numShort ? 0 : 1);
    // Síndromes: el polinomio del bloque debe anularse en α^0..α^(eccLen-1).
    let alpha = 1;
    for (let s = 0; s < eccLen; s++) {
      let acc = 0;
      for (const c of b) acc = I.gfMul(acc, alpha) ^ c;
      expect(acc).toBe(0);
      alpha = I.gfMul(alpha, 2);
    }
    data.push(...b.slice(0, dataLen));
  }
  const bitAt = (i: number) => (data[i >>> 3] >>> (7 - (i & 7))) & 1;
  const readBits = (start: number, n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | bitAt(start + i);
    return v;
  };
  expect(readBits(0, 4)).toBe(0b0100);
  const cb = ver <= 9 ? 8 : 16;
  const len = readBits(4, cb);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = readBits(4 + cb + i * 8, 8);
  return { text: new TextDecoder().decode(out), ecc, mask };
}

describe('codificador QR', () => {
  it('versión 1-M de 21×21 con buscadores', () => {
    const qr = encodeQr('hola', 'M');
    expect(qr.version).toBe(1);
    expect(qr.size).toBe(21);
    // Esquinas de los tres buscadores oscuras, separador claro.
    for (const [x, y] of [[0, 0], [20, 0], [0, 20]]) expect(qr.modules[y][x]).toBe(true);
    expect(qr.modules[7][7]).toBe(false);
  });

  const samples: [string, QrEcc][] = [
    ['hola', 'M'],
    ['https://abcdefghijklmnopqrst.supabase.co', 'L'],
    ['Ñandú · reparación ✓', 'Q'],
    ['x'.repeat(150), 'H'],
    [`REPARO1.${'eyJ1IjoiYWJjZGVmZ2hpamtsbW5vcHFyc3QiLCJrIjoiZXlK'.repeat(8)}`, 'M'],
    ['y'.repeat(1200), 'M'],
  ];
  it.each(samples)('se lee de vuelta: %s (%s)', (text, ecc) => {
    const qr = encodeQr(text, ecc);
    const r = readQr(qr);
    expect(r.text).toBe(text);
    expect(r.ecc).toBe(ecc);
    expect(r.mask).toBe(qr.mask);
  });

  it('rechaza textos que no caben', () => {
    expect(() => encodeQr('z'.repeat(4000), 'H')).toThrow();
  });
});
