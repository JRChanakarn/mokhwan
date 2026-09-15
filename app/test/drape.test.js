import { describe, it, expect } from 'vitest';
import { elevAt } from '../src/map3d/three/drape.js';

const N = 4, R = 200, cell = 2 * R / N;
const res = { N, cell, cx: 0, cy: 0, R };
// ความสูงไล่ตาม i: 0,10,20,30 ทุกแถว
const raw = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) raw[j * N + i] = i * 10;

describe('elevAt', () => {
  it('ตรงศูนย์กลางเซลล์ได้ค่าของเซลล์นั้นเป๊ะ', () => {
    expect(elevAt(raw, res, -R + 0.5 * cell, 0)).toBeCloseTo(0, 5);
    expect(elevAt(raw, res, -R + 2.5 * cell, 0)).toBeCloseTo(20, 5);
  });
  it('ระหว่างเซลล์ได้ค่าเฉลี่ยเชิงเส้น', () => {
    expect(elevAt(raw, res, -R + 1.5 * cell, 0)).toBeCloseTo(10, 5);
    expect(elevAt(raw, res, -R + 2.0 * cell, 0)).toBeCloseTo(15, 5);
  });
  it('นอกโดเมนถูกหนีบไว้ที่ขอบ ไม่คืน NaN', () => {
    expect(elevAt(raw, res, -1e6, 0)).toBeCloseTo(0, 5);
    expect(elevAt(raw, res, 1e6, 0)).toBeCloseTo(30, 5);
    expect(Number.isFinite(elevAt(raw, res, 0, 1e6))).toBe(true);
  });
  it('ไม่มี DEM คืนศูนย์ ไม่พัง', () => {
    expect(elevAt(null, res, 0, 0)).toBe(0);
  });
  it('แกน j เพิ่มลงทางใต้ — ต้องไม่สลับเหนือใต้', () => {
    const g = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) g[j * N + i] = j * 10;
    // j=0 อยู่เหนือสุด y = cy + R - 0.5·cell
    expect(elevAt(g, res, 0, R - 0.5 * cell)).toBeCloseTo(0, 5);
    expect(elevAt(g, res, 0, -R + 0.5 * cell)).toBeCloseTo(30, 5);
  });
});
