/**
 * ตัวอย่างใน README ต้องรันได้จริง
 *
 * ก๊อปมาตรงตัวจาก README.md ของ repo — ถ้าแก้ที่ใดที่หนึ่งแล้วอีกที่ไม่ตาม เทสต์นี้จะแดง
 * README ที่ตัวอย่างรันไม่ได้แย่กว่าไม่มี README
 */
import { describe, it, expect } from 'vitest';
import { run } from '../src/index.js';
import type { RunParams } from '../src/types.js';

const example: RunParams = {
  model: 'gauss',
  fires: [{
    pts: [[0, 0]],
    side: 490,
    fuelKg: 90_000, totalG: 855_000,
    smold: 0.4,
    rai: 150,
  }],
  hours: [{
    t: '2026-03-01T10:00', dt: 3600,
    ws: 2.1, wdir: 225,
    stab: 'C', mix: 900,
    precip: 0, temp: 31, rh: 45,
  }],
  weights: [1], progress: [1],
  grid: { N: 180, R: 10_000, cx: 0, cy: 0 },
  receptors: [[1200, -300]],
  bg: 25, avg: 60, depo: true, reqId: 1,
};

describe('ตัวอย่างใน README', () => {
  const res = run(example);

  it('คืนผลที่ใช้ได้ ไม่โยน ไม่มี NaN', () => {
    expect(res.reqId).toBe(1);
    expect(res.grids).toHaveLength(1);
    expect(res.grids[0]).toHaveLength(180 * 180);
    expect([...res.grids[0]].every(Number.isFinite)).toBe(true);
  });

  it('ฟิลด์ที่ README อ้างถึงมีจริงและเป็นตัวเลขที่สมเหตุสมผล', () => {
    expect(res.perHour[0].max).toBeGreaterThan(0);
    expect(res.perHour[0].max).toBeLessThan(1e5);
    expect(res.recPerHour[0][0]).toBeGreaterThanOrEqual(0);
    expect(res.cell).toBeCloseTo(2 * 10_000 / 180, 9);
  });

  it('ตัวเลขที่ README บอกว่ามาจากอินพุตตรงกัน', () => {
    expect(res.totalEmitKg).toBeCloseTo(855, 3);        // 855,000 g = 855 kg
    expect(res.totalFuelT).toBeCloseTo(90, 3);          // 90,000 kg = 90 t
  });

  it('ควันไปทางตะวันออกเฉียงเหนือเมื่อลมมาจาก 225 องศา', () => {
    expect(res.meanUx).toBeGreaterThan(0);
    expect(res.meanUy).toBeGreaterThan(0);
  });

  it('โหมด puff ตามตัวอย่างในหัวข้อภูมิประเทศก็รันได้', () => {
    const N = example.grid.N;
    const elev = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
      elev[j * N + i] = 400 + 500 * Math.sin(i / N * Math.PI);
    const r2 = run({ ...example, model: 'puff', elev });
    expect(r2.model).toBe('puff');
    expect([...r2.grids[0]].every(Number.isFinite)).toBe(true);
    expect(r2.perHour[0].Fr).toBeGreaterThan(0);
    expect(r2.perHour[0].relief).toBeGreaterThan(0);
  });
});
