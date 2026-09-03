/**
 * ตรวจว่าสมการความเข้มข้นที่เขียนไว้**อนุรักษ์มวล**
 *
 * นี่ไม่ใช่การตรวจสอบเทียบค่าตรวจวัดจริง (ยังทำไม่ได้ ดู docs/model.md) แต่เป็นการตรวจ
 * ว่า**การเขียนโค้ดถูกต้อง** แยกจากคำถามว่าแบบจำลองตรงกับความจริงแค่ไหน
 * ข้อดีคือไม่ต้องพึ่งข้อมูลภายนอกและไม่ต้องเชื่อตัวเลขจากใคร — เป็นเอกลักษณ์ทางคณิตศาสตร์
 *
 * เอกลักษณ์ที่ใช้
 *   1. เมื่อควันคลุกเต็มชั้นผสมแล้ว การอินทิเกรตความเข้มข้นข้ามลม
 *      ∫ C dy = q / (u · L) เป๊ะ — คือมวลที่ปล่อยต่อวินาทีหารด้วยฟลักซ์ปริมาตร
 *      ถ้าค่าคงที่ normalisation ผิดแม้แต่ตัวเดียว ข้อนี้จะพลาดทันที
 *   2. กรณีทั่วไป ∫ C dy = q·v / (√(2π) · u · σz) โดย v คือผลรวมภาพสะท้อน
 *      สังเกตว่า σy หายไปจากผลลัพธ์ — เป็นการตรวจ 1/(2π σy σz) กับเทอมข้างลมพร้อมกัน
 */
import { describe, it, expect } from 'vitest';
import { concAt } from '../src/gaussian.js';
import { prep } from '../src/sources.js';
import { sigmas } from '../src/briggs.js';
import type { RunParams, HourWx } from '../src/types.js';

/** อินทิเกรตความเข้มข้นที่ระดับพื้นข้ามแนวลม ด้วยกฎสี่เหลี่ยมคางหมูละเอียด */
function crosswindIntegral(C: ReturnType<typeof prep>, x: number, halfWidth: number, n = 6000) {
  const dy = (2 * halfWidth) / n;
  let sum = 0;
  for (let k = 0; k <= n; k++) {
    const y = -halfWidth + k * dy;
    // แกน x ของโค้ดคือทิศท้ายลม ซึ่งตรงกับ (ux, uy) · แกน y ตรงกับ (vx, vy)
    const px = x * C.ux + y * C.vx;
    const py = x * C.uy + y * C.vy;
    const w = (k === 0 || k === n) ? 0.5 : 1;
    sum += w * concAt(C, px, py) * dy;
  }
  return sum;                                   // หน่วย µg/m³ · ม.
}

const hour = (over: Partial<HourWx> = {}): HourWx => ({
  t: '2026-03-01T10:00', dt: 3600, ws: 3, wdir: 270,
  stab: 'D', mix: 900, precip: 0, temp: 30, rh: 40, ...over,
});

/** ไฟจุดเดียว σy ตั้งต้นเล็ก เฟสเดียว เพื่อให้เทียบกับสูตรวิเคราะห์ได้ตรง */
function params(h: HourWx, over: Partial<RunParams> = {}): RunParams {
  return {
    fires: [{ pts: [[0, 0]], side: 40, fuelKg: 20_000, totalG: 190_000, smold: 0, rai: 40 }],
    hours: [h], weights: [1], progress: [0],
    grid: { N: 20, R: 5000, cx: 0, cy: 0 }, receptors: [],
    bg: 0, avg: 10, depo: false, reqId: 1, ...over,
  };
}

describe('อนุรักษ์มวล — เมื่อควันคลุกเต็มชั้นผสม', () => {
  // ชั้นผสมตื้นและระยะไกล ทำให้ σz > 1.6L เข้าสาขา "คลุกเต็มชั้น"
  const h = hour({ mix: 60, stab: 'B' });
  const P = params(h);
  const C = prep(P, h, 0);

  it('เข้าสาขาคลุกเต็มชั้นจริงที่ระยะที่ทดสอบ', () => {
    const [, sz] = sigmas(4000, C.st);
    expect(sz).toBeGreaterThan(1.6 * C.L);
  });

  it('∫C dy = q / (u·L) เป๊ะทุกระยะ — ค่าคงที่ normalisation ถูก', () => {
    // รวม q/u ของทุกชั้นความสูง (โจทย์นี้มีชั้นเดียวเพราะ smold = 0)
    let expect_ = 0;
    for (const g of C.groups)
      for (const Ly of g.layers) expect_ += (Ly.q * g.pts.length) / (Ly.u * C.L);
    expect_ *= 1e6 * C.tf;                      // 1e6 = g/m³ -> µg/m³

    for (const x of [3000, 4000, 5000]) {
      const got = crosswindIntegral(C, x, 4000);
      expect(got / expect_, `ที่ ${x} ม.`).toBeCloseTo(1, 3);
    }
  });
});

describe('อนุรักษ์มวล — กรณีทั่วไปพร้อมภาพสะท้อน', () => {
  const h = hour({ mix: 900, stab: 'D' });
  const P = params(h);
  const C = prep(P, h, 0);

  it('∫C dy ตรงกับสูตรวิเคราะห์ q·v / (√(2π)·u·σz) — σy หายไปจากผลลัพธ์', () => {
    for (const x of [500, 1500, 3000]) {
      const [, sz] = sigmas(x, C.st);
      expect(sz, `ที่ ${x} ม. ต้องยังไม่เข้าสาขาคลุกเต็มชั้น`).toBeLessThanOrEqual(1.6 * C.L);

      let want = 0;
      for (const g of C.groups) for (const Ly of g.layers) {
        let v = 0;
        for (let n = -2; n <= 2; n++) {
          const a = (-Ly.H + 2 * n * C.L) / sz, b = (Ly.H + 2 * n * C.L) / sz;
          v += Math.exp(-0.5 * a * a) + Math.exp(-0.5 * b * b);
        }
        want += (Ly.q * g.pts.length) * v / (Math.sqrt(2 * Math.PI) * Ly.u * sz);
      }
      want *= 1e6 * C.tf;

      const got = crosswindIntegral(C, x, 3000);
      expect(got / want, `ที่ ${x} ม.`).toBeCloseTo(1, 2);
    }
  });
});

describe('อนุรักษ์มวล — การกำจัดออกต้องลดมวล ไม่ใช่เพิ่ม', () => {
  it('เปิดการตกสะสมแห้งแล้วมวลที่เหลือต้องน้อยลง และไม่ติดลบ', () => {
    const h = hour({ mix: 60, stab: 'B' });
    const off = prep(params(h, { depo: false }), h, 0);
    const on  = prep(params(h, { depo: true }),  h, 0);
    const a = crosswindIntegral(off, 4000, 4000);
    const b = crosswindIntegral(on,  4000, 4000);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0);
  });

  it('ฝนชะยิ่งแรงยิ่งเหลือน้อย', () => {
    const dry = hour({ mix: 60, stab: 'B', precip: 0 });
    const wet = hour({ mix: 60, stab: 'B', precip: 12 });
    const a = crosswindIntegral(prep(params(dry, { depo: true }), dry, 0), 4000, 4000);
    const b = crosswindIntegral(prep(params(wet, { depo: true }), wet, 0), 4000, 4000);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0);
  });
});
