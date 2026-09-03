import { describe, it, expect } from 'vitest';
import { windField } from '../src/index.js';
import { run } from '../src/index.js';
import { ALL_CASES } from './fixtures';
import type { HourWx } from '../src/types.js';

const N = 40, cell = 250;
const base = (o: Partial<HourWx> = {}): HourWx =>
  ({ t: 'x', dt: 3600, ws: 2, wdir: 90, stab: 'D', mix: 500, precip: 0, temp: null, rh: null, ...o });

/** กริดลมสม่ำเสมอ */
const uniform = (u: number, v: number) => ({
  windU: new Float32Array(N * N).fill(u), windV: new Float32Array(N * N).fill(v),
});

describe('windField รับสนามลมรายเซลล์', () => {
  it('ไม่ส่งกริด = พฤติกรรมเดิมทุกบิต', () => {
    const a = windField(null, N, cell, base());
    const b = windField(null, N, cell, base(uniform(2, 0) as any));
    // ลม 2 m/s จาก 90° (ตะวันออก) = พัดไปทางตะวันตก u = -2
    expect(a.u[0]).toBeCloseTo(-2, 6);
    expect(b.u[0]).toBeCloseTo(2, 6);          // กริดสั่งให้พัดไปทางตะวันออกแทน
  });

  it('พื้นราบ: ลมแต่ละเซลล์ตามกริดที่ให้ ไม่ใช่ค่าเดียวทั้งโดเมน', () => {
    const wu = new Float32Array(N * N), wv = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { wu[j * N + i] = i < N / 2 ? 3 : -3; wv[j * N + i] = 0; }
    const w = windField(null, N, cell, base({ windU: wu, windV: wv } as any));
    expect(w.u[0]).toBeCloseTo(3, 5);
    expect(w.u[N - 1]).toBeCloseTo(-3, 5);
  });

  it('มีภูมิประเทศ: ยังเบนตามภูมิประเทศทับสนามลมที่ให้', () => {
    const Z = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) Z[j * N + i] = 300 + i * 40;   // ลาดชันไปตะวันออก
    const flatWind = windField(null, N, cell, base(uniform(3, 0) as any));
    const terr = windField(Z, N, cell, base({ stab: 'F', ...uniform(3, 0) } as any));
    const k = (N / 2) * N + N / 2;
    expect(terr.relief).toBeGreaterThan(1000);
    expect(Math.abs(terr.v[k]), 'ลมถูกเบนให้มีองค์ประกอบเหนือ-ใต้').toBeGreaterThan(0.1);
    expect(Math.abs(flatWind.v[k])).toBeLessThan(1e-6);
  });

  it('Fr และ relief คำนวณจากความเร็วเฉลี่ยของกริด', () => {
    const Z = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) Z[j * N + i] = 300 + j * 30;
    const slow = windField(Z, N, cell, base({ stab: 'F', ...uniform(0.5, 0) } as any));
    const fast = windField(Z, N, cell, base({ stab: 'F', ...uniform(5, 0) } as any));
    expect(fast.Fr).toBeGreaterThan(slow.Fr);
  });
});

describe('run() กับสนามลมรายชั่วโมง', () => {
  it('ผลเปลี่ยนเมื่อใส่กริดลมที่พัดคนละทาง', () => {
    const P: any = structuredClone(ALL_CASES.puffFlat);
    const a = run(structuredClone(P));
    const n = P.grid.N;
    P.hours[0].windU = new Float32Array(n * n).fill(0);
    P.hours[0].windV = new Float32Array(n * n).fill(2);      // พัดไปทางเหนือ
    const b = run(P);
    expect(b.perHour[0].max).not.toBe(a.perHour[0].max);
  });

  it('ไม่กระทบโหมด gaussian (ใช้ลมค่าเดียวตามนิยาม)', () => {
    const P: any = structuredClone(ALL_CASES.dawnF);
    const a = run(structuredClone(P));
    const n = P.grid.N;
    P.hours[0].windU = new Float32Array(n * n).fill(9);
    P.hours[0].windV = new Float32Array(n * n).fill(9);
    expect(run(P).perHour[0].max).toBe(a.perHour[0].max);
  });
});
