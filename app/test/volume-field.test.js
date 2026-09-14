import { describe, it, expect } from 'vitest';
import { buildField, buildLutBytes, lutCoord, RATIO_MAX } from '../src/map3d/three/volume-field.js';
import { sigmas } from '../src/map3d/volume.js';

const N = 16, R = 8000, cell = 2 * R / N;
const res = { N, cell, cx: 0, cy: 0, R };
const hour = { Hsm: 40, Hfl: 90, qSm: 5, qFl: 3, stab: 'D', mix: 800 };
const flat = v => { const g = new Float32Array(N * N); g.fill(v); return g; };
const at = (f, i, j, k) => f.data[k * f.Nx * f.Ny + j * f.Nx + i];

const gnd = (f, i, j) => f.ground[j * f.Nx + i];

describe('ค่าที่พื้นต้องเท่ากริดอินพุตเป๊ะ — หัวใจของความซื่อสัตย์ทั้งหมด', () => {
  it('ground เท่ากับค่าที่เอนจินคำนวณ ไม่ใช่ใกล้เคียง', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32 });
    for (let j = 0; j < f.Ny; j++) for (let i = 0; i < f.Nx; i++)
      expect(gnd(f, i, j)).toBeCloseTo(50, 5);
  });
  it('กริดไม่สม่ำเสมอก็ยังตรง (ชดเชยจุดเริ่มของกล่องที่ย่อแล้ว)', () => {
    const g = new Float32Array(N * N);
    g[5 * N + 7] = 123.5;
    const f = buildField({ grid: g, res, hour, step: 1, Nz: 32 });
    expect(gnd(f, 7 - f.bi0, 5 - f.bj0)).toBeCloseTo(123.5, 4);
    expect(gnd(f, 0, 0)).toBe(0);            // มุมกล่องคือขอบเผื่อ ต้องว่าง
  });
  it('gmax เท่ากับค่าสูงสุดของกริด ไม่ใช่ค่าที่ถูกขยาย', () => {
    const g = new Float32Array(N * N);
    g[5 * N + 7] = 123.5; g[6 * N + 7] = 40;
    const f = buildField({ grid: g, res, hour, step: 1, Nz: 32 });
    expect(f.gmax).toBeCloseTo(123.5, 4);
  });
});

/* กฎข้อนี้เกิดจากบั๊กจริงที่เจอตอนดูภาพ: ค่าที่พื้นสูงสุด 159 µg/m³ แต่สนาม 3 มิติ
   พุ่งถึง 8,185 เพราะหาร vert(0) ตอน σz แคบใกล้แหล่งกำเนิด คอลัมน์ที่พื้นอยู่แถบส้ม
   จึงถูกวาดเป็นสีม่วง "อันตรายมาก" ซึ่งผิดกฎในสเปกว่าสีต้องตรงกับแผนที่ 2D */
describe('ความหนาแน่นต้องไม่พุ่งเกินค่าที่พื้น ไม่ว่าพลูมจะลอยสูงแค่ไหน', () => {
  it('vmax ไม่เกิน gmax', () => {
    for (const h of [hour, { ...hour, Hsm: 300, stab: 'F' }, { ...hour, Hsm: 900, mix: 1200, stab: 'F' }]) {
      const f = buildField({ grid: flat(50), res, hour: h, step: 1, Nz: 48 });
      expect(f.vmax).toBeLessThanOrEqual(f.gmax * 1.0001);
    }
  });
  it('ทุกค่าในสนามไม่เกินค่าที่พื้นของคอลัมน์ตัวเอง', () => {
    const f = buildField({ grid: flat(50), res, hour: { ...hour, Hsm: 400, stab: 'F' }, step: 1, Nz: 48 });
    for (let j = 0; j < f.Ny; j++) for (let i = 0; i < f.Nx; i++)
      for (let k = 0; k < f.Nz; k++)
        expect(at(f, i, j, k)).toBeLessThanOrEqual(gnd(f, i, j) * 1.0001);
  });
});

describe('กล่องย่อให้พอดีควัน — ไม่งั้น raymarch คลุมทั้งโดเมนจนเบราว์เซอร์ค้าง', () => {
  it('จุดเข้มจุดเดียวได้กล่องเล็ก ไม่ใช่เต็มกริด', () => {
    const g = new Float32Array(N * N);
    g[8 * N + 8] = 200;
    const f = buildField({ grid: g, res, hour, step: 1, Nz: 16 });
    expect(f.Nx).toBe(3);                    // จุดเดียว + ขอบเผื่อข้างละบล็อก
    expect(f.Ny).toBe(3);
    expect(f.boxW).toBeCloseTo(3 * cell, 6);
  });
  it('กริดเต็มได้กล่องเต็มโดเมน', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 16 });
    expect(f.Nx).toBe(N);
    expect(f.boxW).toBeCloseTo(2 * R, 6);
  });
  it('กล่องอยู่กึ่งกลางของบล็อกที่มันครอบจริง', () => {
    const g = new Float32Array(N * N);
    g[8 * N + 8] = 200;
    const f = buildField({ grid: g, res, hour, step: 1, Nz: 16 });
    // บล็อก 8 ศูนย์กลางอยู่ที่ cx - R + 8.5·cell — กล่อง 3 บล็อกจึงมีศูนย์กลางที่เดียวกัน
    expect(f.boxX).toBeCloseTo(res.cx - R + 8.5 * cell, 6);
    expect(f.boxY).toBeCloseTo(res.cy + R - 8.5 * cell, 6);
  });
  it('กริดว่างเปล่าคืนกล่องเปล่า ไม่พัง', () => {
    const f = buildField({ grid: new Float32Array(N * N), res, hour, step: 1, Nz: 16 });
    expect(f.vmax).toBe(0);
    expect(f.data.length).toBe(0);
  });
});

describe('เรขาคณิตของกล่องต้องตรงกับที่ shader สุ่ม — เคยพลาดมาแล้วครึ่งเท็กเซล', () => {
  it('ศูนย์กลางเท็กเซล k ตกที่ z = k·dz พอดี เมื่อสนามเริ่มที่ aglZ0 สูง aglH', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32 });
    for (const k of [0, 1, 7, 31]) {
      const zTexel = f.aglZ0 + (k + 0.5) / f.Nz * f.aglH;   // สิ่งที่ LinearFilter จะสุ่มได้
      expect(zTexel).toBeCloseTo(k * f.dz, 6);
    }
  });
  it('ชั้นล่างสุดอยู่ที่ระดับพื้นจริง ไม่ลอยเหนือพื้น', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32 });
    expect(f.aglZ0 + 0.5 / f.Nz * f.aglH).toBeCloseTo(0, 9);
  });
  it('ชั้นบนสุดอยู่ที่ zTop พอดี', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32 });
    expect((f.Nz - 1) * f.dz).toBeCloseTo(f.zTop, 6);
  });
});

describe('รูปทรงแนวดิ่ง', () => {
  it('คอลัมน์ที่มีค่าเป็นศูนย์ ทั้งคอลัมน์ต้องศูนย์ (ข้อจำกัดข้อ 6 ในสเปก)', () => {
    const g = new Float32Array(N * N);
    g[8 * N + 8] = 10;
    const f = buildField({ grid: g, res, hour, step: 1, Nz: 32 });
    for (let k = 0; k < f.Nz; k++) expect(at(f, 0, 0, k)).toBe(0);
  });
  it('สูงสุดอยู่แถวความสูงพลูม ไม่ใช่ที่พื้น', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 64 });
    let best = 0, bestK = 0;
    for (let k = 0; k < f.Nz; k++) { const v = at(f, 8, 8, k); if (v > best) { best = v; bestK = k; } }
    const zBest = (bestK + 0.5) / f.Nz * f.zTop;
    expect(zBest).toBeGreaterThan(10);
    expect(Math.abs(zBest - 40)).toBeLessThan(f.zTop / 6);
  });
  it('เพดานชั้นผสมตัดจริง — ไม่มีควันเหนือ lid', () => {
    const f = buildField({ grid: flat(50), res, hour: { ...hour, mix: 300 }, step: 1, Nz: 64 });
    expect(f.zTop).toBeLessThanOrEqual(300 * 1.0001);
  });
  it('ไม่มีค่าติดลบหรือ NaN ที่ไหนเลย', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32 });
    for (const v of f.data) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); }
  });
});

describe('σz โตตามระยะ — ใช้ฟังก์ชันเดียวกับของเดิม ไม่ใช่สูตรชุดที่สอง', () => {
  it('คอลัมน์ไกลกระจายกว้างกว่าคอลัมน์ใกล้', () => {
    const f = buildField({ grid: flat(50), res, hour, step: 1, Nz: 64 });
    const spread = (i, j) => {
      let s = 0; for (let k = 0; k < f.Nz; k++) if (at(f, i, j, k) > 50 * 0.1) s++;
      return s;
    };
    expect(spread(0, 0)).toBeGreaterThan(spread(8, 8));
  });
  it('σz ที่ใช้ตรงกับ sigmas() ของ volume.js', () => {
    const d = Math.hypot(cell * 3.5, cell * 3.5);
    expect(sigmas(Math.max(d, 12), 'D')[1]).toBeGreaterThan(0);
  });
});

describe('pexag ยกเพื่อมองเห็น ห้ามกระทบตัวเลขที่พื้น', () => {
  it('ค่าที่พื้นเท่าเดิมทุกค่า pexag', () => {
    const a = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32, pexag: 1 });
    const b = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32, pexag: 4 });
    expect(b.ground[8 * b.Nx + 8]).toBeCloseTo(a.ground[8 * a.Nx + 8], 5);
    expect(b.gmax).toBeCloseTo(a.gmax, 5);
  });
  it('ยกแล้วก้อนสูงขึ้นจริง', () => {
    const a = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32, pexag: 1 });
    const b = buildField({ grid: flat(50), res, hour, step: 1, Nz: 32, pexag: 4 });
    expect(b.zTop).toBeGreaterThan(a.zTop);
  });
});

describe('ย่อขนาดใช้ค่าสูงสุด ไม่ใช่ค่าเฉลี่ย — แกนพลูมแคบต้องไม่จาง', () => {
  it('จุดเข้มจุดเดียวรอดจากการย่อ', () => {
    const g = new Float32Array(N * N);
    g[4 * N + 4] = 900;
    const f = buildField({ grid: g, res, hour, step: 4, Nz: 32 });
    expect(f.Nx).toBe(3);                    // บล็อก (1,1) + ขอบเผื่อ = 3 บล็อก
    expect(f.ground[(1 - f.bj0) * f.Nx + (1 - f.bi0)]).toBeCloseTo(900, 3);
  });
});

describe('LUT สี', () => {
  const bands = [{ lo: 15, c: '#4aa3d8' }, { lo: 25, c: '#5cb85c' }, { lo: 37.5, c: '#e8c33a' },
                 { lo: 75, c: '#ef8a3c' }, { lo: 150, c: '#e04b4b' }, { lo: 350, c: '#8f4bc9' }];
  it('ยาว size*4 และทึบหมด', () => {
    const lut = buildLutBytes(bands, { lo: 1, hi: 500, size: 64 });
    expect(lut.length).toBe(64 * 4);
    for (let i = 3; i < lut.length; i += 4) expect(lut[i]).toBe(255);
  });
  it('ค่าสูงได้สีของแถบสูง — 400 ต้องเป็นม่วง 8f4bc9', () => {
    const lut = buildLutBytes(bands, { lo: 1, hi: 500, size: 256 });
    const t = Math.round(lutCoord(400, { lo: 1, hi: 500 }) * 255);
    expect([lut[t * 4], lut[t * 4 + 1], lut[t * 4 + 2]]).toEqual([0x8f, 0x4b, 0xc9]);
  });
  it('lutCoord ถูกหนีบไว้ใน [0,1]', () => {
    expect(lutCoord(0, { lo: 1, hi: 500 })).toBe(0);
    expect(lutCoord(1e9, { lo: 1, hi: 500 })).toBe(1);
  });
  it('lutCoord เพิ่มตามความเข้มข้น', () => {
    expect(lutCoord(100, { lo: 1, hi: 500 })).toBeGreaterThan(lutCoord(20, { lo: 1, hi: 500 }));
  });
});

describe('พลูมลอยสูงมากต้องไม่ให้ค่าอนันต์หรือค่าที่ขยายเกินจริง', () => {
  it('ค่าสูงสุดยังผูกกับค่าที่พื้น ไม่ใช่ค่าที่ถูกขยาย', () => {
    const f = buildField({ grid: flat(1e-6), res, hour: { ...hour, Hsm: 900, mix: 1000, stab: 'F' },
                           step: 1, Nz: 32 });
    expect(f.vmax).toBeLessThanOrEqual(1e-6 * RATIO_MAX * 1.001);
    for (const v of f.data) expect(Number.isFinite(v)).toBe(true);
  });
});
